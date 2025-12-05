from fastapi import APIRouter, HTTPException, Query

from services.kis.stock_info import stock_info_service

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