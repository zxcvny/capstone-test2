import asyncio
from services.kis.ranking.base import RankingBaseService

# 급상승/급하락 순위
# 국내: FHPST01700000
# 해외: HHDFS76290000

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
        data = await self.fetch_api(domestic_url, domestic_tr_id, params)

        normalized = []
        for item in data.get('output', []):
            # 데이터 추출
            price = float(item.get('stck_prpr', 0))
            volume = float(item.get('acml_vol', 0))
            
            # 거래대금 직접 계산 (API 미제공 대응)
            amount = price * volume

            normalized.append({
                "code": item.get('stck_shrn_iscd'), # 주의: 다른 API와 달리 코드가 stck_shrn_iscd
                "name": item.get('hts_kor_isnm'),
                "price": price,
                "rate": float(item.get('prdy_ctrt', 0)),
                "volume": volume,
                "amount": amount,                       # 계산된 거래대금 사용
                "value": float(item.get('prdy_ctrt', 0)), # 정렬 기준 (등락률)
                "market": "domestic"
            })
        return {"output": normalized}

    async def get_overseas(self, excd="NAS", type="rising"):
        # 환율 조회
        exchange_rate = await self.get_exchange_rate()

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
        data = await self.fetch_api(overseas_url, overseas_tr_id, params)

        normalized = []
        for item in data.get('output2', []):
            price_usd = float(item.get('last', 0))
            volume = float(item.get('tvol', 0))
            
            # 해외 거래대금 계산 (달러) -> 원화 환산
            amount_usd = price_usd * volume
            amount_krw = amount_usd * exchange_rate

            normalized.append({
                "code": item.get('rsym'),
                "symb": item.get('symb'),
                "name": item.get('name'),
                "price": price_usd * exchange_rate,     # 현재가 (원화 환산)
                "rate": float(item.get('rate', 0)),
                "volume": volume,
                "amount": amount_krw,                   # 계산된 거래대금 (원화)
                "value": float(item.get('rate', 0)),    # 정렬 기준 (등락률)
                "market": "overseas"
            })
        return {"output": normalized}
    
    async def get_combined(self, excd="NAS", type="rising"):
        dom_task = self.get_domestic(type)
        ovs_task = self.get_overseas(excd, type)
        
        # 병렬 실행
        dom_res, ovs_res = await asyncio.gather(dom_task, ovs_task)
        
        combined = []
        combined.extend(dom_res.get('output', []))
        combined.extend(ovs_res.get('output', []))

        # 정렬 (상승: 내림차순, 하락: 오름차순)
        is_reverse = True if type == "rising" else False
        combined.sort(key=lambda x: x['value'], reverse=is_reverse)
        
        return {"output": combined}

fluct_service = FluctuationRankingService()