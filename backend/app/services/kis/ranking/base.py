import logging
import httpx
from core.config import settings
from services.kis.auth import kis_auth

logger = logging.getLogger(__name__)

class RankingBaseService:
    def __init__(self):
        self.base_url = settings.KIS_BASE_URL
        self.app_key = settings.KIS_APP_KEY
        self.app_secret = settings.KIS_SECRET_KEY

    async def get_headers(self, tr_id: str, cust_type: str = "P"):
        token = await kis_auth.get_access_token()
        return {
            "content-type": "application/json; charset=utf-8",
            "authorization": f"Bearer {token}",
            "appkey": self.app_key,
            "appsecret": self.app_secret,
            "tr_id": tr_id,
            "custtype": cust_type
        }
    
    async def fetch_api(self, path: str, tr_id: str, params: dict):
        headers = await self.get_headers(tr_id)
        url = f"{self.base_url}{path}"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=headers, params=params)
                response.raise_for_status()
                return response.json()
            except Exception as e:
                logger.error(f"⛔ API Error: {e}")
                return {"output": []}
            
    async def get_exchange_rate(self):
        url = "https://open.er-api.com/v6/latest/USD"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()
                return data['rates']['KRW']
            except Exception as e:
                logger.error(f"⛔ 환율 조회 실패: {e}")
                return 1430.0 # 실패 시 기본값