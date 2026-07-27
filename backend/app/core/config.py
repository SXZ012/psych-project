"""应用配置：基于 pydantic-settings，统一从仓库根目录的 .env 读取。"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> parents[3] 即仓库根目录
_REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- 应用 ----
    APP_NAME: str = "高责任岗位心理测评系统"
    ENV: str = "dev"  # dev | prod
    DEBUG: bool = True
    SQL_ECHO: bool = False  # 打印 SQL（调试用；默认关，保持日志清爽）
    SECRET_KEY: str = "change-me"
    CORS_ORIGINS: str = "*"
    API_V1_PREFIX: str = "/api/v1"
    ASSESSMENT_DURATION_SECONDS: int = 60  # 方案：60秒快筛
    SESSION_PAIR_COUNT: int = 4  # 单次测评轮播图片数（每张~12-13s）
    CREATE_TABLES_ON_START: bool = True  # dev 便捷：启动即建表（生产改用 Alembic）

    # ---- 路线开关 (方案 Demo 路线 A/B) ----
    PROVIDER_MODE: str = "mock"  # mock | real

    # ---- PostgreSQL ----
    POSTGRES_USER: str = "psych"
    POSTGRES_PASSWORD: str = "psych"
    POSTGRES_DB: str = "psych"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    DATABASE_URL: str | None = None  # 留空则自动拼接

    # ---- Redis ----
    REDIS_URL: str = "redis://localhost:6379/0"

    # ---- V3 心理生理状态评估算法（合作方）----
    V3_API_ROOT: str = "https://me.i-llusion.cn"
    V3_BASIC_TOKEN: str = ""  # 鉴权头：Authorization: Token <V3_BASIC_TOKEN>
    V3_ALG_SERVICE_UUID: str = ""
    V3_OSS_BUCKET_ID: int = 1
    V3_POLL_INTERVAL: int = 5
    V3_POLL_TIMEOUT: int = 600

    # ---- 阿里云百炼 / QwenPlus（个性化报告解读）----
    DASHSCOPE_API_KEY: str = ""
    QWEN_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    QWEN_MODEL: str = "qwen-plus"

    # ---- 阿里云 OSS（诱发图片库；视频走合作方 OSS，不在此）----
    OSS_ACCESS_KEY_ID: str = ""
    OSS_ACCESS_KEY_SECRET: str = ""
    OSS_ENDPOINT: str = ""
    OSS_BUCKET_NAME: str = ""

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def cors_origins(self) -> list[str]:
        if self.CORS_ORIGINS.strip() in ("*", ""):
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
