# app/services/invest/virtual.py

import random
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException

from models.user_virtual import VirtualAccount, VirtualPortfolio, VirtualTradeLog
from services.kis.stock_info import stock_info_service

logger = logging.getLogger(__name__)

class VirtualInvestService:
    
    async def create_account(self, db: AsyncSession, user_id: int):
        """
        사용자 요청 시 랜덤 계좌 생성 (기존 계좌 존재 시 에러 또는 기존 반환)
        """
        # 1. 이미 계좌가 있는지 확인
        existing_account = await self.get_account_optional(db, user_id)
        if existing_account:
            raise ValueError("이미 모의투자 계좌가 존재합니다.")

        # 2. 계좌 번호 생성 (중복 안되게)
        while True:
            account_num = str(random.randint(10000000, 99999999)) + "-11"
            existing = await db.execute(select(VirtualAccount).where(VirtualAccount.account_number == account_num))
            if not existing.scalar_one_or_none():
                break
        
        new_account = VirtualAccount(
            user_id=user_id,
            account_number=account_num,
            balance=10000000 # 1,000만원 지급
        )
        db.add(new_account)
        await db.commit()
        await db.refresh(new_account)
        return new_account

    async def get_account(self, db: AsyncSession, user_id: int):
        """계좌 조회 (없으면 404 예외 발생 - 라우터에서 처리용)"""
        account = await self.get_account_optional(db, user_id)
        if not account:
            raise HTTPException(status_code=404, detail="계좌를 찾을 수 없습니다.")
        return account

    async def get_account_optional(self, db: AsyncSession, user_id: int):
        """계좌 조회 (없으면 None 반환 - 내부 로직용)"""
        result = await db.execute(select(VirtualAccount).where(VirtualAccount.user_id == user_id))
        return result.scalar_one_or_none()

    # ... (buy_stock, sell_stock, get_my_portfolio 로직은 이전 답변과 동일) ...
    async def buy_stock(self, db: AsyncSession, user_id: int, stock_code: str, market_type: str, quantity: int, exchange: str = None):
        # 1. 계좌 확인
        account = await self.get_account(db, user_id)
        
        # 2. 현재가 조회 (기존 StockInfoService 사용)
        stock_info = await stock_info_service.get_stock_detail(market_type, stock_code, exchange)
        if not stock_info:
            raise HTTPException(status_code=400, detail="현재가를 조회할 수 없습니다.")
        
        current_price = float(stock_info['price'].replace(',', ''))
        total_cost = int(current_price * quantity)

        # 3. 잔액 확인
        if account.balance < total_cost:
            raise HTTPException(status_code=400, detail="예수금이 부족합니다.")

        # 4. 포트폴리오 갱신
        result = await db.execute(
            select(VirtualPortfolio).where(
                VirtualPortfolio.account_id == account.account_id,
                VirtualPortfolio.stock_code == stock_code
            )
        )
        portfolio = result.scalar_one_or_none()

        if portfolio:
            total_qty = portfolio.quantity + quantity
            new_avg = ((portfolio.quantity * portfolio.average_price) + total_cost) / total_qty
            portfolio.quantity = total_qty
            portfolio.average_price = new_avg
        else:
            new_portfolio = VirtualPortfolio(
                account_id=account.account_id,
                stock_code=stock_code,
                market_type=market_type,
                quantity=quantity,
                average_price=current_price
            )
            db.add(new_portfolio)

        # 5. 잔액 차감 및 로그 기록
        account.balance -= total_cost
        
        log = VirtualTradeLog(
            account_id=account.account_id,
            stock_code=stock_code,
            trade_type="BUY",
            quantity=quantity,
            price=current_price,
            total_amount=total_cost
        )
        db.add(log)
        await db.commit()
        return {"message": "매수 체결 완료", "price": current_price}

    async def sell_stock(self, db: AsyncSession, user_id: int, stock_code: str, market_type: str, quantity: int, exchange: str = None):
        account = await self.get_account(db, user_id)
        result = await db.execute(
            select(VirtualPortfolio).where(
                VirtualPortfolio.account_id == account.account_id,
                VirtualPortfolio.stock_code == stock_code
            )
        )
        portfolio = result.scalar_one_or_none()

        if not portfolio or portfolio.quantity < quantity:
            raise HTTPException(status_code=400, detail="매도 가능 수량이 부족합니다.")

        stock_info = await stock_info_service.get_stock_detail(market_type, stock_code, exchange)
        if not stock_info:
            raise HTTPException(status_code=400, detail="현재가를 조회할 수 없습니다.")
        
        current_price = float(stock_info['price'].replace(',', ''))
        total_amount = int(current_price * quantity)

        portfolio.quantity -= quantity
        if portfolio.quantity == 0:
            await db.delete(portfolio)
        
        account.balance += total_amount
        
        log = VirtualTradeLog(
            account_id=account.account_id,
            stock_code=stock_code,
            trade_type="SELL",
            quantity=quantity,
            price=current_price,
            total_amount=total_amount
        )
        db.add(log)
        await db.commit()
        return {"message": "매도 체결 완료", "price": current_price, "amount": total_amount}

    async def get_my_portfolio(self, db: AsyncSession, user_id: int):
        account = await self.get_account(db, user_id)
        result = await db.execute(select(VirtualPortfolio).where(VirtualPortfolio.account_id == account.account_id))
        portfolios = result.scalars().all()

        response_list = []
        for p in portfolios:
            stock_info = await stock_info_service.get_stock_detail(p.market_type, p.stock_code)
            current_price = float(stock_info['price'].replace(',', '')) if stock_info else p.average_price

            valuation = current_price * p.quantity
            invested = p.average_price * p.quantity
            profit = valuation - invested
            rate = (profit / invested * 100) if invested > 0 else 0

            response_list.append({
                "stock_code": p.stock_code,
                "stock_name": stock_info['name'] if stock_info and 'name' in stock_info else p.stock_code, # 이름 추가 권장
                "market_type": p.market_type,
                "quantity": p.quantity,
                "average_price": p.average_price,
                "current_price": current_price,
                "profit_loss": profit,
                "profit_rate": rate
            })
        return response_list

virtual_invest_service = VirtualInvestService()