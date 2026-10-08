#!/usr/bin/env python3
"""V3 独立联调工具：校验配置，或上传一个视频并保存真实结果。"""

from __future__ import annotations

import argparse
import asyncio
import copy
import json
import sys
from datetime import datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings  # noqa: E402
from app.services.v3.real import RealV3Client, V3IntegrationError  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="V3 联调：上传视频创建任务，或通过 --task-id 续取已有任务。"
    )
    parser.add_argument("--video", type=Path, help="30 秒以上、正面清晰人脸的视频")
    parser.add_argument(
        "--task-id",
        type=int,
        help="续取已创建的 V3 任务结果，不重复上传视频或创建任务",
    )
    parser.add_argument("--sds-score", type=float, default=None, help="可选 SDS 分数（0-100）")
    parser.add_argument("--sas-score", type=float, default=None, help="可选 SAS 分数（0-100）")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=REPO_ROOT / "data" / "v3-integration",
        help="结果保存目录（默认位于已被 Git 忽略的 data/）",
    )
    parser.add_argument("--skip-timeline", action="store_true", help="不下载约 8MB 的 timeline")
    return parser


def make_client() -> RealV3Client:
    return RealV3Client(
        api_root=settings.V3_API_ROOT,
        token=settings.V3_BASIC_TOKEN,
        alg_service_uuid=settings.V3_ALG_SERVICE_UUID,
        bucket_id=settings.V3_OSS_BUCKET_ID,
        poll_interval=settings.V3_POLL_INTERVAL,
        poll_timeout=settings.V3_POLL_TIMEOUT,
    )


async def run(args: argparse.Namespace) -> int:
    try:
        client = make_client()
    except V3IntegrationError as exc:
        print(f"[配置未就绪] {exc}", file=sys.stderr)
        return 2

    print("[配置通过] API Key 与算法服务 UUID 已加载（密钥不会输出）")
    if args.video is None and args.task_id is None:
        print("[安全检查] 未上传文件、未创建远端任务。传入 --video 或 --task-id 后继续。")
        return 0
    if args.video is not None and args.task_id is not None:
        print("[输入错误] --video 与 --task-id 只能选择一个", file=sys.stderr)
        return 2
    if args.video is not None and not args.video.is_file():
        print(f"[输入错误] 视频不存在：{args.video}", file=sys.stderr)
        return 2

    if args.task_id is not None:
        task_id = args.task_id
        print(f"[续取任务] task_id={task_id}，不会重复上传视频")
    else:
        size_mb = args.video.stat().st_size / 1024 / 1024
        print(f"[1/4] 登记并上传视频：{args.video.name}（{size_mb:.1f} MB）")
        file_url, file_id = await client.upload_video(args.video)
        print(f"[2/4] 合作方 OSS 上传完成，file_id={file_id}")

        task = await client.create_task(
            file_url=file_url,
            file_id=file_id,
            sds_score=args.sds_score,
            sas_score=args.sas_score,
        )
        task_id = task["id"]
        print(
            f"[3/4] V3 任务已创建，task_id={task_id}，"
            f"开始轮询（最长 {settings.V3_POLL_TIMEOUT} 秒）"
        )
    final_task = await client.wait_task(task_id)
    result = await client.get_result(final_task)

    run_dir = args.output_dir / datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir.mkdir(parents=True, exist_ok=False)
    saved_result = copy.deepcopy(result)
    timeline_url = result.get("timeline")
    if isinstance(timeline_url, str) and timeline_url and not args.skip_timeline:
        timeline = await client.download_timeline(timeline_url)
        (run_dir / "timeline.json").write_text(
            json.dumps(timeline, ensure_ascii=False), encoding="utf-8"
        )
        saved_result["timeline"] = "timeline.json（已在有效期内下载）"

    (run_dir / "result.json").write_text(
        json.dumps(saved_result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    summary = result.get("summary") or {}
    overall = summary.get("overall") or {}
    print(
        "[4/4] 联调成功："
        f"algorithm={result.get('algorithm_version') or '-'}，"
        f"overall={overall.get('score') if overall.get('score') is not None else '-'}"
    )
    print(f"[结果目录] {run_dir}")
    return 0


def main() -> int:
    args = build_parser().parse_args()
    try:
        return asyncio.run(run(args))
    except (V3IntegrationError, TimeoutError) as exc:
        print(f"[联调失败] {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("[已取消] 用户终止联调", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
