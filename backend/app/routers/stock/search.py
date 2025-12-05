import asyncio
from fastapi import APIRouter, Query

from services.kis.stock_search import stock_search_service
from services.kis.stock_info import stock_info_service

router = APIRouter(prefix="/stocks", tags=["Stocks Search"])

@router.get("/search")
async def search_stocks_with_price(
    keyword: str = Query(..., min_length=1, description="종목명 또는 코드")
):
    """
    종목 검색 API (현재가 및 등락률 포함)
    """
    # 1. 마스터 데이터 검색
    candidates = stock_search_service.search_stocks(keyword, limit=10)
    
    if not candidates:
        return []

    # 2. 현재가 병렬 조회
    tasks = []
    domestic_markets = ["KOSPI", "KOSDAQ"] # 국내 시장 코드 정의

    for stock in candidates:
        market = stock['market']
        code = stock['code']
        
        # [수정] 'domestic' 문자열 비교 대신 실제 시장 코드 확인
        if market in domestic_markets:
            tasks.append(stock_info_service._get_domestic_stock(code))
        else:
            tasks.append(stock_info_service._get_overseas_stock(code, exchange=market))

    prices = await asyncio.gather(*tasks)

    # 3. 결과 포맷팅
    results = []
    for stock, price_data in zip(candidates, prices):
        market = stock['market']
        # [수정] 표기 라벨 로직 수정
        market_label = "국내" if market in domestic_markets else "해외"
        
        if not price_data:
            current_price = "-"
            change_rate = "-"
        else:
            # 안전한 형변환 및 포맷팅
            p_val = price_data.get('price', '0')
            r_val = price_data.get('rate', '0.00')
            
            try:
                # float로 변환 후 포맷팅 (해외주식 소수점 고려, 원화 환산되면 정수겠지만 안전하게)
                p_float = float(p_val)
                current_price = f"{int(p_float):,}원"
            except:
                current_price = str(p_val)
                
            change_rate = f"{r_val}%"

        results.append({
            "display_market": market_label,
            "display_name": stock['name'],
            "current_price": current_price,
            "change_rate": change_rate,
            "market_code": stock['market'],
            "stock_code": stock['code'],
            "stock_name": stock['name']
        })

    return results