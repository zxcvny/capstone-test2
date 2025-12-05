import httpx
import logging
import datetime
from zoneinfo import ZoneInfo # [필수] 타임존 처리를 위해 추가
from core.config import settings
from services.kis.auth import kis_auth

logger = logging.getLogger(__name__)

class KisDataService:
    def __init__(self):
        self.base_url = settings.KIS_BASE_URL
        # 한국 시간대 정의
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

    async def get_stock_chart(self, market: str, code: str, period: str = "D"):
        # 분봉 로직 분리
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
                "FID_INPUT_DATE_1": "",
                "FID_INPUT_DATE_2": "",
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
                
                return sorted(result, key=lambda x: x['time'])

            except Exception as e:
                logger.error(f"Chart Daily Error: {e}")
                return []

    async def _get_minute_chart(self, market: str, code: str, period: str):
        interval = period.replace("m", "")
        
        rate = 1.0
        if market != "KR":
            rate = await self.get_exchange_rate()

        if market == "KR":
            path = "/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice"
            tr_id = "FHKST03010200"
            
            # [중요] 서버 시간이 UTC여도 한국 시간(KST)을 기준으로 조회해야 정확한 데이터가 옴
            now_kst = datetime.datetime.now(self.KST)
            now_time_str = now_kst.strftime("%H%M%S")
            
            params = {
                "FID_ETC_CLS_CODE": "",
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": code,
                "FID_INPUT_HOUR_1": now_time_str, # 한국 시간 기준 현재 시각
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
                    # 날짜/시간 추출
                    # 해외의 경우 'kymd'(한국일자), 'khms'(한국시간)을 우선 사용
                    if market == "KR":
                        d_str = item.get("stck_bsop_date")
                        t_str = item.get("stck_cntg_hour")
                    else:
                        d_str = item.get("kymd") # 한국 기준 일자
                        t_str = item.get("khms") # 한국 기준 시간
                    
                    if not d_str or not t_str:
                        continue

                    # [핵심 수정] 파싱한 시간을 명시적으로 'Asia/Seoul' 타임존으로 설정
                    # 이렇게 해야 timestamp() 변환 시 UTC로 잘못 해석되어 시간이 밀리는 문제를 방지함
                    dt_obj = datetime.datetime.strptime(f"{d_str}{t_str}", "%Y%m%d%H%M%S")
                    dt_kst = dt_obj.replace(tzinfo=self.KST) 
                    
                    # 프론트엔드로 보낼 때는 UTC 기준 Unix Timestamp로 변환
                    timestamp = int(dt_kst.timestamp())

                    # 가격 변환
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