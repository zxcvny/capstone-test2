from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone

from core.security.hashing import hash_password
from models.user import User
from models.refresh_token import RefreshToken
from schemas.user import UserUpdate

class UserGeneralService:
    async def check_existence(
            self,
            db: AsyncSession,
            field: str,
            value: str
    ) -> bool:
        """실시간 중복 확인: 존재하면 True, 없으면 False"""
        if field == "username":
            query = select(User).where(User.username == value)
        elif field == "email":
            query = select(User).where(User.email == value)
        else:
            raise ValueError("지원하지 않는 필드입니다.")
        
        result = await db.execute(query)
        return result.scalars().first() is not None
    
    async def create_user_general(
        self, 
        db: AsyncSession, 
        username: str,
        email: str,
        password: str,
        name: str,
        phone_number: str | None = None
    ) -> User:
        """일반 회원가입으로 신규 사용자 생성"""
        
        hashed_pass = hash_password(password)
        
        new_user = User(
            username=username,
            email=email, 
            hashed_password=hashed_pass,
            name=name,
            phone_number=phone_number
        )
        db.add(new_user)
        await db.commit()
        
        query = select(User).options(selectinload(User.social_accounts)).where(User.user_id == new_user.user_id)
        result = await db.execute(query)
        new_user = result.scalars().first()
        
        return new_user
    
    async def get_user_by_id(self, db: AsyncSession, user_id: int) -> User | None:
        """ID로 마스터 사용자 조회"""
        stmt = (
            select(User)
            .where(User.user_id == user_id)
            .options(selectinload(User.social_accounts)) 
        )
        result = await db.execute(stmt)
        return result.scalars().first()
    
    async def get_user_by_username_or_email(self, db: AsyncSession, username_or_email: str) -> User | None:
        """이메일 또는 유저이름으로 마스터 사용자 조회"""
        result = await db.execute(
            select(User).where(
                (User.username == username_or_email) | (User.email == username_or_email)
            )
        )
        return result.scalars().first()
    
    async def update_user(
        self, 
        db: AsyncSession, 
        user: User, 
        user_in: UserUpdate
    ) -> User:
        """(일반 사용자) 사용자 정보 업데이트"""
        
        if user_in.username:
            # 유저이름 중복 확인
            existing_user = await self.get_user_by_username_or_email(db, user_in.username)
            if existing_user and existing_user.user_id != user.user_id:
                raise ValueError("이미 사용 중인 아이디입니다.")
            user.username = user_in.username
        
        if user_in.password:
            user.hashed_password = hash_password(user_in.password)
        
        user.updated_at = datetime.now(timezone.utc)
        
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
        return user
    
    async def deactivate_user(
        self,
        db: AsyncSession,
        user: User
    ) -> User:
        """회원 비활성화 (Soft Delete)"""
        user.is_active = False
        user.updated_at = datetime.now(timezone.utc)
        
        result = await db.execute(select(RefreshToken).where(RefreshToken.user_id == user.user_id))
        tokens = result.scalars().all()

        for token in tokens:
            token.is_revoked = True
            db.add(token)

        db.add(user)
        await db.commit()
        await db.refresh(user)
        
        return user
    
user_general_service = UserGeneralService()