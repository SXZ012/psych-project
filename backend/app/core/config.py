"""应用配置：基于 pydantic-settings，统一从仓库根目录的 .env 读取。"""

from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
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
    COMMUNITY_APPOINTMENTS_ENABLED: bool = False  # 开通接待团队后才开启正式预约
    DEBUG: bool = True
    SQL_ECHO: bool = False  # 打印 SQL（调试用；默认关，保持日志清爽）
    SECRET_KEY: str = "change-me"
    ADMIN_PASSWORD: str = "psych-admin"  # 后台 /admin 登录口令（生产改强密码，走 .env）
    REVIEWER_PASSWORD: str = ""  # 复核员口令（空=未开通；终端/后台按角色区分）
    CORS_ORIGINS: str = "*"
    API_V1_PREFIX: str = "/api/v1"
    ASSESSMENT_DURATION_SECONDS: int = 60  # 方案：60秒快筛
    SESSION_PAIR_COUNT: int = 6  # 单次测评轮播图片数（6 张 × 10s = 60 秒核心分析段）
    CREATE_TABLES_ON_START: bool = True  # dev 便捷：启动即建表（生产改用 Alembic）
    # ---- 自助报告查询 ----
    # 查询码哈希 pepper：泄漏数据库无法直接比对出明文码；生产必改。
    REPORT_TOKEN_PEPPER: str = "change-me-report-pepper"
    # 查询失败限频：window 秒内最多 max_attempts 次（同一来源跨编号累计）
    REPORT_LOOKUP_WINDOW_SECONDS: int = 300
    REPORT_LOOKUP_MAX_ATTEMPTS: int = 5
    # ---- 持久化后台任务 ----
    INPROCESS_WORKER: bool = True  # API 进程内启动轻量 worker（生产用独立 worker 时关掉）
    WORKER_POLL_INTERVAL: float = 2.0  # worker 空闲轮询间隔（秒）
    WORKER_BATCH: int = 4  # 单轮最多领取任务数
    TASK_MAX_ATTEMPTS: int = 3
    TASK_BACKOFF_BASE_SECONDS: int = 30  # 退避：attempt*n*base
    TASK_LEASE_SECONDS: int = 600  # 领取租约；崩溃后超时任务可被重新领取

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
    V3_POLL_TIMEOUT: int = 1800  # 真实任务可能因视频规格/排队超过10分钟

    # ---- 阿里云百炼 / QwenPlus（1.0后台报告专业化表达，不重算V3分数）----
    DASHSCOPE_API_KEY: str = ""
    QWEN_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    QWEN_MODEL: str = "qwen-plus"

    # ---- 微信公众号(社区场景: OAuth + 支付 + 模板消息) ----
    WECHAT_APP_ID: str = ""  # 公众号 AppID(未填 = Mock 模式)
    WECHAT_APP_SECRET: str = ""  # 公众号 AppSecret
    WECHAT_TEMPLATE_ID: str = ""  # 模板消息模板 ID
    WECHAT_MCH_ID: str = ""  # 微信支付商户号(未填 = Mock 支付)
    WECHAT_API_V3_KEY: str = ""  # 支付 APIv3 密钥
    WECHAT_MCH_SERIAL_NO: str = ""  # 商户证书序列号
    WECHAT_MCH_PRIVATE_KEY_PATH: str = ""  # 商户私钥文件路径
    WECHAT_PAY_NOTIFY_URL: str = ""  # 支付回调地址(上云后填)
    WECHAT_OAUTH_REDIRECT_URL: str = ""  # OAuth 回调地址(上云后填)

    # ---- 阿里云 OSS（诱发图片库 + 我方视频备份，私有Bucket）----
    OSS_BACKUP_ENABLED: bool = False
    OSS_ACCESS_KEY_ID: str = ""
    OSS_ACCESS_KEY_SECRET: str = ""
    OSS_ENDPOINT: str = ""
    OSS_BUCKET_NAME: str = ""
    # Reports/attachments are independent of raw video retention.
    REPORT_STORAGE_MODE: str = "local"  # local | oss

    # ---- 公共运行时静态资源（独立于保存测评/报告的私有 OSS Bucket）----
    ASSET_OSS_ACCESS_KEY_ID: str = ""
    ASSET_OSS_ACCESS_KEY_SECRET: str = ""
    ASSET_OSS_ENDPOINT: str = ""  # 空值复用 OSS_ENDPOINT
    ASSET_OSS_BUCKET_NAME: str = ""
    ASSET_CDN_BASE_URL: str = ""  # 例如 https://static.example.com

    @property
    def static_asset_access_key_id(self) -> str:
        return self.ASSET_OSS_ACCESS_KEY_ID or self.OSS_ACCESS_KEY_ID

    @property
    def static_asset_access_key_secret(self) -> str:
        return self.ASSET_OSS_ACCESS_KEY_SECRET or self.OSS_ACCESS_KEY_SECRET

    @property
    def static_asset_endpoint(self) -> str:
        return (
            (self.ASSET_OSS_ENDPOINT or self.OSS_ENDPOINT)
            .removeprefix("https://")
            .removeprefix("http://")
            .rstrip("/")
        )

    @property
    def static_asset_bucket_name(self) -> str:
        return self.ASSET_OSS_BUCKET_NAME or self.OSS_BUCKET_NAME

    @property
    def static_asset_base_url(self) -> str:
        cdn_base = self.ASSET_CDN_BASE_URL.strip().rstrip("/")
        if cdn_base:
            return cdn_base
        if self.static_asset_bucket_name and self.static_asset_endpoint:
            return f"https://{self.static_asset_bucket_name}.{self.static_asset_endpoint}"
        return ""

    @model_validator(mode="after")
    def _prod_weak_value_guard(self) -> "Settings":
        """ENV=prod 时拒绝默认弱密钥/口令启动（dev 不受影响）。

        SECRET_KEY 签发社区 JWT、ADMIN_PASSWORD 是后台口令、
        REPORT_TOKEN_PEPPER 保护查询码哈希——任何一个用默认值上生产
        都等于裸奔，这里直接 fail-fast。
        """
        if self.REPORT_STORAGE_MODE not in {"local", "oss"}:
            raise ValueError("REPORT_STORAGE_MODE 必须是 local 或 oss")
        if self.REPORT_STORAGE_MODE == "oss" and not all(
            (
                self.OSS_ACCESS_KEY_ID,
                self.OSS_ACCESS_KEY_SECRET,
                self.OSS_BUCKET_NAME,
                self.OSS_ENDPOINT,
            )
        ):
            raise ValueError("报告 OSS 存储已启用，但 OSS 配置不完整")
        if self.ENV == "prod":
            weak = []
            if self.SECRET_KEY == "change-me":
                weak.append("SECRET_KEY")
            if self.ADMIN_PASSWORD == "psych-admin":
                weak.append("ADMIN_PASSWORD")
            if self.REPORT_TOKEN_PEPPER == "change-me-report-pepper":
                weak.append("REPORT_TOKEN_PEPPER")
            if weak:
                raise ValueError(
                    f"ENV=prod 仍在使用默认弱值: {', '.join(weak)}；请在 .env 中覆盖后再启动"
                )
        return self

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
