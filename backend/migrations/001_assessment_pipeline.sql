-- Apply once when upgrading an existing PostgreSQL database.
-- The dev app also performs these additive checks at startup.
ALTER TYPE assessment_status ADD VALUE IF NOT EXISTS 'video_processing';
ALTER TYPE assessment_status ADD VALUE IF NOT EXISTS 'queued';
ALTER TYPE assessment_status ADD VALUE IF NOT EXISTS 'report_generating';

ALTER TABLE assessments ADD COLUMN IF NOT EXISTS video_storage_key VARCHAR(256);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS backup_storage_key VARCHAR(256);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS backup_status VARCHAR(32);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS partner_upload_status VARCHAR(32);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS partner_file_id VARCHAR(128);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS video_status VARCHAR(32);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS selections_data JSONB;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS error_code VARCHAR(64);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS report_generated_at TIMESTAMPTZ;
