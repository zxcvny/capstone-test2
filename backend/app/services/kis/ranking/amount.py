import asyncio
from services.kis.ranking.base import RankingBaseService

# 거래대금 순위
# 국내: FHPST01710000 (거래량 순위 API를 호출 후 거래대금 기준 정렬)
# 해외: HHDFS76320010

domestic_tr_id = "FHPST01710000"
domestic_url = "/uapi/domestic-stock/v1/quotations/volume-rank"
overseas_tr_id = "HHDFS76320010"
overseas_url = "/uapi/overseas-stock/v1/ranking/trade-pbmn"

class AmountRankingService(RankingBaseService):
    async def get_domestic(self):
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_COND_SCR_DIV_CODE": "20171",
            "FID_INPUT_ISCD": "0000",
            "FID_DIV_CLS_CODE": "0",
            "FID_BLNG_CLS_CODE": "3",
            "FID_TRGT_CLS_CODE": "111111111",
            "FID_TRGT_EXLS_CLS_CODE": "000000",
            "FID_INPUT_PRICE_1": "",
            "FID_INPUT_PRICE_2": "",
            "FID_VOL_CNT": "",
            "FID_INPUT_DATE_1": ""
        }
        response = await self.fetch_api(domestic_url, domestic_tr_id, params)

        if response and 'output' in response:
            # acml_tr_pbmn 필드를 정수로 변환하여 내림차순 정렬
            response['output'].sort(
                key=lambda x: int(x.get('acml_tr_pbmn', 0)), 
                reverse=True
            )
            
        return response
    
    async def get_overseas(self, nday="0", excd="NAS"):
        params = {
            "KEYB": "",
            "AUTH": "",
            "EXCD": excd,
            "NDAY": nday,
            "VOL_RANG": "0",
            "PRC1": "",
            "PRC2": "",
        }
        
        data = await self.fetch_api(overseas_url, overseas_tr_id, params)

        if not data or not data.get("output2"):
            params["NDAY"] = "1"
            data = await self.fetch_api(overseas_url, overseas_tr_id, params)

        return data

    async def get_combined(self, excd="NAS"):
        dom_task = self.get_domestic()
        ovs_task = self.get_overseas(excd)
        rate_task = self.get_exchange_rate()

        dom_res, ovs_res, exchange_rate = await asyncio.gather(dom_task, ovs_task, rate_task)
        
        combined = []

        # 국내 (acml_tr_pbmn: 원화)
        for item in dom_res.get('output', []):
            amount = float(item.get('acml_tr_pbmn', 0))
            combined.append({
                "code": item.get('mksc_shrn_iscd'),
                "name": item.get('hts_kor_isnm'),
                "price": item.get('stck_prpr'),
                "rate": item.get('prdy_ctrt'),
                "value": amount,
                "market": "domestic"
            })

        # 해외 (tamt: 거래대금, 통화 단위 -> 원화 환산)
        for item in ovs_res.get('output2', []):
            amt_usd = float(item.get('tamt', 0)) 
            amt_krw = amt_usd * exchange_rate
            combined.append({
                "code": item.get('rsym'),
                "symb": item.get('symb'),
                "name": item.get('name'),
                "price": item.get('last'),
                "rate": item.get('rate'),
                "value": amt_krw,
                "market": "overseas"
            })

        combined.sort(key=lambda x: x['value'], reverse=True)
        return {"output": combined}

amount_service = AmountRankingService()