from pydantic import BaseModel
from datetime import datetime

class UserFavoriteBase(BaseModel):
    market: str
    code: str
    name: str

class UserFavoriteCreate(UserFavoriteBase):
    pass

class UserFavoriteResponse(UserFavoriteBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True