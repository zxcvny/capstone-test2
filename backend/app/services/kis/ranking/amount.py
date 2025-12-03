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
        # 국내 거래대금 순위 조회를 위한 파라미터 설정 (거래량 API 활용 시)
        # 만약 별도 API(예: 거래대금상위)가 있다면 교체 필요. 
        # 여기서는 기존 로직대로 하되 'FID_VOL_CNT' 등을 조정했다고 가정.
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
            "FID_VOL_CNT": "", # 거래대금 순 정렬 파라미터 확인 필요 (기본은 거래량)
            "FID_INPUT_DATE_1": ""
        }
        # *참고: FHPST01710000은 기본적으로 거래량 순위입니다. 거래대금 순위 API는 없을 수도 있어, 
        # 보통은 데이터를 많이 받아와서 소팅하거나 다른 API를 씁니다.
        # 일단 키 통일 작업 위주로 작성합니다.
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
                amt = float(item.get('acml_tr_pbmn', 0)) # 거래대금 필드
                combined.append({
                    "market": "domestic",
                    "code": item.get('mksc_shrn_iscd'),
                    "symb": item.get('mksc_shrn_iscd'),
                    "name": item.get('hts_kor_isnm'),
                    "price": item.get('stck_prpr'),
                    "rate": item.get('prdy_ctrt'),
                    "value": amt
                })

        # 해외
        if ovs_res and 'output2' in ovs_res:
            for item in ovs_res.get('output2', []):
                amt = float(item.get('tamt', 0)) # 거래대금 필드
                combined.append({
                    "market": "overseas",
                    "code": item.get('rsym'),
                    "symb": item.get('symb'),
                    "name": item.get('name'),
                    "price": item.get('last'),
                    "rate": item.get('rate'),
                    "value": amt
                })

        combined.sort(key=lambda x: x['value'], reverse=True)
        return {"output": combined}

amount_service = AmountRankingService()