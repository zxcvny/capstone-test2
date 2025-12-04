from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.database import Base

class UserFavoriteGroup(Base):
    __tablename__ = "user_favorite_groups"

    group_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    name = Column(String(50), nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="user_favorite_groups")
    stocks = relationship("UserFavorite", back_populates="group", cascade="all, delete-orphan")