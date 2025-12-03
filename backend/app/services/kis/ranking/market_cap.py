import asyncio
from services.kis.ranking.base import RankingBaseService

# 시가총액 순위
# 국내: FHPST01740000
# 해외: HHDFS76350100

domestic_tr_id = "FHPST01740000"
domestic_url = "/uapi/domestic-stock/v1/ranking/market-cap"
overseas_tr_id = "HHDFS76350100"
overseas_url = "/uapi/overseas-stock/v1/ranking/market-cap"

class MarketCapRankingService(RankingBaseService):
    async def get_domestic(self):
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_COND_SCR_DIV_CODE": "20174",
            "FID_INPUT_ISCD": "0000",
            "FID_DIV_CLS_CODE": "0",
            "FID_BLNG_CLS_CODE": "0",
            "FID_TRGT_CLS_CODE": "111111111",
            "FID_TRGT_EXLS_CLS_CODE": "000000",
            "FID_INPUT_PRICE_1": "",
            "FID_INPUT_PRICE_2": "",
            "FID_VOL_CNT": "",
            "FID_INPUT_DATE_1": ""
        }
        return await self.fetch_api(domestic_url, domestic_tr_id, params)

    async def get_overseas(self, excd="NAS"):
        params = {
            "KEYB": "",
            "AUTH": "",
            "EXCD": excd,
            "VOL_RANG": "0"
        }
        return await self.fetch_api(overseas_url, overseas_tr_id, params)
    
    async def get_combined(self, market_type="all", excd="NAS"):
        dom_task = None
        ovs_task = None

        if market_type in ["domestic", "all"]:
            dom_task = asyncio.create_task(self.get_domestic())
        
        if market_type in ["overseas", "all"]:
            ovs_task = asyncio.create_task(self.get_overseas(excd=excd))
        
        dom_res = await dom_task if dom_task else {}
        ovs_res = await ovs_task if ovs_task else {}
        
        combined = []

        # 국내
        if dom_res and 'output' in dom_res:
            for item in dom_res.get('output', []):
                # stck_avls: 시가총액 (단위: 억 or 백만 확인 필요, 보통 국내는 억원 단위로 환산 필요할 수 있음)
                # 여기서는 원본 값 그대로 정렬
                cap = float(item.get('stck_avls', 0)) 
                combined.append({
                    "market": "domestic",
                    "code": item.get('mksc_shrn_iscd'),
                    "symb": item.get('mksc_shrn_iscd'),
                    "name": item.get('hts_kor_isnm'),
                    "price": item.get('stck_prpr'),
                    "rate": item.get('prdy_ctrt'),
                    "value": cap
                })

        # 해외
        if ovs_res and 'output2' in ovs_res:
            for item in ovs_res.get('output2', []):
                # valx: 시가총액
                cap = float(item.get('valx', 0))
                combined.append({
                    "market": "overseas",
                    "code": item.get('rsym'),
                    "symb": item.get('symb'),
                    "name": item.get('name'),
                    "price": item.get('last'),
                    "rate": item.get('rate'),
                    "value": cap
                })

        combined.sort(key=lambda x: x['value'], reverse=True)
        return {"output": combined}

mkt_cap_service = MarketCapRankingService()