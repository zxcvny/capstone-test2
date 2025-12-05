from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from services.kis.stock_info import stock_info_service
from services.kis.data import kis_data

router = APIRouter(prefix="/stocks", tags=["Stocks Info"])

@router.get("/detail")
async def read_stock_detail(
    code: str,
    market: str = Query(..., description="'domestic' or 'overseas'"),
    exchange: str = Query(None, description="Required for overseas (e.g., NAS, NYS)")
):
    result = await stock_info_service.get_stock_detail(market, code, exchange)

    if not result:
        raise HTTPException(status_code=404, detail="Stock data not found or API error")
    
    return result

@router.get("/conclusion/domestic")
async def read_domestic_stock_conclusion(
    code: str,
    time: Optional[str] = Query(None, description="조회 시작 시간 (HHMMSS). 미입력 시 최신순 조회")
):
    """
    국내 주식의 당일 시간대별 체결 내역을 조회합니다.
    """
    result = await stock_info_service.get_domestic_stock_time_conclusion(code, time)
    
    if result is None:
        raise HTTPException(status_code=404, detail="Data not found or API error")
    
    return result

@router.get("/conclusion/overseas")
async def read_overseas_stock_conclusion(
    code: str,
    exchange: str = Query(..., description="Exchange code (e.g., NAS, NYS, AMS)")
):
    """
    해외 주식의 당일 체결 추이를 조회합니다.
    """
    result = await stock_info_service.get_overseas_stock_conclusion(code, exchange)
    
    if result is None:
        raise HTTPException(status_code=404, detail="Data not found or API error")
    
    return result

@router.get("/chart")
async def get_stock_chart(
    code: str,
    market: str = Query(..., description="'domestic' or 'overseas'"),
    period: str = Query("D", description="D(일), W(주), M(월)")
):
    """
    주식 차트 데이터를 조회합니다.
    """
    # market 값이 'domestic'/'overseas'로 들어오면 KR/NAS 등으로 변환
    target_market = "KR" if market == "domestic" else "NAS"
    
    # KIS 서비스 호출
    result = await kis_data.get_stock_chart(target_market, code, period)
    
    if not result:
        return []
        
    return result