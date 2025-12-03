import asyncio
from services.kis.ranking.base import RankingBaseService

# 거래량 순위
# 국내: FHPST01710000
# 해외: HHDFS76310010

domestic_tr_id = "FHPST01710000"
domestic_url = "/uapi/domestic-stock/v1/quotations/volume-rank"
overseas_tr_id = "HHDFS76310010"
overseas_url = "/uapi/overseas-stock/v1/ranking/trade-vol"

class VolumeRankingService(RankingBaseService):
    async def get_domestic(self):
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_COND_SCR_DIV_CODE": "20171",
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
        data = await self.fetch_api(domestic_url, domestic_tr_id, params)

        normalized = []
        for item in data.get('output', []):
            normalized.append({
                "code": item.get('mksc_shrn_iscd'),
                "name": item.get('hts_kor_isnm'),
                "price": float(item.get('stck_prpr', 0)),
                "rate": float(item.get('prdy_ctrt', 0)),
                "volume": float(item.get('acml_vol', 0)),        # 거래량
                "amount": float(item.get('acml_tr_pbmn', 0)),    # 거래대금 (원화)
                "value": float(item.get('acml_vol', 0)),         # 정렬 기준 (거래량)
                "market": "domestic"
            })
        return {"output": normalized}

    async def get_overseas(self, nday="0", excd="NAS"):
        # 환율 조회
        exchange_rate = await self.get_exchange_rate()

        params = {
            "KEYB": "",
            "AUTH": "",
            "EXCD": excd,
            "NDAY": nday,
            "PRC1": "",
            "PRC2": "",
            "VOL_RANG": "0"
        }

        data = await self.fetch_api(overseas_url, overseas_tr_id, params)

        if not data or not data.get("output2"):
            params["NDAY"] = "1"
            data = await self.fetch_api(overseas_url, overseas_tr_id, params)

        normalized = []
        for item in data.get('output2', []):
            price_usd = float(item.get('last', 0))
            amount_usd = float(item.get('tamt', 0))
            
            normalized.append({
                "code": item.get('rsym'),
                "symb": item.get('symb'),
                "name": item.get('name'),
                "price": price_usd * exchange_rate,      # 현재가 (원화 환산)
                "rate": float(item.get('rate', 0)),
                "volume": float(item.get('tvol', 0)),    # 거래량
                "amount": amount_usd * exchange_rate,    # 거래대금 (원화 환산)
                "value": float(item.get('tvol', 0)),     # 정렬 기준 (거래량)
                "market": "overseas"
            })
        return {"output": normalized}
    
    async def get_combined(self, excd="NAS"):
        dom_task = self.get_domestic()
        ovs_task = self.get_overseas(excd)
        
        # 병렬 실행
        dom_res, ovs_res = await asyncio.gather(dom_task, ovs_task)
        
        combined = []
        combined.extend(dom_res.get('output', []))
        combined.extend(ovs_res.get('output', []))

        combined.sort(key=lambda x: x['value'], reverse=True)
        return {"output": combined}

volume_service = VolumeRankingService()