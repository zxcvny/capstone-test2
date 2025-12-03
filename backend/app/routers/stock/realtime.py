import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.kis.websocket import kis_ws_manager

router = APIRouter(prefix="/stocks/ws", tags=["Stocks WebSocket"])


# ---- 장 여부 판별---- 
def is_korea_market_open():
    now = datetime.datetime.now()
    if now.hour < 9:
        return False
    if now.hour == 15 and now.minute > 30:
        return False
    if now.hour >= 16:
        return False
    return True


def is_us_market_open():
    now = datetime.datetime.now()
    hour = now.hour
    return (hour >= 23 or hour < 6)


def check_market_open(item):
    if item["market"] == "domestic":
        return is_korea_market_open()
    return is_us_market_open()

# ---- TR 매핑 ----

DOMESTIC_TR_ID = "H0STCNT0"
OVERSEAS_TR_ID = "HDFSCNT0"

def detect_tr_id(market: str):
    return DOMESTIC_TR_ID if market == "domestic" else OVERSEAS_TR_ID

# ---- websocket ----
@router.websocket("/realtime")
async def ws_realtime(websocket: WebSocket):
    await websocket.accept()

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
        await kis_ws_manager.subscribe_items(subscribe_list)

        async def push(data):
            await websocket.send_json({ "type": "realtime", "data": data })

        try:
            await kis_ws_manager.receive_loop(push)
        except WebSocketDisconnect:
            await kis_ws_manager.unsubscribe_all()
            await kis_ws_manager.close()
        return
    
    closing_data = []
    for item in items:
        closing_data.append({
            "code": item["code"],
            "market": item["market"],
            "message": "market closed"
        })

    await websocket.send_json({ "type": "closed", "data": closing_data })
    await websocket.close()