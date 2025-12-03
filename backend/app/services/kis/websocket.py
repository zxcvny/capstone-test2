import json
import websockets
from core.config import settings
from core.decryption import aes_cbc_base64_dec
from services.kis.auth import kis_auth

class KisWebSocketManager:
    def __init__(self):
        self.url = settings.KIS_WS_URL
        self.approval_key = kis_auth.approval_key
        self.websocket = None
        self.subscribed = []  # 여러 종목 저장

    async def connect(self):
        if self.websocket is None:
            self.websocket = await websockets.connect(
                self.url,
                ping_interval=20,
                ping_timeout=20
            )
            await self.websocket.recv()  # 접속 응답

    async def close(self):
        if self.websocket:
            await self.websocket.close()
            self.websocket = None
            self.subscribed = []

    async def subscribe_items(self, items):
        """
        items = [
          { "tr_id": "H0STCNT0", "tr_key": "005930" },
          { "tr_id": "HDFSCNT0", "tr_key": "AAPL.O" }
        ]
        """
        await self.connect()

        for item in items:
            req = {
                "header": {
                    "approval_key": self.approval_key,
                    "custtype": "P",
                    "tr_type": "1",  # 등록
                    "content-type": "utf-8"
                },
                "body": {
                    "tr_id": item["tr_id"],
                    "tr_key": item["tr_key"]
                }
            }

            await self.websocket.send(json.dumps(req))
            await self.websocket.recv()  # 등록 응답

            self.subscribed.append(item)

    async def unsubscribe_all(self):
        if not self.websocket:
            return

        for item in self.subscribed:
            req = {
                "header": {
                    "approval_key": self.approval_key,
                    "custtype": "P",
                    "tr_type": "2",  # 해제
                    "content-type": "utf-8"
                },
                "body": {
                    "tr_id": item["tr_id"],
                    "tr_key": item["tr_key"]
                }
            }

            await self.websocket.send(json.dumps(req))
            await self.websocket.recv()

        self.subscribed = []

    async def receive_loop(self, callback):
        """
        지속적으로 실시간 데이터를 받고 해독한 후 callback에 전달
        callback(data) 형태로 호출됨
        """

        while True:
            msg = await self.websocket.recv()
            data = json.loads(msg)

            body = data.get("body", "")
            iv = data.get("iv", "")
            key = kis_auth.ws_aes_key

            # 암호화된 body → 복호화 → JSON
            try:
                decrypted = aes_cbc_base64_dec(key, iv, body)
                parsed = json.loads(decrypted)
            except:
                continue

            # FastAPI WebSocket broadcast 같은 곳으로 전달
            await callback(parsed)

kis_ws_manager = KisWebSocketManager()