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

    def usd_to_krw(self, val):
        try:
            return str(int(float(val) * self.exchange_rate))
        except:
            return "0"

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
                                        "time": values[1],
                                        "price": values[2], 
                                        "rate": values[5],
                                        "volume": values[13],
                                        "amount": values[14],
                                        "vol": values[12],
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
                                        # 매도호가 1~10
                                        "ask_price_1": values[3],
                                        "ask_price_2": values[4],
                                        "ask_price_3": values[5],
                                        "ask_price_4": values[6],
                                        "ask_price_5": values[7],
                                        "ask_price_6": values[8],
                                        "ask_price_7": values[9],
                                        "ask_price_8": values[10],
                                        "ask_price_9": values[11],
                                        "ask_price_10": values[12],

                                        # 매수호가 1~10
                                        "bid_price_1": values[13],
                                        "bid_price_2": values[14],
                                        "bid_price_3": values[15],
                                        "bid_price_4": values[16],
                                        "bid_price_5": values[17],
                                        "bid_price_6": values[18],
                                        "bid_price_7": values[19],
                                        "bid_price_8": values[20],
                                        "bid_price_9": values[21],
                                        "bid_price_10": values[22],

                                        # 매도 잔량 ASKP_RSQN1~10
                                        "ask_remain_1": values[23],
                                        "ask_remain_2": values[24],
                                        "ask_remain_3": values[25],
                                        "ask_remain_4": values[26],
                                        "ask_remain_5": values[27],
                                        "ask_remain_6": values[28],
                                        "ask_remain_7": values[29],
                                        "ask_remain_8": values[30],
                                        "ask_remain_9": values[31],
                                        "ask_remain_10": values[32],

                                        # 매수 잔량 BIDP_RSQN1~10
                                        "bid_remain_1": values[33],
                                        "bid_remain_2": values[34],
                                        "bid_remain_3": values[35],
                                        "bid_remain_4": values[36],
                                        "bid_remain_5": values[37],
                                        "bid_remain_6": values[38],
                                        "bid_remain_7": values[39],
                                        "bid_remain_8": values[40],
                                        "bid_remain_9": values[41],
                                        "bid_remain_10": values[42],
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
                                            "time": values[7],
                                            "price": str(int(price_krw)),
                                            "rate": values[14],
                                            "volume": values[20],
                                            "amount": str(int(amount_krw)),
                                            "vol": values[19],
                                            "date": values[6],
                                            "open": str(int(open_krw)),
                                            "high": str(int(high_krw)),
                                            "low": str(int(low_krw)),
                                            "diff": str(int(diff_krw)),
                                            "strength": values[24]
                                        }
                                    except ValueError:
                                        pass
                                
                                elif tr_id == "HDFSASP0" and len(values) > 66:
                                    parsed = {
                                        "type": "ask",
                                        "code": values[1],   # SYMB (AAPL, TSLA 등)
                                        "time": values[6],   # KHMS (한국시간 HHMMSS)

                                         # 매수호가 PBIDx (USD → KRW)
                                        "bid_price_1": self.usd_to_krw(values[11]),
                                        "bid_price_2": self.usd_to_krw(values[17]),
                                        "bid_price_3": self.usd_to_krw(values[23]),
                                        "bid_price_4": self.usd_to_krw(values[29]),
                                        "bid_price_5": self.usd_to_krw(values[35]),
                                        "bid_price_6": self.usd_to_krw(values[41]),
                                        "bid_price_7": self.usd_to_krw(values[47]),
                                        "bid_price_8": self.usd_to_krw(values[53]),
                                        "bid_price_9": self.usd_to_krw(values[59]),
                                        "bid_price_10": self.usd_to_krw(values[65]),

                                        # 매도호가 PASKx (USD → KRW)
                                        "ask_price_1": self.usd_to_krw(values[12]),
                                        "ask_price_2": self.usd_to_krw(values[18]),
                                        "ask_price_3": self.usd_to_krw(values[24]),
                                        "ask_price_4": self.usd_to_krw(values[30]),
                                        "ask_price_5": self.usd_to_krw(values[36]),
                                        "ask_price_6": self.usd_to_krw(values[42]),
                                        "ask_price_7": self.usd_to_krw(values[48]),
                                        "ask_price_8": self.usd_to_krw(values[54]),
                                        "ask_price_9": self.usd_to_krw(values[60]),
                                        "ask_price_10": self.usd_to_krw(values[66]),

                                        # 매수 잔량 VBID1~10
                                        "bid_remain_1": values[13],
                                        "bid_remain_2": values[19],
                                        "bid_remain_3": values[25],
                                        "bid_remain_4": values[31],
                                        "bid_remain_5": values[37],
                                        "bid_remain_6": values[43],
                                        "bid_remain_7": values[49],
                                        "bid_remain_8": values[55],
                                        "bid_remain_9": values[61],
                                        "bid_remain_10": values[67],

                                        # 매도 잔량 VASK1~10
                                        "ask_remain_1": values[14],
                                        "ask_remain_2": values[20],
                                        "ask_remain_3": values[26],
                                        "ask_remain_4": values[32],
                                        "ask_remain_5": values[38],
                                        "ask_remain_6": values[44],
                                        "ask_remain_7": values[50],
                                        "ask_remain_8": values[56],
                                        "ask_remain_9": values[62],
                                        "ask_remain_10": values[68],
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