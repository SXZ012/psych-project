-- File inventory and versioned public content. File bytes stay outside PostgreSQL.


CREATE TABLE IF NOT EXISTS stored_assets (
	object_key VARCHAR(512) NOT NULL,
	bucket VARCHAR(128) NOT NULL,
	category VARCHAR(32) NOT NULL,
	visibility VARCHAR(16) NOT NULL,
	content_type VARCHAR(128) NOT NULL,
	size_bytes INTEGER NOT NULL,
	sha256 VARCHAR(64) NOT NULL,
	assessment_id UUID,
	source TEXT,
	verified_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (object_key)
)

;

CREATE INDEX IF NOT EXISTS ix_stored_assets_category ON stored_assets (category);

CREATE INDEX IF NOT EXISTS ix_stored_assets_assessment_id ON stored_assets (assessment_id);


CREATE TABLE IF NOT EXISTS content_versions (
	name VARCHAR(64) NOT NULL,
	version VARCHAR(64) NOT NULL,
	payload JSONB NOT NULL,
	active BOOLEAN NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (name, version)
)

;

CREATE UNIQUE INDEX IF NOT EXISTS ix_content_versions_active ON content_versions (name) WHERE active;
