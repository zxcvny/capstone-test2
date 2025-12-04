from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.database import Base

class UserFavorite(Base):
    __tablename__ = "user_favorite"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    
    group_id = Column(Integer, ForeignKey("user_favorite_groups.group_id", ondelete="CASCADE"), nullable=True)

    market = Column(String(20), nullable=False)
    code = Column(String(20), nullable=False)
    name = Column(String(100), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="user_favorite")
    
    group = relationship("UserFavoriteGroup", back_populates="stocks")

    __table_args__ = (
        UniqueConstraint('user_id', 'group_id', 'market', 'code', name='uq_user_favorite_in_group'),
    )