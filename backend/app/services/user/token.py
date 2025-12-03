from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload
from datetime import datetime, timedelta, timezone

from core.config import settings
from models.user import User
from models.refresh_token import RefreshToken

class TokenService:
    async def save_refresh_token(
        self, 
        db: AsyncSession, 
        user_id: int, 
        token: str,
    ) -> RefreshToken:
        """
        Refresh Token을 DB에 저장
        """
        expires_delta = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        expires_at = datetime.now(timezone.utc) + expires_delta

        new_token = RefreshToken(
            user_id=user_id,
            token=token, # 암호화되지 않은 실제 토큰 (보안 강화를 위해 해싱할 수도 있음)
            expires_at=expires_at,
        )
        db.add(new_token)
        await db.commit()
        await db.refresh(new_token)
        return new_token

    async def get_user_by_refresh_token(
        self, 
        db: AsyncSession, 
        token: str
    ) -> User | None:
        """
        (토큰 재발급 시 사용)
        유효한 Refresh Token으로 사용자 조회
        """
        result = await db.execute(
            select(RefreshToken)
            .where(
                RefreshToken.token == token,
                RefreshToken.is_revoked == False, # 폐기되지 않았고
                RefreshToken.expires_at > datetime.now(timezone.utc) # 만료되지 않은
            )
            .options(joinedload(RefreshToken.user)) # User 정보 join
        )
        refresh_token_obj = result.scalars().first()

        if refresh_token_obj:
            refresh_token_obj.is_revoked = True
            db.add(refresh_token_obj)
            await db.commit()

            return refresh_token_obj.user
        return None
    
token_service = TokenService()