from sqlalchemy import Column, String, DateTime, func, Boolean, Integer
from sqlalchemy.orm import relationship

from core.database import Base

class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=True)
    username = Column(String(100), unique=True, index=True, nullable=True)
    email = Column(String(255), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=True)
    phone_number = Column(String(20), index=True, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now(), nullable=False)
    
    social_accounts = relationship("SocialAccount", back_populates="user", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    # interest_stocks = relationship("UserStock", back_populates="user", cascade="all, delete-orphan")

    @property
    def is_social(self) -> bool:
        return not bool(self.hashed_password)
    
    @property
    def social_provider(self) -> str | None:
        if self.social_accounts and len(self.social_accounts) > 0:
            return self.social_accounts[0].provider.value 
        return None