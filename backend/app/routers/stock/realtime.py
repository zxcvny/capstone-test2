import datetime
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.kis.websocket import kis_ws_manager

router = APIRouter(prefix="/stocks/ws", tags=["Stocks WebSocket"])
logger = logging.getLogger(__name__)

# ... (is_korea_market_open, detect_tr_id 등 기존 함수는 그대로 둡니다) ...
def is_korea_market_open():
    now = datetime.datetime.now()
    if now.hour < 9: return False
    if now.hour == 15 and now.minute > 30: return False
    if now.hour >= 16: return False
    return True

def is_us_market_open():
    now = datetime.datetime.now()
    hour = now.hour
    return (hour >= 23 or hour < 6)

def check_market_open(item):
    if item["market"] == "domestic":
        return is_korea_market_open()
    return is_us_market_open()

DOMESTIC_TR_ID = "H0STCNT0"
OVERSEAS_TR_ID = "HDFSCNT0"

def detect_tr_id(market: str):
    return DOMESTIC_TR_ID if market == "domestic" else OVERSEAS_TR_ID

# ---- websocket ----
@router.websocket("/realtime")
async def ws_realtime(websocket: WebSocket):
    await websocket.accept()

    try:
        # 1. 프론트에서 구독할 목록 받기
        init_msg = await websocket.receive_json()
        items = init_msg.get("items", [])

        subscribe_list = [
            {
                "tr_id": detect_tr_id(i["market"]),
                "tr_key": i["code"]
            }
            for i in items
        ]

        any_open = any(check_market_open(i) for i in items)

        if any_open:
            # 2. 클라이언트로 데이터를 쏴줄 콜백 함수 정의
            async def push_to_client(data):
                try:
                    await websocket.send_json({ "type": "realtime", "data": data })
                except Exception:
                    pass 

            # 3. 매니저에 나(클라이언트) 등록
            kis_ws_manager.add_client(push_to_client)

            # 4. KIS 서버에 구독 요청 (recv 없이 전송만 함)
            await kis_ws_manager.subscribe_items(subscribe_list)

            try:
                # 5. 연결 유지 (클라이언트가 끊을 때까지 대기)
                while True:
                    # 클라이언트가 보내는 메시지는 없어도, 연결 유지를 위해 대기 필요
                    await websocket.receive_text()
            except WebSocketDisconnect:
                logger.info("Client disconnected")
            finally:
                # 6. 연결 끊기면 목록에서 제거
                kis_ws_manager.remove_client(push_to_client)
                # (선택) 마지막 사용자가 나가면 KIS 구독 해제하려면 여기서 호출
                # await kis_ws_manager.unsubscribe_all() 
        
        else:
            # 장 마감 처리
            closing_data = []
            for item in items:
                closing_data.append({
                    "code": item["code"],
                    "market": item["market"],
                    "message": "market closed"
                })

            await websocket.send_json({ "type": "closed", "data": closing_data })
            await websocket.close()

    except Exception as e:
        logger.error(f"WebSocket Error: {e}")
        try:
            await websocket.close()
        except:
            pass