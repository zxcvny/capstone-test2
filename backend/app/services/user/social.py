from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload

from models.user import User
from models.social_account import SocialAccount, AuthProvider

class UserSocialService:
    async def create_user_social(
        self, 
        db: AsyncSession, 
        provider: AuthProvider, 
        provider_user_id: str, 
        name: str,
        email: str | None = None,
        phone_number: str | None = None
    ) -> User:
        """소셜 로그인으로 신규 사용자 생성"""
        
        new_user = User(
            email=email, 
            name=name,
            phone_number=phone_number
        )
        db.add(new_user)
        await db.flush()

        new_social_account = SocialAccount(
            user_id=new_user.user_id,
            provider=provider,
            provider_user_id=provider_user_id
        )
        db.add(new_social_account)
        
        await db.commit()
        await db.refresh(new_user)
        
        return new_user
    
    async def get_user_by_social(self, db: AsyncSession, provider: AuthProvider, provider_user_id: str) -> User | None:
        """소셜 계정 정보로 마스터 사용자 찾기"""
        result = await db.execute(
            select(SocialAccount)
            .where(SocialAccount.provider == provider, SocialAccount.provider_user_id == provider_user_id)
            .options(joinedload(SocialAccount.user)) # User 정보 join
        )
        social_account = result.scalars().first()
        return social_account.user if social_account else None
    
    async def get_or_create_user_social(
        self, 
        db: AsyncSession, 
        provider: AuthProvider, 
        provider_user_id: str, 
        name: str,
        email: str | None = None,
        phone_number: str | None = None
    ) -> User:
        """소셜 로그인 시 사용자 조회 또는 생성"""
        
        user = await self.get_user_by_social(db, provider, provider_user_id)
        if user:
            return user
        
        # 이메일이 이미 존재하면 계정 통합 로직 추가(나중에)
        
        user = await self.create_user_social(db, provider, provider_user_id, name, email, phone_number)
        return user
    
user_social_service = UserSocialService()