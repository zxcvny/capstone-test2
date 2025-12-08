import asyncio
from services.kis.ranking.market_cap import mkt_cap_service
from services.kis.ranking.fluctuation import fluct_service

class StockCollector:
    def __init__(self):
        # [해외] 기간 코드 (유지)
        self.nas_period_codes = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] 
        
    async def get_kr_targets(self):
        """
        [국내]
        1. 장기(Long): 시총 상위 30개
        2. 단기(Short): 당일 급등 100개 + 급락 100개 (총 200개)
        """
        print("🇰🇷 [수집] 국내 타겟 대거 수집 중 (Daily Limit 100)...")
        long_term_set = set()
        short_term_set = set()
        
        # 1. 우량주
        try:
            mkt_data = await mkt_cap_service.get_domestic(iscd="0000")
            for item in mkt_data.get('output', [])[:30]:
                long_term_set.add(item['code'])
        except Exception as e:
            print(f"⚠️ 우량주 수집 에러: {e}")

        # 2. 급등주 (기간별 API는 에러나서 제거하고, 당일 데이터를 최대로 수집)
        try:
            # 상승률 상위 100개
            r_today = await fluct_service.get_domestic(type="rising")
            for item in r_today.get('output', []): # 100개 전부 다 넣음
                short_term_set.add(item['code'])
                
            # 하락률 상위 100개
            f_today = await fluct_service.get_domestic(type="falling")
            for item in f_today.get('output', []): # 100개 전부 다 넣음
                short_term_set.add(item['code'])

        except Exception as e:
            print(f"⚠️ 급등주 수집 에러: {e}")

        # 중복 제거 (우량주가 급등할 수도 있으니)
        final_short = short_term_set - long_term_set
        
        print(f"   -> 장기(10년): {len(long_term_set)}개 (우량주)")
        print(f"   -> 단기(1년): {len(final_short)}개 (당일 급등/급락)")
        
        return list(long_term_set), list(final_short)

    async def get_nas_targets(self):
        """
        [해외] 기존 로직 유지
        """
        print("🇺🇸 [수집] 해외 전기간 타겟 수집 중...")
        long_term_set = set()
        short_term_set = set()
        
        try:
            cap_data = await mkt_cap_service.get_overseas("NAS")
            for item in cap_data.get('output', [])[:50]:
                long_term_set.add(item['symb'])
        except: pass
            
        directions = ["rising", "falling"]
        for period in self.nas_period_codes:
            for direction in directions:
                try:
                    res = await fluct_service.get_overseas(excd="NAS", type=direction, period=period)
                    items = res.get('output', [])
                    for item in items[:20]:
                        code = item.get('symb')
                        if code: short_term_set.add(code)
                    await asyncio.sleep(0.1)
                except: pass
            
        final_short = short_term_set - long_term_set
        
        print(f"✅ 해외 데이터 수집 완료")
        print(f"   - 장기(10년): {len(long_term_set)}개")
        print(f"   - 단기(1년): {len(final_short)}개")

        return list(long_term_set), list(final_short)

collector = StockCollector()