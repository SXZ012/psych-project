"""独立后台处理 worker 进程：python -m app.worker

生产部署建议：
    uvicorn（API，INPROCESS_WORKER=false）+ 1..N 个 `python -m app.worker`
同一任务由数据库行锁（FOR UPDATE SKIP LOCKED）保证只有一个 worker 执行；
worker 崩溃后租约到期，任务被其他实例重新领取。
"""

import asyncio
import logging

from app.core.log import setup_logging
from app.db.base import engine
from app.services.processing import ProcessingWorker

setup_logging()
logger = logging.getLogger("app.worker")


async def main() -> None:
    worker = ProcessingWorker(worker_id="standalone")
    try:
        await worker.run_forever()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("worker 收到中断，退出")
