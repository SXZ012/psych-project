-- Persisted community consultation requests. Apply before production startup.
CREATE TABLE IF NOT EXISTS community_appointments (
    id UUID PRIMARY KEY,
    client_token VARCHAR(64) NOT NULL UNIQUE,
    device_id VARCHAR(64) NOT NULL,
    phone VARCHAR(11) NOT NULL,
    topics JSONB NOT NULL,
    contact_time VARCHAR(32) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    is_demo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
