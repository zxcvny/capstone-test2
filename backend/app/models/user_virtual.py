# app/models/virtual.py

from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, Float, BigInteger, func
from sqlalchemy.orm import relationship
from core.database import Base

class VirtualAccount(Base):
    __tablename__ = "virtual_accounts"

    account_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    account_number = Column(String(20), unique=True, index=True, nullable=False)
    balance = Column(BigInteger, default=10000000, nullable=False)  # 기본 1,000만원
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="virtual_account")
    portfolio = relationship("VirtualPortfolio", back_populates="account", cascade="all, delete-orphan")
    trade_logs = relationship("VirtualTradeLog", back_populates="account", cascade="all, delete-orphan")

class VirtualPortfolio(Base):
    __tablename__ = "virtual_portfolios"

    portfolio_id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("virtual_accounts.account_id"), nullable=False)
    stock_code = Column(String(20), nullable=False)
    market_type = Column(String(10), nullable=False) # domestic, overseas
    quantity = Column(Integer, default=0, nullable=False)
    average_price = Column(Float, default=0.0, nullable=False) # 평단가
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

    account = relationship("VirtualAccount", back_populates="portfolio")

class VirtualTradeLog(Base):
    __tablename__ = "virtual_trade_logs"

    log_id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("virtual_accounts.account_id"), nullable=False)
    stock_code = Column(String(20), nullable=False)
    trade_type = Column(String(10), nullable=False)  # BUY, SELL
    quantity = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)
    total_amount = Column(BigInteger, nullable=False)
    trade_date = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    account = relationship("VirtualAccount", back_populates="trade_logs")