import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from core.database import get_db
from core.security.dependencies import get_current_user
from models.user import User
from models.user_favorite_group import UserFavoriteGroup
from schemas.user_favorite_group import GroupCreate, GroupResponse, UserFavoriteCreate, UserFavoriteResponse
from models.user_favorite import UserFavorite

logger = logging.getLogger(__name__)
# [중요] prefix가 정확해야 404가 안 뜹니다.
router = APIRouter(prefix="/users/me/favorites", tags=["Favorites (Groups & Stocks)"])

# --- 그룹 관리 API ---

@router.get("/groups", response_model=List[GroupResponse])
async def get_groups(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """나의 관심 그룹 목록 조회"""
    result = await db.execute(select(UserFavoriteGroup).where(UserFavoriteGroup.user_id == user.user_id).order_by(UserFavoriteGroup.created_at))
    groups = result.scalars().all()
    
    if not groups:
        default_group = UserFavoriteGroup(user_id=user.user_id, name="기본 그룹")
        db.add(default_group)
        await db.commit()
        await db.refresh(default_group)
        return [default_group]
        
    return groups

@router.post("/groups", response_model=GroupResponse)
async def create_group(
    group_in: GroupCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """새 그룹 생성"""
    new_group = UserFavoriteGroup(user_id=user.user_id, name=group_in.name)
    db.add(new_group)
    await db.commit()
    await db.refresh(new_group)
    return new_group

@router.delete("/groups/{group_id}")
async def delete_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """그룹 삭제"""
    result = await db.execute(select(UserFavoriteGroup).where(UserFavoriteGroup.user_id == user.user_id, UserFavoriteGroup.group_id == group_id))
    group = result.scalars().first()
    if not group:
        raise HTTPException(status_code=404, detail="그룹을 찾을 수 없습니다.")
    
    await db.delete(group)
    await db.commit()
    return {"message": "그룹이 삭제되었습니다."}

# --- 주식 관리 API ---

@router.get("/stocks", response_model=List[UserFavoriteResponse])
async def get_all_stocks(
    group_id: int = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """내 모든 관심종목 조회"""
    stmt = select(UserFavorite).where(UserFavorite.user_id == user.user_id)
    if group_id:
        stmt = stmt.where(UserFavorite.group_id == group_id)
    
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/stocks", response_model=UserFavoriteResponse)
async def add_stock_to_group(
    stock_in: UserFavoriteCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """특정 그룹에 주식 추가"""
    exists = await db.execute(select(UserFavorite).where(
        UserFavorite.user_id == user.user_id,
        UserFavorite.group_id == stock_in.group_id,
        UserFavorite.code == stock_in.code
    ))
    if exists.scalars().first():
        raise HTTPException(status_code=409, detail="이미 해당 그룹에 존재하는 종목입니다.")

    new_stock = UserFavorite(
        user_id=user.user_id,
        group_id=stock_in.group_id,
        market=stock_in.market,
        code=stock_in.code,
        name=stock_in.name
    )
    db.add(new_stock)
    await db.commit()
    await db.refresh(new_stock)
    return new_stock

@router.delete("/stocks")
async def delete_stock(
    code: str,
    group_id: int = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    stmt = select(UserFavorite).where(UserFavorite.user_id == user.user_id, UserFavorite.code == code)
    if group_id:
        stmt = stmt.where(UserFavorite.group_id == group_id)
        
    result = await db.execute(stmt)
    stocks = result.scalars().all()
    
    if not stocks:
        raise HTTPException(status_code=404, detail="삭제할 종목이 없습니다.")
        
    for s in stocks:
        await db.delete(s)
        
    await db.commit()
    return {"message": "삭제되었습니다."}