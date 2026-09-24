"""Apply idempotent community schema additions used by the current release."""
import asyncio

from sqlalchemy import text

from app.db.base import engine


STATEMENTS = (
    "ALTER TABLE assessment_sessions ADD COLUMN IF NOT EXISTS selected_pair_ids TEXT",
    """CREATE TABLE IF NOT EXISTS community_gardens (
        id UUID PRIMARY KEY, customer_id UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
        plant_stage INTEGER NOT NULL DEFAULT 1, light VARCHAR(32) NOT NULL DEFAULT 'morning',
        decoration VARCHAR(32) NOT NULL DEFAULT 'bench', visits INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now())""",
    "CREATE INDEX IF NOT EXISTS ix_community_gardens_customer_id ON community_gardens(customer_id)",
    """CREATE TABLE IF NOT EXISTS community_garden_events (
        id UUID PRIMARY KEY, garden_id UUID NOT NULL REFERENCES community_gardens(id) ON DELETE CASCADE,
        session_id UUID REFERENCES assessment_sessions(id) ON DELETE SET NULL,
        action VARCHAR(32) NOT NULL, value VARCHAR(64) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now())""",
    "CREATE INDEX IF NOT EXISTS ix_community_garden_events_garden_id ON community_garden_events(garden_id)",
    "CREATE INDEX IF NOT EXISTS ix_community_garden_events_session_id ON community_garden_events(session_id)",
)


async def main() -> None:
    async with engine.begin() as connection:
        for statement in STATEMENTS:
            await connection.execute(text(statement))
    await engine.dispose()
    print("community migrations applied")


if __name__ == "__main__":
    asyncio.run(main())
