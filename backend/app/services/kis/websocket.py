import asyncio
import json
import logging
import websockets
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
                    
                    try:
                        data = json.loads(msg)
                    except json.JSONDecodeError:
                        continue 
                    
                    # 1. 실시간 데이터 (iv와 body가 존재)
                    iv = data.get("iv")
                    body = data.get("body")

                    if iv and body:
                        key = getattr(kis_auth, 'ws_aes_key', None)
                        if key:
                            try:
                                decrypted = aes_cbc_base64_dec(key, iv, body)
                                
                                # [핵심] JSON 파싱 시도 후 실패하면 텍스트 데이터 파싱
                                try:
                                    parsed = json.loads(decrypted)
                                except json.JSONDecodeError:
                                    # KIS 실시간 데이터는 '^' 또는 '|'로 구분된 텍스트일 수 있음
                                    values = decrypted.split('^')
                                    
                                    # 데이터 포맷을 JSON 객체로 변환하여 프론트엔드 포맷 맞춤
                                    if len(values) > 5:
                                        parsed = {
                                            # 공통: 0번째는 항상 종목코드(Full Code)
                                            "mksc_shrn_iscd": values[0], 
                                            "rsym": values[0], 
                                            
                                            # 국내주식(H0STCNT0): 2(현재가), 5(등락률)
                                            # 해외주식(HDFSCNT0): 11(현재가), 14(등락률) - (시장별로 다를 수 있어 안전하게 처리)
                                            "stck_prpr": values[2] if len(values) > 2 else "0",
                                            "prdy_ctrt": values[5] if len(values) > 5 else "0",
                                            
                                            # 해외주식용 필드 (가정)
                                            "last": values[11] if len(values) > 11 else values[2],
                                            "rate": values[14] if len(values) > 14 else values[5],
                                        }
                                    else:
                                        # 파싱 불가능한 경우 원본 전송
                                        parsed = {"type": "raw", "data": decrypted}

                                await self.broadcast(parsed)
                            except Exception as e:
                                logger.error(f"Decryption/Parsing failed: {e}")
                    else:
                        # 2. 시스템 메시지 (구독/해제 응답)
                        res_body = data.get('body', {})
                        msg_cd = res_body.get('msg_cd', '')

                        if msg_cd.startswith('OPSP'):
                            if msg_cd == 'OPSP0000':
                                logger.info(f"KIS WS: Subscribe Success")
                            elif msg_cd == 'OPSP0001':
                                logger.info(f"KIS WS: Unsubscribe Success")
                            elif msg_cd == 'OPSP0002':
                                logger.debug(f"KIS WS: Already Subscribed")
                            elif msg_cd == 'OPSP0003':
                                logger.debug(f"KIS WS: Target Not Found")
                            else:
                                logger.error(f"KIS WS Error: {data}")
                        else:
                            logger.info(f"System Msg: {data}")

                except websockets.exceptions.ConnectionClosed:
                    logger.warning("KIS WebSocket connection closed (inner).")
                    break
                except Exception as e:
                    logger.error(f"Message processing error: {e}")

        except Exception as e:
            logger.warning(f"Read loop stopped: {e}")
        
        finally:
            logger.info("Cleaning up WebSocket connection state.")
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