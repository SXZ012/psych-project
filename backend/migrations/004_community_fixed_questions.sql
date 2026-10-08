-- 社区会话固定题组：同一支付会话刷新、重进时仍恢复本次已选题组。
BEGIN;
ALTER TABLE assessment_sessions
    ADD COLUMN IF NOT EXISTS selected_pair_ids TEXT;
COMMIT;
