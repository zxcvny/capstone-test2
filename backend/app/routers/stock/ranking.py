from fastapi import APIRouter, Query
from services.kis.ranking.volume import volume_service
from services.kis.ranking.amount import amount_service
from services.kis.ranking.market_cap import mkt_cap_service
from services.kis.ranking.fluctuation import fluct_service

router = APIRouter(prefix="/stocks/ranking", tags=["Stocks Ranking"])

LIMIT = 30

def slice_output(data: dict, limit: int = LIMIT):
    """공통 출력 슬라이싱 함수"""
    if not data:
        return data
    if "output" in data:
        data["output"] = data["output"][:limit]
    return data

@router.get("/{market}/volume")
async def get_volume_rank(market: str, excd: str = Query("NAS", description="해외거래소코드")):
    """거래량 순위 (market: domestic / overseas / all)"""
    data = await volume_service.get_combined(market, excd)
    return slice_output(data)

@router.get("/{market}/amount")
async def get_amount_rank(market: str, excd: str = Query("NAS")):
    """거래대금 순위 (market: domestic / overseas / all)"""
    data = await amount_service.get_combined(market, excd)
    return slice_output(data)

@router.get("/{market}/market-cap")
async def get_market_cap_rank(market: str, excd: str = Query("NAS")):
    """시가총액 순위 (market: domestic / overseas / all)"""
    data = await mkt_cap_service.get_combined(market, excd)
    return slice_output(data)

@router.get("/{market}/fluctuation/{direction}")
async def get_fluctuation_rank(market: str, direction: str, excd: str = Query("NAS")):
    """
    급상승/급하락 순위
    direction: rising (급상승), falling (급하락)
    """
    data = await fluct_service.get_combined(market, excd, direction)
    return slice_output(data)