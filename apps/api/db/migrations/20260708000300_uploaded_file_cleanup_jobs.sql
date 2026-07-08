-- +goose Up

CREATE TABLE IF NOT EXISTS uploaded_file_object_cleanup_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_path TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('upload_metadata_rollback', 'metadata_deleted')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uploaded_file_object_cleanup_jobs_pending_idx
    ON uploaded_file_object_cleanup_jobs (created_at, id)
    WHERE completed_at IS NULL;

-- +goose Down

DROP INDEX IF EXISTS uploaded_file_object_cleanup_jobs_pending_idx;
DROP TABLE IF EXISTS uploaded_file_object_cleanup_jobs;
