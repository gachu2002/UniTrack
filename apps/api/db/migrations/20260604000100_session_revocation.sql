-- +goose Up
ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS ip_address TEXT;

CREATE INDEX IF NOT EXISTS sessions_active_idx
    ON sessions (user_id, expires_at)
    WHERE revoked_at IS NULL;

-- +goose Down
DROP INDEX IF EXISTS sessions_active_idx;

ALTER TABLE sessions
    DROP COLUMN IF EXISTS ip_address,
    DROP COLUMN IF EXISTS user_agent,
    DROP COLUMN IF EXISTS last_seen_at,
    DROP COLUMN IF EXISTS revoked_at;
