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
        data = await self.fetch_api(domestic_url, domestic_tr_id, params)

        normalized = []
        for item in data.get('output', []):
            # 데이터 추출
            price = float(item.get('stck_prpr', 0))
            volume = float(item.get('acml_vol', 0))
            
            # 거래대금 직접 계산 (API 미제공 대응)
            amount = price * volume
            
            # 시가총액 단위: 억 원 -> 원으로 변환
            mkt_cap_krw = float(item.get('stck_avls', 0)) * 100_000_000
            
            normalized.append({
                "code": item.get('mksc_shrn_iscd'),
                "name": item.get('hts_kor_isnm'),
                "price": price,
                "rate": float(item.get('prdy_ctrt', 0)),
                "volume": volume,
                "amount": amount,           # 계산된 거래대금 사용
                "value": mkt_cap_krw,       # 정렬 기준 (시가총액)
                "market": "domestic"
            })
        return {"output": normalized}
    
    async def get_overseas(self, excd="NAS"):
        # 환율 조회
        exchange_rate = await self.get_exchange_rate()

        params = {
            "KEYB": "",
            "AUTH": "",
            "EXCD": excd,
            "VOL_RANG": "0",
        }
        data = await self.fetch_api(overseas_url, overseas_tr_id, params)

        normalized = []
        for item in data.get('output2', []):
            price_usd = float(item.get('last', 0))
            volume = float(item.get('tvol', 0))
            
            # 해외 거래대금 계산 (달러) -> 원화 환산
            amount_usd = price_usd * volume
            amount_krw = amount_usd * exchange_rate
            
            # 해외 시가총액 단위: 백만 달러 -> 원으로 환산
            mkt_cap_usd_million = float(item.get('tomv', 0))
            mkt_cap_krw = mkt_cap_usd_million * exchange_rate

            normalized.append({
                "code": item.get('rsym'),
                "symb": item.get('symb'),
                "name": item.get('name'),
                "price": price_usd * exchange_rate,     # 현재가 (원화 환산)
                "rate": float(item.get('rate', 0)),
                "volume": volume,
                "amount": amount_krw,                   # 계산된 거래대금 (원화)
                "value": mkt_cap_krw,                   # 정렬 기준 (시가총액)
                "market": "overseas"
            })
        return {"output": normalized}
    
    async def get_combined(self, excd="NAS"):
        dom_task = self.get_domestic()
        ovs_task = self.get_overseas(excd)
        
        # 병렬 실행 (각 메서드 내에서 이미 계산 및 환산 완료됨)
        dom_res, ovs_res = await asyncio.gather(dom_task, ovs_task)
        
        combined = []
        combined.extend(dom_res.get('output', []))
        combined.extend(ovs_res.get('output', []))

        # 시가총액 내림차순 정렬
        combined.sort(key=lambda x: x['value'], reverse=True)
        
        return {"output": combined}
    
mkt_cap_service = MarketCapRankingService()