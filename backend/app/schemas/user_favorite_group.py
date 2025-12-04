from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# --- 그룹 관련 ---
class GroupCreate(BaseModel):
    name: str

class GroupResponse(BaseModel):
    group_id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- 주식 관련 ---
class UserFavoriteCreate(BaseModel):
    group_id: int # 이제 그룹 ID가 필수
    market: str
    code: str
    name: str

class UserFavoriteResponse(BaseModel):
    id: int
    group_id: int | None
    market: str
    code: str
    name: str | None
    created_at: datetime

    class Config:
        from_attributes = True