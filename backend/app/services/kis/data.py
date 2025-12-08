import httpx
import logging
import datetime
from zoneinfo import ZoneInfo
from core.config import settings
from services.kis.auth import kis_auth

logger = logging.getLogger(__name__)

class KisDataService:
    def __init__(self):
        self.base_url = settings.KIS_BASE_URL
        self.KST = ZoneInfo("Asia/Seoul")

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
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get("https://open.er-api.com/v6/latest/USD")
                return res.json()['rates']['KRW']
        except:
            return 1430.0

    # [수정] 날짜 지정 파라미터(start_date, end_date) 추가
    async def get_stock_chart(self, market: str, code: str, period: str = "D", start_date: str = "", end_date: str = ""):
        # 분봉은 별도 로직
        if "m" in period:
            return await self._get_minute_chart(market, code, period)

        rate = 1.0
        if market != "KR":
            rate = await self.get_exchange_rate()

        if market == "KR":
            path = "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice"
            tr_id = "FHKST03010100"
            params = {
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": code,
                "FID_INPUT_DATE_1": start_date,  # [수정] 시작일 (YYYYMMDD)
                "FID_INPUT_DATE_2": end_date,    # [수정] 종료일 (YYYYMMDD)
                "FID_PERIOD_DIV_CODE": period,
                "FID_ORG_ADJ_PRC": "1"
            }
        else:
            path = "/uapi/overseas-price/v1/quotations/dailyprice"
            tr_id = "HHDFS76240000"
            
            excd = "NAS"
            symb = code
            if len(code) >= 5 and code[0] in ['D', 'R']:
                market_code = code[1:4]
                symb = code[4:]
                if market_code == "NAS": excd = "NAS"
                elif market_code == "NYS": excd = "NYS"
                elif market_code == "AMS": excd = "AMS"
            
            gubn_code = "0"
            if period == "W": gubn_code = "1"
            elif period == "M" or period == "Y": gubn_code = "2"

            params = {
                "AUTH": "",
                "EXCD": excd,
                "SYMB": symb,
                "GUBN": gubn_code,
                "BYMD": end_date, # [수정] 해외는 기준일(BYMD) 이전 데이터를 가져옴 (Pagination용)
                "MODP": "1"
            }

        headers = await self.get_headers(tr_id)
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(f"{self.base_url}{path}", headers=headers, params=params)
                data = response.json()
                output = data.get('output2') or data.get('output', [])
                
                if not output:
                    return []

                result = []
                for item in output:
                    dt_str = item.get("stck_bsop_date") or item.get("xymd")
                    
                    op = float(item.get("stck_oprc") or item.get("open") or 0) * rate
                    hi = float(item.get("stck_hgpr") or item.get("high") or 0) * rate
                    lo = float(item.get("stck_lwpr") or item.get("low") or 0) * rate
                    cl = float(item.get("stck_clpr") or item.get("clos") or 0) * rate
                    vol = float(item.get("acml_vol") or item.get("tvol") or 0)

                    result.append({
                        "time": dt_str,
                        "open": int(op),
                        "high": int(hi),
                        "low": int(lo),
                        "close": int(cl),
                        "volume": int(vol)
                    })
                
                # 날짜 오름차순 정렬
                return sorted(result, key=lambda x: x['time'])

            except Exception as e:
                logger.error(f"Chart Daily Error: {e}")
                return []

    async def _get_minute_chart(self, market: str, code: str, period: str):
        # ... (기존 분봉 로직 유지) ...
        # (파일 내용이 길어 생략하지만, 기존 코드를 그대로 두시면 됩니다)
        interval = period.replace("m", "")
        rate = 1.0
        if market != "KR":
            rate = await self.get_exchange_rate()

        if market == "KR":
            path = "/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice"
            tr_id = "FHKST03010200"
            now_kst = datetime.datetime.now(self.KST)
            now_time_str = now_kst.strftime("%H%M%S")
            params = {
                "FID_ETC_CLS_CODE": "",
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": code,
                "FID_INPUT_HOUR_1": now_time_str,
                "FID_PW_DATA_INCU_YN": "Y" 
            }
        else:
            path = "/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice"
            tr_id = "HHDFS76950200"
            excd = "NAS"
            symb = code
            if len(code) >= 5 and code[0] in ['D', 'R']:
                market_code = code[1:4]
                symb = code[4:]
                if market_code == "NAS": excd = "NAS"
                elif market_code == "NYS": excd = "NYS"
            params = {
                "AUTH": "",
                "EXCD": excd,
                "SYMB": symb,
                "NMIN": str(interval),
                "PINC": "1",
                "NEXT": "",
                "NREC": "120",
                "KEYB": ""
            }

        headers = await self.get_headers(tr_id)

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(f"{self.base_url}{path}", headers=headers, params=params)
                data = response.json()
                output = data.get('output2', [])

                result = []
                for item in output:
                    if market == "KR":
                        d_str = item.get("stck_bsop_date")
                        t_str = item.get("stck_cntg_hour")
                    else:
                        d_str = item.get("kymd")
                        t_str = item.get("khms")
                    
                    if not d_str or not t_str: continue

                    dt_obj = datetime.datetime.strptime(f"{d_str}{t_str}", "%Y%m%d%H%M%S")
                    dt_kst = dt_obj.replace(tzinfo=self.KST) 
                    timestamp = int(dt_kst.timestamp())

                    op = float(item.get("stck_oprc") or item.get("open") or 0) * rate
                    hi = float(item.get("stck_hgpr") or item.get("high") or 0) * rate
                    lo = float(item.get("stck_lwpr") or item.get("low") or 0) * rate
                    cl = float(item.get("stck_prpr") or item.get("last") or 0) * rate
                    vol = float(item.get("cntg_vol") or item.get("evol") or 0)

                    result.append({
                        "time": timestamp,
                        "open": int(op),
                        "high": int(hi),
                        "low": int(lo),
                        "close": int(cl),
                        "volume": int(vol)
                    })
                return sorted(result, key=lambda x: x['time'])
            except Exception as e:
                logger.error(f"Chart Minute Error: {e}")
                return []

kis_data = KisDataService()