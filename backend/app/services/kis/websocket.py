import asyncio
import json
import logging
import websockets
import httpx
from core.config import settings
from services.kis.auth import kis_auth

logger = logging.getLogger(__name__)

class KisWebSocketManager:
    def __init__(self):
        self.url = settings.KIS_WS_URL
        self.approval_key = kis_auth.approval_key 
        self.websocket = None
        self.subscribed = []  # 현재 구독 중인 종목 목록
        
        self.clients = set()
        self.running_task = None
        self.exchange_rate = 1430.0

    async def update_exchange_rate(self):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get("https://open.er-api.com/v6/latest/USD")
                data = response.json()
                self.exchange_rate = data['rates']['KRW']
                logger.info(f"💱 Updated Exchange Rate: {self.exchange_rate} KRW/USD")
        except Exception as e:
            logger.error(f"Failed to fetch exchange rate: {e}")

    async def connect(self):
        if self.websocket is None:
            logger.info("Connecting to KIS WebSocket...")
            try:
                self.websocket = await websockets.connect(
                    self.url,
                    ping_interval=20,
                    ping_timeout=20
                )
                logger.info("✅ KIS WebSocket Connected")
                
                if not self.running_task or self.running_task.done():
                    self.running_task = asyncio.create_task(self.read_loop())
            except Exception as e:
                logger.error(f"KIS WebSocket connection failed: {e}")
                self.websocket = None

    async def close(self):
        if self.websocket:
            await self.websocket.close()
            self.websocket = None
            self.subscribed = []
            if self.running_task:
                self.running_task.cancel()

    # [수정됨] 구독 목록을 "교체"하지 않고 "추가"하도록 변경
    async def subscribe_items(self, items):
        await self.connect()
        # await self.update_exchange_rate() # 너무 빈번한 호출 방지를 위해 필요시 주석 처리 혹은 캐싱 권장

        if not self.approval_key:
            self.approval_key = await kis_auth.get_approval_key()

        # 현재 이미 구독 중인 키들의 집합
        current_keys = set((i['tr_id'], i['tr_key']) for i in self.subscribed)
        
        # 요청 들어온 것들 중, 아직 구독하지 않은 것만 골라냄 (중복 구독 방지)
        to_subscribe = [i for i in items if (i['tr_id'], i['tr_key']) not in current_keys]

        # [삭제됨] to_unsubscribe 로직 제거 
        # (검색어 입력 시 상세페이지의 구독이 끊기는 문제 해결)

        # 신규 종목 구독 요청 전송
        for item in to_subscribe:
            req = {
                "header": {
                    "approval_key": self.approval_key,
                    "custtype": "P",
                    "tr_type": "1",
                    "content-type": "utf-8"
                },
                "body": {
                    "input": {
                        "tr_id": item["tr_id"],
                        "tr_key": item["tr_key"]
                    }
                }
            }
            if self.websocket:
                await self.websocket.send(json.dumps(req))
            
            # [추가] 메모리 상의 리스트에도 추가
            self.subscribed.append(item)

        if to_subscribe:
            logger.info(f"🔔 Added subscriptions: {len(to_subscribe)} items. Total: {len(self.subscribed)}")

    async def unsubscribe_all(self):
        if not self.websocket:
            return

        if not self.approval_key:
            self.approval_key = await kis_auth.get_approval_key()

        for item in self.subscribed:
            req = {
                "header": {
                    "approval_key": self.approval_key,
                    "custtype": "P",
                    "tr_type": "2",
                    "content-type": "utf-8"
                },
                "body": {
                    "input": {
                        "tr_id": item["tr_id"],
                        "tr_key": item["tr_key"]
                    }
                }
            }
            if self.websocket:
                await self.websocket.send(json.dumps(req))

        self.subscribed = []

    async def read_loop(self):
        try:
            while True:
                if not self.websocket:
                    break
                
                try:
                    msg = await self.websocket.recv()
                    
                    data = None
                    try:
                        data = json.loads(msg)
                    except json.JSONDecodeError:
                        pass 
                    
                    if data and "iv" in data and "body" in data:
                        pass
                    elif data and "header" in data:
                        pass 
                    else:
                        if isinstance(msg, str) and '|' in msg:
                            parts = msg.split('|')
                            if len(parts) >= 4:
                                tr_id = parts[1]
                                raw_data = parts[3]
                                values = raw_data.split('^')
                                
                                parsed = None

                                if tr_id == "H0STCNT0" and len(values) > 10:
                                    parsed = {
                                        "type": "tick",
                                        "code": values[0], 
                                        "price": values[2], 
                                        "rate": values[5],
                                        "volume": values[13],
                                        "amount": values[14],
                                        "date": values[33],
                                        "open": values[7],
                                        "high": values[8],
                                        "low": values[9],
                                        "diff": values[4],
                                        "strength": values[18]
                                    }

                                elif tr_id == "H0STASP0" and len(values) > 10:
                                    parsed = {
                                        "type": "ask",
                                        "code": values[0],
                                        "time": values[1],
                                        "ask_price_1": values[3],
                                        "ask_price_2": values[4],
                                        "ask_price_3": values[5],
                                        "ask_price_4": values[6],
                                        "ask_price_5": values[7],
                                        "bid_price_1": values[13],
                                        "bid_price_2": values[14],
                                        "bid_price_3": values[15],
                                        "bid_price_4": values[16],
                                        "bid_price_5": values[17],
                                    }
                                
                                elif tr_id == "HDFSCNT0" and len(values) > 21:
                                    try:
                                        price_usd = float(values[11])
                                        price_krw = price_usd * self.exchange_rate
                                        amount_usd = float(values[21])
                                        amount_krw = amount_usd * self.exchange_rate
                                        diff_usd = float(values[13])
                                        diff_krw = diff_usd * self.exchange_rate
                                        open_usd = float(values[8])
                                        open_krw = open_usd * self.exchange_rate
                                        high_usd = float(values[9])
                                        high_krw = high_usd * self.exchange_rate
                                        low_usd = float(values[10])
                                        low_krw = low_usd * self.exchange_rate
                                        
                                        parsed = {
                                            "type": "tick",
                                            "code": values[1],
                                            "price": str(int(price_krw)),
                                            "rate": values[14],
                                            "volume": values[20],
                                            "amount": str(int(amount_krw)),
                                            "date": values[6],
                                            "open": str(int(open_krw)),
                                            "high": str(int(high_krw)),
                                            "low": str(int(low_krw)),
                                            "diff": str(int(diff_krw)),
                                            "strength": values[24]
                                        }
                                    except ValueError:
                                        pass
                                
                                elif tr_id == "HDFSASP0" and len(values) > 10:
                                    parsed = {
                                        "type": "ask",
                                        "code": values[0],
                                        "time": values[1],
                                        "ask_price_1": values[11],
                                        "bid_price_1": values[13],
                                    }

                                if parsed:
                                    await self.broadcast(parsed)

                except websockets.exceptions.ConnectionClosed:
                    break
                except Exception:
                    pass

        except Exception:
            pass
        
        finally:
            self.websocket = None
            self.running_task = None
            self.subscribed = []

    def add_client(self, callback):
        self.clients.add(callback)

    def remove_client(self, callback):
        self.clients.discard(callback)

    async def broadcast(self, data):
        for callback in list(self.clients):
            try:
                await callback(data)
            except:
                pass

kis_ws_manager = KisWebSocketManager()