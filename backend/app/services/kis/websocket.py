import asyncio
import json
import logging
import websockets
import httpx # 환율 조회를 위해 추가
from core.config import settings
from core.decryption import aes_cbc_base64_dec
from services.kis.auth import kis_auth

logger = logging.getLogger(__name__)

class KisWebSocketManager:
    def __init__(self):
        self.url = settings.KIS_WS_URL
        self.approval_key = kis_auth.approval_key 
        self.websocket = None
        self.subscribed = []
        
        self.clients = set()
        self.running_task = None
        self.exchange_rate = 1430.0 # 기본 환율 (실패 시 대비)

    # [추가] 환율 업데이트 함수
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

    async def subscribe_items(self, items):
        await self.connect()
        
        # [추가] 구독할 때 환율도 최신으로 갱신
        await self.update_exchange_rate()

        if not self.approval_key:
            self.approval_key = await kis_auth.get_approval_key()

        current_keys = set((i['tr_id'], i['tr_key']) for i in self.subscribed)
        new_keys = set((i['tr_id'], i['tr_key']) for i in items)

        to_unsubscribe = [i for i in self.subscribed if (i['tr_id'], i['tr_key']) not in new_keys]
        to_subscribe = [i for i in items if (i['tr_id'], i['tr_key']) not in current_keys]

        # 구독 해제
        for item in to_unsubscribe:
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

        # 신규 구독
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

        self.subscribed = items
        logger.info(f"Updated subscriptions: Unsubscribed {len(to_unsubscribe)}, Subscribed {len(to_subscribe)}, Total {len(self.subscribed)}")

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
                        pass # 시스템 메시지 로그 생략
                    else:
                        if isinstance(msg, str) and '|' in msg:
                            parts = msg.split('|')
                            if len(parts) >= 4:
                                tr_id = parts[1]
                                raw_data = parts[3]
                                values = raw_data.split('^')
                                
                                parsed = None

                                # [국내주식] H0STCNT0
                                if tr_id == "H0STCNT0" and len(values) > 10:
                                    parsed = {
                                        "code": values[0], 
                                        "price": values[2], 
                                        "rate": values[5],
                                        "volume": values[13],
                                        "amount": values[14],
                                    }
                                
                                # [해외주식] HDFSCNT0 (환율 적용 추가!)
                                elif tr_id == "HDFSCNT0" and len(values) > 21:
                                    try:
                                        # 현재가를 실수형으로 변환 후 환율 곱하기
                                        price_usd = float(values[11])
                                        price_krw = price_usd * self.exchange_rate

                                        amount_usd = float(values[21])
                                        amount_krw = amount_usd * self.exchange_rate
                                        
                                        parsed = {
                                            "code": values[0],
                                            "price": str(int(price_krw)), # 원화는 소수점 버림
                                            "rate": values[14],
                                            "volume": values[20],
                                            "amount": str(int(amount_krw))
                                        }
                                    except ValueError:
                                        pass

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