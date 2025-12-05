import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.lifespan import lifespan
from routers import user_profile, user_favorite_group
from routers.auth import user_general, user_social, token
from routers.stock import ranking, realtime, info, ai, search

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], # 교차-출처 요청을 보낼 수 있는 출처의 리스트
    allow_credentials=True, # 교차-출처 요청시 쿠키 지원 여부를 설정
    allow_methods=["*"], # 교차-출처 요청을 허용하는 HTTP 메소드의 리스트
    allow_headers=["*"], # 교차-출처를 지원하는 HTTP 요청 헤더의 리스트
)

# 라우터 연결
app.include_router(user_general.router)
app.include_router(user_social.router)
app.include_router(user_profile.router)
app.include_router(token.router)
app.include_router(ranking.router)
app.include_router(info.router)
app.include_router(search.router)
app.include_router(realtime.router)
app.include_router(ai.router)
app.include_router(user_favorite_group.router)

@app.get("/")
def read_root():
    return {"message": "Zero to Mars API"}

if __name__ == "__main__":
    uvicorn.run("main:app",
                host="localhost",
                port=8000,
                reload=True)
