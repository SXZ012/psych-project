"""结构化日志配置：控制台 + 滚动文件(logs/app.log)，关键节点可查。

Demo 阶段用可读格式（时间 | 级别 | logger | 消息）；
生产(阶段7)可切换 JSON 输出，便于日志汇聚与检索。
"""

import logging
import logging.config
from pathlib import Path

from app.core.config import settings

_REPO_ROOT = Path(__file__).resolve().parents[3]
_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"


def setup_logging() -> None:
    log_dir = _REPO_ROOT / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    level = "DEBUG" if settings.DEBUG else "INFO"

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {"standard": {"format": _FORMAT}},
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "stream": "ext://sys.stdout",
                    "formatter": "standard",
                    "level": level,
                },
                "file": {
                    "class": "logging.handlers.RotatingFileHandler",
                    "filename": str(log_dir / "app.log"),
                    "maxBytes": 10 * 1024 * 1024,
                    "backupCount": 5,
                    "encoding": "utf-8",
                    "formatter": "standard",
                    "level": level,
                },
            },
            "root": {"handlers": ["console", "file"], "level": level},
            "loggers": {
                "uvicorn": {"handlers": ["console", "file"], "level": "INFO", "propagate": False},
                "uvicorn.access": {
                    "handlers": ["console", "file"],
                    "level": "INFO",
                    "propagate": False,
                },
                "app": {"handlers": ["console", "file"], "level": level, "propagate": False},
            },
        }
    )
