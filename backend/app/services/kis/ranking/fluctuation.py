import asyncio
from services.kis.ranking.base import RankingBaseService

# 급상승/급하락 순위
# 국내: FHPST01700000
# 해외: HHDFS76260000

domestic_tr_id = "FHPST01700000"
domestic_url = "/uapi/domestic-stock/v1/ranking/fluctuation"
overseas_tr_id = "HHDFS76290000"
overseas_url = "/uapi/overseas-stock/v1/ranking/updown-rate"

class FluctuationRankingService(RankingBaseService):
    async def get_domestic(self, type="0"):
        sort_code = "0" if type == "rising" else "1"

        params = {
            "fid_rsfl_rate2": "",
            "fid_cond_mrkt_div_code": "J",
            "fid_cond_scr_div_code": "20170",
            "fid_input_iscd": "0000",
            "fid_rank_sort_cls_code": sort_code,
            "fid_input_cnt_1": "0",
            "fid_prc_cls_code": "1", # 종가대비
            "fid_input_price_1": "",
            "fid_input_price_2": "",
            "fid_vol_cnt": "",
            "fid_trgt_cls_code": "0",
            "fid_trgt_exls_cls_code": "0",
            "fid_div_cls_code": "0",
            "fid_rsfl_rate1": ""
        }
        return await self.fetch_api(domestic_url, domestic_tr_id, params)

    async def get_overseas(self, excd="NAS", type="rising"):
        # 해외 상승율/하락율 (0:하락, 1:상승)
        gubun = "1" if type == "rising" else "0"

        params = {
            "KEYB": "",
            "AUTH": "",
            "EXCD": excd,
            "GUBN": gubun, 
            "NDAY": "0",
            "VOL_RANG": "0"
        }
        return await self.fetch_api(overseas_url, overseas_tr_id, params)
    
    async def get_combined(self, excd="NAS", type="rising"):
        dom_task = self.get_domestic(type)
        ovs_task = self.get_overseas(excd, type)
        dom_res, ovs_res = await asyncio.gather(dom_task, ovs_task)
        
        combined = []

        for item in dom_res.get('output', []):
            rate = float(item.get('prdy_ctrt', 0))
            combined.append({
                "code": item.get('stck_shrn_iscd'),
                "name": item.get('hts_kor_isnm'),
                "price": item.get('stck_prpr'),
                "rate": item.get('prdy_ctrt'),
                "value": rate,
                "market": "domestic"
            })

        for item in ovs_res.get('output2', []):
            rate = float(item.get('rate', 0))
            combined.append({
                "code": item.get('rsym'),
                "symb": item.get('symb'),
                "name": item.get('name'),
                "price": item.get('last'),
                "rate": item.get('rate'),
                "value": rate,
                "market": "overseas"
            })

        # 정렬 (상승: 내림차순, 하락: 오름차순)
        is_reverse = True if type == "rising" else False
        combined.sort(key=lambda x: x['value'], reverse=is_reverse)
        
        return {"output": combined}

fluct_service = FluctuationRankingService()