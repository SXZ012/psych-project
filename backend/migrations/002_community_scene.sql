-- 002_community_scene.sql
-- 社区场景正式迁移：设备/用户/会话/订单四张新表 + assessments、pairs 双场景扩展列。
-- 生产环境执行本文件，不依赖应用启动时的自动建表/补列（dev 环境保留 create_all 便利）。
-- 幂等：可重复执行。

BEGIN;

-- ================= 1. 新表 =================

CREATE TABLE IF NOT EXISTS devices (
    device_id       VARCHAR(64)  PRIMARY KEY,
    scene           VARCHAR(20)  NOT NULL,
    name            VARCHAR(128),
    location        VARCHAR(256),
    organization_id VARCHAR(64),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    token_hash      VARCHAR(256),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_devices_scene ON devices (scene);

CREATE TABLE IF NOT EXISTS customers (
    id             UUID PRIMARY KEY,
    openid         VARCHAR(64) NOT NULL UNIQUE,
    nickname       VARCHAR(64),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_customers_openid ON customers (openid);

CREATE TABLE IF NOT EXISTS assessment_sessions (
    id          UUID PRIMARY KEY,
    scene       VARCHAR(20) NOT NULL,
    device_id   VARCHAR(64) REFERENCES devices (device_id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers (id) ON DELETE SET NULL,
    product_id  VARCHAR(64),
    status      VARCHAR(32) NOT NULL DEFAULT 'created',
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_assessment_sessions_scene ON assessment_sessions (scene);
CREATE INDEX IF NOT EXISTS ix_assessment_sessions_device_id ON assessment_sessions (device_id);
CREATE INDEX IF NOT EXISTS ix_assessment_sessions_customer_id ON assessment_sessions (customer_id);
CREATE INDEX IF NOT EXISTS ix_assessment_sessions_status ON assessment_sessions (status);

CREATE TABLE IF NOT EXISTS payment_orders (
    id                    UUID PRIMARY KEY,
    customer_id           UUID NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
    assessment_session_id UUID REFERENCES assessment_sessions (id) ON DELETE SET NULL,
    amount_fen            INTEGER NOT NULL,
    status                VARCHAR(20) NOT NULL DEFAULT 'created',
    wechat_txn_id         VARCHAR(64),
    assessment_id         UUID REFERENCES assessments (id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at               TIMESTAMPTZ,
    expires_at            TIMESTAMPTZ
);

-- ================= 2. assessments 双场景扩展列 =================

ALTER TABLE assessments ADD COLUMN IF NOT EXISTS scene                  VARCHAR(20) DEFAULT 'aviation' NOT NULL;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS customer_id            UUID;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS order_id               UUID;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS device_id              VARCHAR(64);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS report_type            VARCHAR(20);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS report_pdf_key         VARCHAR(512);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS report_sent_at         TIMESTAMPTZ;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS assessment_session_id  UUID;

CREATE INDEX IF NOT EXISTS ix_assessments_scene ON assessments (scene);
CREATE INDEX IF NOT EXISTS ix_assessments_customer_id ON assessments (customer_id);
CREATE INDEX IF NOT EXISTS ix_assessments_device_id ON assessments (device_id);
CREATE INDEX IF NOT EXISTS ix_assessments_assessment_session_id ON assessments (assessment_session_id);

-- 外键（存在性检查后创建，避免重复执行报错）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_assessments_customer'
    ) THEN
        ALTER TABLE assessments
            ADD CONSTRAINT fk_assessments_customer
            FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_assessments_session'
    ) THEN
        ALTER TABLE assessments
            ADD CONSTRAINT fk_assessments_session
            FOREIGN KEY (assessment_session_id) REFERENCES assessment_sessions (id) ON DELETE SET NULL;
    END IF;
END $$;

-- ================= 3. pairs 题库场景隔离列 =================

ALTER TABLE pairs ADD COLUMN IF NOT EXISTS scene        VARCHAR(20) DEFAULT 'aviation' NOT NULL;
ALTER TABLE pairs ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'image' NOT NULL;
ALTER TABLE pairs ADD COLUMN IF NOT EXISTS media_url    VARCHAR(512);

CREATE INDEX IF NOT EXISTS ix_pairs_scene ON pairs (scene);

COMMIT;
