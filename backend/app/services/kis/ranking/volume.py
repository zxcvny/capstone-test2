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
        return await self.fetch_api(domestic_url, domestic_tr_id, params)

    async def get_overseas(self, nday="0", excd="NAS"):
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

        return data
    
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

        # 국내 데이터 매핑
        if dom_res and 'output' in dom_res:
            for item in dom_res.get('output', []):
                vol = float(item.get('acml_vol', 0))
                combined.append({
                    "market": "domestic",
                    "code": item.get('mksc_shrn_iscd'),  # 단축코드
                    "symb": item.get('mksc_shrn_iscd'),  # 심볼 (국내는 코드와 동일하게 처리)
                    "name": item.get('hts_kor_isnm'),
                    "price": item.get('stck_prpr'),
                    "rate": item.get('prdy_ctrt'),
                    "value": vol
                })

        # 해외 데이터 매핑
        if ovs_res and 'output2' in ovs_res:
            for item in ovs_res.get('output2', []):
                vol = float(item.get('tvol', 0))
                combined.append({
                    "market": "overseas",
                    "code": item.get('rsym'),            # 풀코드 (DNASAAPL 등)
                    "symb": item.get('symb'),            # 심볼 (AAPL)
                    "name": item.get('name'),
                    "price": item.get('last'),
                    "rate": item.get('rate'),
                    "value": vol
                })

        # 거래량 내림차순 정렬
        combined.sort(key=lambda x: x['value'], reverse=True)
        return {"output": combined}

volume_service = VolumeRankingService()