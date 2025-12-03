import os
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # URL & URI
    DATABASE_URL: str
    FRONTEND_URL: str
    KIS_BASE_URL: str
    KIS_WS_URL: str
    TWELVEDATA_BASE_URL: str
    KAKAO_REDIRECT_URI: str
    GOOGLE_REDIRECT_URI: str

    # Keys
    KIS_APP_KEY: str
    KIS_SECRET_KEY: str

    DOMESTIC_STOCK_PRICE_TR_ID: str
    OVERSEAS_STOCK_PRICE_TR_ID: str

    TWELVEDATA_API_KEY: str

    KAKAO_CLIENT_ID: str
    KAKAO_CLIENT_SECRET: str

    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int
    REFRESH_TOKEN_EXPIRE_DAYS: int

    class Config:
        current_file_dir = os.path.dirname(os.path.abspath(__file__))
        app_dir = os.path.dirname(current_file_dir)
        backend_dir = os.path.dirname(app_dir)

        env_file = os.path.join(backend_dir, ".env")
        env_file_encoding = "utf-8"

@lru_cache()
def get_settings() -> Settings:
    return Settings()

settings = get_settings()