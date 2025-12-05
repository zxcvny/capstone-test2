import httpx
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime

from core.config import settings
from services.kis.auth import kis_auth
from services.kis.ranking.base import ranking_base_service

logger = logging.getLogger(__name__)

class StockInfoService:
    def __init__(self):
        self.base_url = settings.KIS_BASE_URL

    async def _get_headers(self, tr_id: str, custtype: str = "P") -> Dict[str, str]:
        access_token = await kis_auth.get_access_token()
        return {
            "content-type": "application/json; charset=utf-8",
            "authorization": f"Bearer {access_token}",
            "appkey": settings.KIS_APP_KEY,
            "appsecret": settings.KIS_SECRET_KEY,
            "tr_id": tr_id,
            "custtype": custtype,
        }
    async def get_stock_detail(self, market: str, code: str, exchange: Optional[str] = None) -> Optional[Dict[str, Any]]:
        if market.lower() in ["domestic", "kospi", "kosdaq"]:
            return await self._get_domestic_stock(code)
        
        elif market.lower() in ["overseas", "nas", "nasdaq"]:
            if not exchange:
                exchange = "NAS" 
            return await self._get_overseas_stock(code, exchange)
        
        else:
            logger.error(f"잘못된 시장 구분입니다: {market}")
            return None
        
    async def _get_domestic_stock(self, code: str) -> Optional[Dict[str, Any]]:
        tr_id = "FHKST01010100"
        url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/inquire-price"

        headers = await self._get_headers(tr_id)
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": code
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, headers=headers, params=params)
                response.raise_for_status()
                res_json = response.json()

                if res_json["rt_cd"] != "0": # 성공 실패 여부 응답
                    logger.error(f"⛔ Domestic API Error: {res_json['msg1']}")
                    return None
                
                data = res_json["output"]
                return {
                    "market": "domestic",
                    "code": code,
                    "price": data.get("stck_prpr"), # 주식 현재가
                    "diff": data.get("prdy_vrss"), # 전일 대비
                    "rate": data.get("prdy_ctrt"), # 전일 대비율
                    "amount": data.get("acml_tr_pbmn"), # 누적 거래 대금
                    "volume": data.get("acml_vol"), # 누적 거래량
                    "shares_outstanding": data.get("lstn_stcn"), # 상장 주수
                    "market_cap": data.get("hts_avls"), # HTS 시가총액
                    "per": data.get("per"), "pbr": data.get("pbr"), "eps": data.get("eps"), "bps": data.get("bps"),
                    "vol_power": data.get("vol_tnrt") # 거래량 회전율
                }
        
        except Exception as e:
            logger.error(f"⛔ Faild to fetch domestic stock: {e}")
            return None
        
    async def _get_overseas_stock(self, code: str, exchange: str) -> Optional[Dict[str, Any]]:
        tr_id = "HHDFS76200200"
        url = f"{self.base_url}/uapi/overseas-price/v1/quotations/price-detail"

        headers = await self._get_headers(tr_id)
        params = {
            "AUTH": "",
            "EXCD": exchange.upper(),
            "SYMB": code.upper()
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, headers=headers, params=params)
                response.raise_for_status()
                res_json = response.json()

                if res_json["rt_cd"] != "0":
                    logger.error(f"⛔ Overseas API Error: {res_json['msg1']}")
                
                data = res_json["output"]
                rate = await ranking_base_service.get_exchange_rate()

                last = float(data.get('last') or 0)  # 현재가
                base = float(data.get('base') or 0)  # 전일종가
                amount = float(data.get('tamt') or 0)
                tomv = float(data.get('tomv') or 0)  # 시가총액
                eps_usd = float(data.get('epsx') or 0) # EPS
                bps_usd = float(data.get('bpsx') or 0) # BPS
                
                diff_usd = last - base
                if base > 0:
                    change_rate = f"{((diff_usd / base) * 100):.2f}"
                else:
                    change_rate = "0.00"

                price_krw = int(last * rate)
                diff_krw = int(diff_usd * rate)
                amount_krw = int(amount * rate)
                market_cap_krw_eok = (tomv * rate)
                eps_krw = int(eps_usd * rate)
                bps_krw = int(bps_usd * rate)

                return {
                    "market": "overseas",
                    "code": code,
                    "price": str(price_krw), # 주식 현재가
                    "diff": str(diff_krw), # 전일 대비
                    "rate": str(change_rate), # 전일 대비율
                    "amount": str(amount_krw), # 거래 대금
                    "volume": data.get("tvol"), # 거래량
                    "shares_outstanding": data.get("shar"), # 상장 주수
                    "market_cap": str(int(market_cap_krw_eok)), # 시가총액
                    "per": data.get("perx"), "pbr": data.get("pbrx"), "eps": str(eps_krw), "bps": str(bps_krw),
                }
        
        except Exception as e:
            logger.error(f"⛔ Failed to fetch overseas stock: {e}")
            return None
        
    async def get_domestic_stock_time_conclusion(self, code: str, start_time: Optional[str] = None) -> Optional[List[Dict[str, Any]]]:
        """
        국내 주식의 당일 시간대별 체결 내역을 조회합니다.
        :param code: 종목 코드 (6자리)
        :param start_time: 조회 시작 시간 (HHMMSS). 미입력 시 현재 시간(최신 데이터) 기준으로 조회
        """
        tr_id = "FHPST01060000"  # 주식현재가 당일시간대별체결 TR ID
        url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/inquire-time-itemconclusion"

        # start_time이 없으면 현재 시간을 HHMMSS 형식으로 설정
        if not start_time:
            start_time = datetime.now().strftime("%H%M%S")

        headers = await self._get_headers(tr_id)
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": code,
            "FID_INPUT_HOUR_1": start_time
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, headers=headers, params=params)
                response.raise_for_status()
                res_json = response.json()

                if res_json["rt_cd"] != "0":
                    logger.error(f"⛔ Time Conclusion API Error: {res_json['msg1']}")
                    return None
                
                # output2: 체결 내역 리스트 (output1은 현재가 상세 정보)
                return res_json["output2"]

        except Exception as e:
            logger.error(f"⛔ Failed to fetch domestic stock time conclusion: {e}")
            return None
        
    async def get_overseas_stock_conclusion(self, code: str, exchange: str) -> Optional[List[Dict[str, Any]]]:
        """
        해외 주식의 체결 추이(체결 내역)를 조회합니다.
        :param code: 종목 코드 (예: AAPL)
        :param exchange: 거래소 코드 (예: NAS, NYS, AMS 등)
        """
        tr_id = "HHDFS76200300"  # 해외주식 체결추이 TR ID
        url = f"{self.base_url}/uapi/overseas-price/v1/quotations/inquire-ccnl"

        headers = await self._get_headers(tr_id)
        
        # 문서에 명시된 필수 파라미터 구성
        params = {
            "EXCD": exchange.upper(), # 거래소코드 (NYS, NAS, AMS 등)
            "SYMB": code.upper(),     # 종목코드
            "AUTH": "",               # 사용자권한정보 (공백)
            "KEYB": "",               # NEXT KEY BUFF (공백)
            "TDAY": "1"               # 당일전일구분 (0:전일, 1:당일) -> 당일 기준으로 설정
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, headers=headers, params=params)
                response.raise_for_status()
                res_json = response.json()

                if res_json["rt_cd"] != "0":
                    logger.error(f"⛔ Overseas Conclusion API Error: {res_json['msg1']}")
                    return None
                
                # output1: 체결추이 리스트
                return res_json["output1"]

        except Exception as e:
            logger.error(f"⛔ Failed to fetch overseas stock conclusion: {e}")
            return None

stock_info_service = StockInfoService()