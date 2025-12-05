# app/schemas/virtual.py

from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class TradeRequest(BaseModel):
    stock_code: str
    market_type: str  # "domestic" or "overseas"
    quantity: int
    exchange: Optional[str] = None # 해외주식일 경우 거래소(NAS, NYS 등)

class VirtualAccountResponse(BaseModel):
    account_number: str
    balance: int
    total_asset: float = 0 # 평가금액 포함 총 자산

class PortfolioResponse(BaseModel):
    stock_code: str
    stock_name: str = ""
    quantity: int
    average_price: float
    current_price: float
    profit_loss: float
    profit_rate: float

class TradeLogResponse(BaseModel):
    trade_type: str
    stock_code: str
    quantity: int
    price: float
    trade_date: datetime