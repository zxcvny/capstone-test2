import enum
from sqlalchemy import Column, String, DateTime, func, ForeignKey, Enum as SAEnum, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from core.database import Base

class AuthProvider(str, enum.Enum):
    KAKAO = "kakao"
    GOOGLE = "google"

class SocialAccount(Base):
    """
    연동된 소셜 계정 정보
    """
    __tablename__ = "social_accounts"

    social_account_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)

    provider = Column(SAEnum(AuthProvider, name="auth_provider_enum"), nullable=False)
    provider_user_id = Column(String(255), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="social_accounts")

    __table_args__ = (
        UniqueConstraint('provider', 'provider_user_id', name='uq_provider_user_id'),
    )