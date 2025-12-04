import httpx
import logging
from core.config import settings
from services.kis.auth import kis_auth

logger = logging.getLogger(__name__)

class StockDetailService:
    def __init__(self):
        pass
    async def get_stock_detail(self, market: str, code: str):
        pass