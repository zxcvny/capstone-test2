from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from core.database import get_db
from core.security.dependencies import get_current_user
from models.user import User
from schemas.user_virtual import TradeRequest, VirtualAccountResponse, PortfolioResponse
from services.invest.user_virtual import virtual_invest_service

router = APIRouter(prefix="/invest/virtual", tags=["Virtual Investment"])

@router.post("/account", status_code=status.HTTP_201_CREATED, response_model=VirtualAccountResponse)
async def create_virtual_account(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    [모의투자 시작하기] 버튼 클릭 시 호출
    계좌가 없으면 새로 생성하여 반환합니다.
    """
    try:
        # 이미 계좌가 있는지 서비스단에서 체크하거나 여기서 체크
        account = await virtual_invest_service.create_account(db, user.user_id)
        return {
            "account_number": account.account_number,
            "balance": account.balance
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/account", response_model=VirtualAccountResponse)
async def get_my_account(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    내 가상 계좌 잔고 조회
    - 계좌가 없으면 404 에러를 반환 -> 프론트에서 이를 감지하여 '시작하기' 버튼 노출
    """
    account = await virtual_invest_service.get_account(db, user.user_id)
    return {
        "account_number": account.account_number,
        "balance": account.balance
    }

# ... (매수/매도/포트폴리오 API는 그대로 유지)
@router.post("/buy")
async def buy_stock(
    req: TradeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    return await virtual_invest_service.buy_stock(
        db, user.user_id, req.stock_code, req.market_type, req.quantity, req.exchange
    )

@router.post("/sell")
async def sell_stock(
    req: TradeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    return await virtual_invest_service.sell_stock(
        db, user.user_id, req.stock_code, req.market_type, req.quantity, req.exchange
    )

@router.get("/portfolio", response_model=List[PortfolioResponse])
async def get_portfolio(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    return await virtual_invest_service.get_my_portfolio(db, user.user_id)