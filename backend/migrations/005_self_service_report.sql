-- ============================================================
-- 2026-09 航空一体化产品升级（自助报告 + 持久化任务）
-- 显式迁移：生产环境执行 psql 执行本文件；开发环境应用启动时会执行
-- 等价的 ADD COLUMN IF NOT EXISTS（见 app/main.py lifespan），二者幂等。
-- 回滚：见文件底部。
-- ============================================================

-- 1) assessments 追溯与报告凭证字段
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS consent_version VARCHAR(32);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS capture_protocol_version VARCHAR(64);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS question_protocol_version VARCHAR(64);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS content_version VARCHAR(64);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS report_status VARCHAR(16) NOT NULL DEFAULT 'none';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS report_access_token_hash VARCHAR(128);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS report_access_token_created_at TIMESTAMPTZ;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS report_access_token_revoked_at TIMESTAMPTZ;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS processing_attempts INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS ix_assessments_report_token ON assessments (report_access_token_hash);

-- 旧数据回填：有结果的记录报告状态为 ready，其余 none
UPDATE assessments SET report_status = 'ready'
WHERE report_status = 'none' AND id IN (SELECT assessment_id FROM assessment_results);

-- 2) assessment_results 报告模板版本（追溯报告解读口径）
ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS report_template_version VARCHAR(32);

-- 3) 持久化后台任务表（替代仅请求内 BackgroundTasks）
CREATE TABLE IF NOT EXISTS processing_tasks (
    id UUID PRIMARY KEY,
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    scene VARCHAR(20) NOT NULL DEFAULT 'aviation',
    stage VARCHAR(32) NOT NULL DEFAULT 'video_processing',
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_by VARCHAR(64),
    locked_at TIMESTAMPTZ,
    lease_seconds INTEGER NOT NULL DEFAULT 600,
    last_error TEXT,
    uncertain_remote BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_processing_tasks_assessment ON processing_tasks (assessment_id);
CREATE INDEX IF NOT EXISTS ix_processing_tasks_status ON processing_tasks (status);
CREATE INDEX IF NOT EXISTS ix_processing_tasks_next_run ON processing_tasks (next_run_at);

-- 4) 兼容：为提交早于本升级、但尚在处理中的旧测评补建任务行（重启后可被 worker 恢复）
INSERT INTO processing_tasks (id, assessment_id, scene, stage, status, next_run_at)
SELECT gen_random_uuid(), a.id, a.scene, 'video_processing', 'pending', now()
FROM assessments a
WHERE a.status IN ('pending', 'video_processing', 'uploading', 'queued', 'processing', 'report_generating')
  AND NOT EXISTS (SELECT 1 FROM processing_tasks t WHERE t.assessment_id = a.id);

-- ------------------------------------------------------------
-- 回滚（如需）：
-- DROP TABLE IF EXISTS processing_tasks;
-- ALTER TABLE assessments DROP COLUMN IF EXISTS report_access_token_hash;
-- ALTER TABLE assessments DROP COLUMN IF EXISTS report_access_token_created_at;
-- ALTER TABLE assessments DROP COLUMN IF EXISTS report_access_token_revoked_at;
-- ALTER TABLE assessments DROP COLUMN IF EXISTS processing_attempts;
-- ALTER TABLE assessments DROP COLUMN IF EXISTS report_status;
-- ALTER TABLE assessments DROP COLUMN IF EXISTS consent_version;
-- ALTER TABLE assessments DROP COLUMN IF EXISTS capture_protocol_version;
-- ALTER TABLE assessments DROP COLUMN IF EXISTS question_protocol_version;
-- ALTER TABLE assessments DROP COLUMN IF EXISTS content_version;
-- ALTER TABLE assessment_results DROP COLUMN IF EXISTS report_template_version;
-- ------------------------------------------------------------
