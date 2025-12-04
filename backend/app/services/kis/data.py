import httpx
import logging

from core.config import settings
from services.kis.auth import kis_auth

logger = logging.getLogger(__name__)

class KisDataService:
    def __init__(self):
        self.base_url = settings.KIS_BASE_URL

    async def get_headers(self, tr_id):
        token = await kis_auth.get_access_token()
        return {
            "content-type": "application/json; charset=utf-8",
            "authorization": f"Bearer {token}",
            "appkey": settings.KIS_APP_KEY,
            "appsecret": settings.KIS_SECRET_KEY,
            "tr_id": tr_id,
            "custtype": "P"
        }

    async def get_exchange_rate(self):
        """환율 조회"""
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get("https://open.er-api.com/v6/latest/USD")
                return res.json()['rates']['KRW']
        except:
            return 1430.0

    async def get_stock_chart(self, market: str, code: str, period_code: str = "D"):
        """
        일봉 차트 데이터 조회
        market: "KR" / "NAS"
        code: "005930" / "DNASAAPL"
        """
        # 1. 국내 주식 (FHKST03010100)
        if market == "KR":
            path = "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice"
            tr_id = "FHKST03010100"
            params = {
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": code,
                "FID_INPUT_DATE_1": "",
                "FID_INPUT_DATE_2": "",
                "FID_PERIOD_DIV_CODE": period_code,
                "FID_ORG_ADJ_PRC": "1"
            }
        
        # 2. 해외 주식 (HHDFS76240000)
        else:
            path = "/uapi/overseas-price/v1/quotations/dailyprice"
            tr_id = "HHDFS76240000"
            
            # [수정 핵심] DNASAAPL -> NAS, AAPL 로 분리!
            excd = "NAS"
            symb = code

            # 코드가 D+시장(3자리)+심볼 형태인 경우 파싱 (예: DNASAAPL, DNYSEG)
            if len(code) >= 5 and code[0] in ['D', 'R']:
                market_code = code[1:4] # NAS, NYS, AMS
                symb = code[4:]         # AAPL, EG
                
                if market_code == "NAS": excd = "NAS"
                elif market_code == "NYS": excd = "NYS"
                elif market_code == "AMS": excd = "AMS"
                elif market_code == "HKS": excd = "HKS"
                elif market_code == "TSE": excd = "TSE"
            
            # 만약 파싱되지 않았다면 인자로 들어온 market 값 참조
            elif market == "NYS": excd = "NYS"

            params = {
                "AUTH": "",
                "EXCD": excd,
                "SYMB": symb,   # 이제 AAPL만 들어갑니다
                "GUBN": "0",
                "BYMD": "",
                "MODP": "1"
            }

        headers = await self.get_headers(tr_id)
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(f"{self.base_url}{path}", headers=headers, params=params)
                data = response.json()
                
                output = data.get('output2') or data.get('output', [])
                
                if not output:
                    # 데이터가 없으면 로그 찍고 빈 배열 반환
                    logger.warning(f"⚠️ {code} ({market}) 차트 데이터 없음. 응답: {data.get('msg1')}")
                    return []

                result = []
                for item in output:
                    # 국내/해외 필드명 차이 처리
                    result.append({
                        "time": item.get("stck_bsop_date") or item.get("xymd"),
                        "open": float(item.get("stck_oprc") or item.get("open")),
                        "high": float(item.get("stck_hgpr") or item.get("high")),
                        "low": float(item.get("stck_lwpr") or item.get("low")),
                        "close": float(item.get("stck_clpr") or item.get("clos")),
                        "volume": float(item.get("acml_vol") or item.get("tvol"))
                    })
                
                # 날짜 오름차순 정렬 (과거 -> 현재)
                return sorted(result, key=lambda x: x['time'])

            except Exception as e:
                logger.error(f"Chart Data Error: {e}")
                return []

kis_data = KisDataService()