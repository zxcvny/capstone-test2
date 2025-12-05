import datetime
import logging
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.kis.websocket import kis_ws_manager
from services.kis.stock_search import stock_search_service
from services.kis.stock_info import stock_info_service

router = APIRouter(prefix="/stocks/ws", tags=["Stocks WebSocket"])
logger = logging.getLogger(__name__)

# --- Helper Functions (유지) ---
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

DOMESTIC_TICK_TR_ID = "H0STCNT0"
DOMESTIC_ASK_TR_ID = "H0STASP0"
OVERSEAS_TICK_TR_ID = "HDFSCNT0"
OVERSEAS_ASK_TR_ID = "HDFSASP0"

def detect_tr_id(market: str, data_type: str = "tick"):
    # data_type이 'ask'면 호가 TR_ID, 아니면 체결가 TR_ID 반환
    if market == "domestic":
        return DOMESTIC_ASK_TR_ID if data_type == "ask" else DOMESTIC_TICK_TR_ID
    else:
        return OVERSEAS_ASK_TR_ID if data_type == "ask" else OVERSEAS_TICK_TR_ID

def get_market_type(market_code: str):
    if market_code in ["KOSPI", "KOSDAQ"]:
        return "domestic"
    return "overseas"

# --- WebSocket Endpoint ---
@router.websocket("/realtime")
async def ws_realtime(websocket: WebSocket):
    await websocket.accept()

    async def push_to_client(data):
        try:
            await websocket.send_json({ "type": "realtime", "data": data })
        except Exception:
            pass 

    kis_ws_manager.add_client(push_to_client)

    try:
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get("type", "subscribe")

            # [CASE 1] 일반 구독 요청
            if msg_type == "subscribe":
                items = msg.get("items", [])
                subscribe_list = []
                
                for i in items:
                    market_type = i.get("market", "domestic")
                    code = i.get("code")
                    if not code: continue

                    # [수정된 부분] 클라이언트 요청에 있는 type ("tick" 또는 "ask")을 사용
                    req_type = i.get("type", "tick") 
                    tr_id = detect_tr_id(market_type, req_type)
                    
                    tr_key = code

                    if market_type == "overseas":
                        if len(code) >= 5 and code[0] in ['D', 'R']:
                            tr_key = code 
                        else:
                            exch_code = i.get("excd", "NAS") 
                            tr_key = f"D{exch_code}{code}"

                    subscribe_list.append({"tr_id": tr_id, "tr_key": tr_key})
                
                if subscribe_list:
                    await kis_ws_manager.subscribe_items(subscribe_list)

            # [CASE 2] 검색 요청 (기존 코드 유지)
            elif msg_type == "search":
                keyword = msg.get("keyword")
                if not keyword: continue

                candidates = stock_search_service.search_stocks(keyword, limit=20)
                if not candidates:
                    await websocket.send_json({ "type": "search_result", "data": [] })
                    continue

                tasks = []
                domestic_markets = ["KOSPI", "KOSDAQ"]
                for stock in candidates:
                    if stock['market'] in domestic_markets:
                        tasks.append(stock_info_service._get_domestic_stock(stock['code']))
                    else:
                        tasks.append(stock_info_service._get_overseas_stock(stock['code'], exchange=stock['market']))
                
                prices = await asyncio.gather(*tasks)

                results = []
                new_subs = []

                for stock, price_data in zip(candidates, prices):
                    m_code = stock['market']
                    m_type = get_market_type(m_code)
                    m_label = "국내" if m_type == "domestic" else "해외"

                    if not price_data:
                        curr, rate = "-", "-"
                    else:
                        try:
                            curr = f"{int(float(price_data.get('price', 0))):,}원"
                        except:
                            curr = str(price_data.get('price', 0))
                        rate = f"{price_data.get('rate', '0.00')}%"

                    results.append({
                        "display_market": m_label,
                        "display_name": stock['name'],
                        "current_price": curr,
                        "change_rate": rate,
                        "market_code": m_code,
                        "stock_code": stock['code'],
                        "stock_name": stock['name']
                    })

                    # 검색 결과는 기본적으로 체결가(tick)만 구독
                    tr_id = detect_tr_id(m_type, "tick")
                    if m_type == "domestic":
                        tr_key = stock['code']
                    else:
                        tr_key = f"D{m_code}{stock['code']}"
                    
                    new_subs.append({"tr_id": tr_id, "tr_key": tr_key})

                await websocket.send_json({ "type": "search_result", "data": results })

                if new_subs:
                    await kis_ws_manager.subscribe_items(new_subs)

    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception as e:
        logger.error(f"WebSocket Error: {e}")
        try:
            await websocket.close()
        except:
            pass
    finally:
        kis_ws_manager.remove_client(push_to_client)

@router.websocket("/ws/stocks/{market}/{code}")
async def websocket_endpoint(websocket: WebSocket, market: str, code: str):
    await websocket.accept()
    
    # 1. 클라이언트별 콜백 함수 정의 (필터링 로직 포함)
    async def client_callback(data: dict):
        # 파싱된 데이터의 코드가 현재 연결된 코드와 일치할 때만 전송
        if data.get("code") == code:
            await websocket.send_json(data)

    # 2. Manager에 콜백 등록 (브로드캐스트 수신 대기)
    kis_ws_manager.add_client(client_callback)

    try:
        # 3. KIS 웹소켓에 구독 요청
        tr_id = "H0STCNT0" if market == "domestic" else "HDFSCNT0"
        
        # subscribe_items 메서드를 사용하여 구독 추가
        await kis_ws_manager.subscribe_items([
            {"tr_id": tr_id, "tr_key": code}
        ])
        
        # 4. 연결 유지 루프 (클라이언트 연결 끊김 감지용)
        while True:
            await websocket.receive_text() # 클라이언트에서 보내는 메시지 대기 (Ping 등)

    except WebSocketDisconnect:
        logger.info(f"🔌 WebSocket Disconnected: {code}")
    except Exception as e:
        logger.error(f"⚠️ WebSocket Error: {e}")
    finally:
        # 5. 연결 종료 시 Manager에서 콜백 제거
        kis_ws_manager.remove_client(client_callback)