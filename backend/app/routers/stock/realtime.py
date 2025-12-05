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

    # 클라이언트로 데이터 전송 헬퍼
    async def push_to_client(data):
        try:
            await websocket.send_json({ "type": "realtime", "data": data })
        except Exception:
            pass 

    # 1. 연결 즉시 매니저에 등록
    kis_ws_manager.add_client(push_to_client)

    try:
        while True:
            # 2. 클라이언트 메시지 대기 (구독 요청 or 검색 요청)
            msg = await websocket.receive_json()
            
            msg_type = msg.get("type", "subscribe") # 기본값은 구독으로 처리

            # [CASE 1] 일반 구독 요청 (초기 진입 등)
            if msg_type == "subscribe":
                items = msg.get("items", [])
                subscribe_list = []
                
                for i in items:
                    market_type = i.get("market", "domestic")
                    code = i.get("code")
                    if not code: continue

                    tr_id = detect_tr_id(market_type, "tick")
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

            # [CASE 2] 검색 요청 및 자동 구독
            elif msg_type == "search":
                keyword = msg.get("keyword")
                if not keyword: continue

                # (1) 검색 수행
                candidates = stock_search_service.search_stocks(keyword, limit=20)
                if not candidates:
                    await websocket.send_json({ "type": "search_result", "data": [] })
                    continue

                # (2) 현재가 병렬 조회
                tasks = []
                domestic_markets = ["KOSPI", "KOSDAQ"]
                for stock in candidates:
                    if stock['market'] in domestic_markets:
                        tasks.append(stock_info_service._get_domestic_stock(stock['code']))
                    else:
                        tasks.append(stock_info_service._get_overseas_stock(stock['code'], exchange=stock['market']))
                
                prices = await asyncio.gather(*tasks)

                # (3) 결과 포맷팅 & 구독 리스트 준비
                results = []
                new_subs = []

                for stock, price_data in zip(candidates, prices):
                    m_code = stock['market']
                    m_type = get_market_type(m_code)
                    m_label = "국내" if m_type == "domestic" else "해외"

                    # 가격 포맷팅
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
                        "display_name": f"{stock['name']}({stock['code']})",
                        "current_price": curr,
                        "change_rate": rate,
                        "market_code": m_code,
                        "stock_code": stock['code'],
                        "stock_name": stock['name']
                    })

                    # 구독 키 생성
                    tr_id = detect_tr_id(m_type, "tick")
                    if m_type == "domestic":
                        tr_key = stock['code']
                    else:
                        tr_key = f"D{m_code}{stock['code']}"
                    
                    new_subs.append({"tr_id": tr_id, "tr_key": tr_key})

                # (4) 검색 결과 전송
                await websocket.send_json({ "type": "search_result", "data": results })

                # (5) 검색된 종목들 실시간 구독 시작
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