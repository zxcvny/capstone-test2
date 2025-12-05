import asyncio
import json
import logging
import time

import httpx
import websockets

from core.config import settings
from services.kis.auth import kis_auth

logger = logging.getLogger(__name__)


class KisWebSocketManager:
    """
    KIS 실시간 WebSocket 단일 연결 + 다중 클라이언트 브로드캐스트 매니저
    - KIS와는 1개 소켓만 유지
    - 우리 서비스의 각 WebSocket 클라이언트는 콜백으로만 등록
    """

    def __init__(self):
        self.url = settings.KIS_WS_URL
        self.approval_key = kis_auth.approval_key
        self.websocket = None

        # KIS에 현재 구독 중인 종목 목록
        self.subscribed = []              # [{tr_id, tr_key}]
        self.subscribed_keys = set()      # {(tr_id, tr_key)}

        # 우리 서버에 붙어 있는 클라이언트 콜백들
        self.clients = set()

        self.running_task: asyncio.Task | None = None
        self.exchange_rate = 1430.0

        # 과도한 구독 요청 방지용
        self._last_subscribe_ts = 0.0
        self._subscribe_lock = asyncio.Lock()

    async def update_exchange_rate(self):
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get("https://open.er-api.com/v6/latest/USD")
                data = response.json()
                self.exchange_rate = data["rates"]["KRW"]
                logger.info(f"💱 Updated Exchange Rate: {self.exchange_rate} KRW/USD")
        except Exception as e:
            logger.error(f"Failed to fetch exchange rate: {e}")

    async def connect(self):
        if self.websocket is not None:
            return

        logger.info("Connecting to KIS WebSocket...")
        try:
            self.websocket = await websockets.connect(
                self.url,
                ping_interval=20,
                ping_timeout=20,
            )
            logger.info("✅ KIS WebSocket Connected")

            if not self.running_task or self.running_task.done():
                self.running_task = asyncio.create_task(self.read_loop())
        except Exception as e:
            logger.error(f"KIS WebSocket connection failed: {e}")
            self.websocket = None

    async def close(self):
        if self.websocket:
            try:
                await self.websocket.close()
            except Exception:
                pass
        self.websocket = None
        self.subscribed.clear()
        self.subscribed_keys.clear()
        if self.running_task:
            self.running_task.cancel()
            self.running_task = None

    async def _ensure_approval_key(self):
        if not self.approval_key:
            self.approval_key = await kis_auth.get_approval_key()

    async def subscribe_items(self, items):
        """
        KIS에 새 종목 구독 요청
        - 이미 구독한 (tr_id, tr_key)는 다시 보내지 않음
        - 너무 자주 호출되는 것을 방지하기 위해 간단한 디바운스
        """
        if not items:
            return

        await self.connect()
        # await self.update_exchange_rate()  # 필요시만 사용

        await self._ensure_approval_key()

        async with self._subscribe_lock:
            now = time.monotonic()
            # 너무 과도하게 호출되는 경우 약간 딜레이
            if now - self._last_subscribe_ts < 0.05:
                await asyncio.sleep(0.05)
            self._last_subscribe_ts = time.monotonic()

            current_keys = self.subscribed_keys

            to_subscribe = []
            for i in items:
                key = (i["tr_id"], i["tr_key"])
                if key not in current_keys:
                    to_subscribe.append(i)
                    current_keys.add(key)

            if not to_subscribe:
                return

            for item in to_subscribe:
                req = {
                    "header": {
                        "approval_key": self.approval_key,
                        "custtype": "P",
                        "tr_type": "1",  # 구독
                        "content-type": "utf-8",
                    },
                    "body": {
                        "input": {
                            "tr_id": item["tr_id"],
                            "tr_key": item["tr_key"],
                        }
                    },
                }

                if self.websocket:
                    try:
                        await self.websocket.send(json.dumps(req))
                    except Exception as e:
                        logger.error(f"Failed to send subscribe request: {e}")

                self.subscribed.append(item)

            logger.info(
                f"🔔 Added subscriptions: {len(to_subscribe)} items. Total: {len(self.subscribed)}"
            )

    async def unsubscribe_all(self):
        if not self.websocket:
            return

        await self._ensure_approval_key()

        for item in self.subscribed:
            req = {
                "header": {
                    "approval_key": self.approval_key,
                    "custtype": "P",
                    "tr_type": "2",  # 구독 해지
                    "content-type": "utf-8",
                },
                "body": {
                    "input": {
                        "tr_id": item["tr_id"],
                        "tr_key": item["tr_key"],
                    }
                },
            }
            try:
                await self.websocket.send(json.dumps(req))
            except Exception as e:
                logger.error(f"Failed to send unsubscribe request: {e}")

        self.subscribed.clear()
        self.subscribed_keys.clear()

    async def read_loop(self):
        """
        KIS WebSocket 으로부터 오는 모든 메시지를 수신해서
        파싱 후 self.broadcast() 호출
        """
        try:
            while True:
                if not self.websocket:
                    break

                try:
                    msg = await self.websocket.recv()
                except websockets.exceptions.ConnectionClosed:
                    logger.warning("KIS WebSocket closed, stopping read loop.")
                    break
                except Exception as e:
                    logger.error(f"KIS WebSocket recv error: {e}")
                    await asyncio.sleep(0.1)
                    continue

                # 암호화 데이터 or 시스템 메시지는 스킵
                data = None
                try:
                    data = json.loads(msg)
                except json.JSONDecodeError:
                    pass

                if data and "iv" in data and "body" in data:
                    # 암호화된 payload (사용 중이면 여기서 복호화 로직 추가)
                    continue
                if data and "header" in data:
                    # 구독 응답 등 제어 메시지
                    continue

                # 실데이터는 | 구분자, ^ 필드 구분
                if isinstance(msg, str) and "|" in msg:
                    parts = msg.split("|")
                    if len(parts) < 4:
                        continue

                    tr_id = parts[1]
                    raw_data = parts[3]
                    values = raw_data.split("^")

                    parsed = None

                    # 국내 체결
                    if tr_id == "H0STCNT0" and len(values) > 34:
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
                            "strength": values[18],
                        }

                    # 국내 호가 (10단)
                    elif tr_id == "H0STASP0" and len(values) > 42:
                        parsed = {
                            "type": "ask",
                            "code": values[0],
                            "time": values[1],
                        }
                        # 매도호가 1~10
                        for i in range(1, 11):
                            parsed[f"ask_price_{i}"] = values[2 + i]  # 3~12
                        # 매수호가 1~10
                        for i in range(1, 11):
                            parsed[f"bid_price_{i}"] = values[12 + i]  # 13~22
                        # 매도 잔량 1~10
                        for i in range(1, 10 + 1):
                            parsed[f"ask_remain_{i}"] = values[22 + i]  # 23~32
                        # 매수 잔량 1~10
                        for i in range(1, 10 + 1):
                            parsed[f"bid_remain_{i}"] = values[32 + i]  # 33~42

                    # 해외 체결 (미국, 환산 KRW 포함)
                    elif tr_id == "HDFSCNT0" and len(values) > 24:
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
                                "strength": values[24],
                            }
                        except ValueError:
                            parsed = None

                    # 해외 호가 (Best Bid/Ask만 제공, 1단)
                    elif tr_id == "HDFSASP0" and len(values) > 15:
                        # values 구조는 실제 스펙에 맞게 조정 필요
                        # 여기선 기본 1호가 + 1잔량만 사용
                        parsed = {
                            "type": "ask",
                            "code": values[0],
                            "time": values[1],
                            "ask_price_1": values[11],
                            "bid_price_1": values[13],
                            # 미국은 10단 호가 미제공 → 1단 잔량만 사용 가능 (예: VBID1, VASK1 매핑 필요)
                            # 필요한 경우 여기서 잔량 추가 매핑
                        }

                    if parsed:
                        await self.broadcast(parsed)

        except Exception as e:
            logger.error(f"KIS read_loop fatal error: {e}")
        finally:
            logger.info("KIS read_loop finished, cleaning up.")
            self.websocket = None
            self.running_task = None
            self.subscribed.clear()
            self.subscribed_keys.clear()

    def add_client(self, callback):
        """실시간 데이터 수신을 원하는 콜백 등록"""
        self.clients.add(callback)

    def remove_client(self, callback):
        self.clients.discard(callback)

    async def broadcast(self, data):
        """
        등록된 모든 클라이언트 콜백에 병렬로 데이터 전송
        - 어떤 클라이언트가 느려도 전체가 느려지지 않도록 asyncio.gather 사용
        """
        if not self.clients:
            return

        callbacks = list(self.clients)
        tasks = []
        for cb in callbacks:
            try:
                tasks.append(cb(data))
            except Exception:
                # 콜백 생성 자체가 실패하면 제거
                self.clients.discard(cb)

        if not tasks:
            return

        results = await asyncio.gather(*tasks, return_exceptions=True)
        # 에러 나는 콜백은 unregister
        for cb, result in zip(callbacks, results):
            if isinstance(result, Exception):
                self.clients.discard(cb)


kis_ws_manager = KisWebSocketManager()
