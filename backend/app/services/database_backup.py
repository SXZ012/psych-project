"""Create a PostgreSQL custom archive without printing credentials or record contents."""

import os
import shutil
import subprocess
from pathlib import Path

from app.db.base import engine


def create_database_backup(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    url = engine.url
    pg_dump = shutil.which("pg_dump")
    pg_restore = shutil.which("pg_restore")
    env = os.environ.copy()
    if pg_dump and pg_restore:
        env.update(
            PGHOST=url.host or "localhost",
            PGPORT=str(url.port or 5432),
            PGUSER=url.username or "psych",
            PGPASSWORD=url.password or "",
            PGDATABASE=url.database or "psych",
        )
        dump = [pg_dump, "--format=custom", "--no-owner", "--no-acl"]
        verify = [pg_restore, "--list"]
    elif shutil.which("docker") and url.host in {"localhost", "127.0.0.1"}:
        dump = [
            "docker",
            "exec",
            "psych-db",
            "pg_dump",
            "-U",
            url.username or "psych",
            "-d",
            url.database or "psych",
            "--format=custom",
            "--no-owner",
            "--no-acl",
        ]
        verify = ["docker", "exec", "-i", "psych-db", "pg_restore", "--list"]
    else:
        raise RuntimeError("未找到 pg_dump/pg_restore 或本地 psych-db 容器，未生成备份")
    temporary = path.with_suffix(".dump.tmp")
    try:
        with temporary.open("wb") as output:
            result = subprocess.run(
                dump, stdout=output, stderr=subprocess.PIPE, env=env, timeout=120
            )
        if result.returncode or temporary.stat().st_size < 5:
            raise RuntimeError("数据库备份失败，未发布；请检查数据库连接和备份工具")
        with temporary.open("rb") as archive:
            if archive.read(5) != b"PGDMP":
                raise RuntimeError("数据库备份格式校验失败")
        # Reopen instead of seeking inside Python's buffered reader: subprocess
        # inherits the OS descriptor offset, not the reader's buffered position.
        with temporary.open("rb") as archive:
            check = subprocess.run(
                verify,
                stdin=archive,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                env=env,
                timeout=120,
            )
        if check.returncode:
            raise RuntimeError("数据库备份目录验证失败")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
    return path
