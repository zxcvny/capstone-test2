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
            "fid_input_price_2": "",
            "fid_cond_mrkt_div_code": "J",
            "fid_cond_scr_div_code": "20174",
            "fid_div_cls_code": "0",
            "fid_input_iscd": "0000",
            "fid_trgt_cls_code": "0",
            "fid_trgt_exls_cls_code": "0",
            "fid_input_price_1": "",
            "fid_vol_cnt": ""
        }
        return await self.fetch_api(domestic_url, domestic_tr_id, params)
    
    async def get_overseas(self, excd="NAS"):
        params = {
            "KEYB": "",
            "AUTH": "",
            "EXCD": excd,
            "VOL_RANG": "0",
        }
        return await self.fetch_api(overseas_url, overseas_tr_id, params)
    
    async def get_combined(self, excd="NAS"):
        dom_task = self.get_domestic()
        ovs_task = self.get_overseas(excd)
        rate_task = self.get_exchange_rate()
        
        dom_res, ovs_res, exchange_rate = await asyncio.gather(dom_task, ovs_task, rate_task)
        
        combined = []

        # 국내 데이터 (단위: 억 원 -> 원)
        for item in dom_res.get('output', []):
            mkt_cap = float(item.get('stck_avls', 0)) * 100000000 
            combined.append({
                "code": item.get('mksc_shrn_iscd'),
                "name": item.get('hts_kor_isnm'),
                "price": item.get('stck_prpr'),
                "rate": item.get('prdy_ctrt'),
                "value": mkt_cap, # 원화 환산 가치
                "market": "domestic"
            })

        # 해외 데이터 (단위: 백만 달러 -> 원)
        # valx(시가총액) * 1,000,000 * 환율
        for item in ovs_res.get('output2', []):
            val_usd = float(item.get('tomv', 0))
            mkt_cap_krw = val_usd * 1000000 * exchange_rate
            
            combined.append({
                "code": item.get('rsym'),
                "symb": item.get('symb'),
                "name": item.get('name'),
                "price": item.get('last'),
                "rate": item.get('rate'),
                "value": mkt_cap_krw, # 원화 환산 가치
                "market": "overseas"
            })

        # 시가총액 내림차순 정렬
        combined.sort(key=lambda x: x['value'], reverse=True)
        
        return {"output": combined}
    
mkt_cap_service = MarketCapRankingService()