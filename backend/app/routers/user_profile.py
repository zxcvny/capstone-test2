import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from core.database import get_db
from core.security.dependencies import get_current_user
from core.security.hashing import hash_password, verify_password
from models.user import User
from schemas.user import UserPublic, UserUpdate, MessageResponse
from services.user.general import user_general_service

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/users", 
    tags=["User-Profile"],
    dependencies=[Depends(get_current_user)] 
)

@router.get("/me", response_model=UserPublic)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """현재 로그인된 사용자 정보 반환"""
    return current_user

@router.patch("/me", response_model=UserPublic)
async def update_users_me(
    user_in: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """현재 로그인된 (일반) 사용자 정보 수정"""

    if not current_user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="소셜 로그인 사용자는 이 정보를 수정할 수 없습니다."
        )

    if user_in.password:
        if not user_in.current_password:
            raise HTTPException(
                status_code=400,
                detail="비밀번호 변경을 위해 현재 비밀번호를 입력해주세요."
            )

        if not verify_password(user_in.current_password, current_user.hashed_password):
            raise HTTPException(
                status_code=400,
                detail="현재 비밀번호가 일치하지 않습니다."
            )

    try:
        updated_user = await user_general_service.update_user(db, user=current_user, user_in=user_in)
        return updated_user
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"⛔ 사용자 정보 수정 중 예외: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="서버 오류 발생")

@router.delete("/me", response_model=MessageResponse)
async def delete_users_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """현재 로그인된 사용자 탈퇴 (비활성화)"""
    try:
        await user_general_service.deactivate_user(db, user=current_user)
        return MessageResponse(message="회원 탈퇴(비활성화) 처리되었습니다.")
    except Exception as e:
        logger.error(f"⛔ 회원 탈퇴 처리 중 예외: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="서버 오류 발생")