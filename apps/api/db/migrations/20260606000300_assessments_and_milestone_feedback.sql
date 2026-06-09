-- +goose Up
ALTER TABLE feedback
    DROP CONSTRAINT IF EXISTS feedback_target_type_check,
    ADD CONSTRAINT feedback_target_type_check CHECK (target_type IN ('project', 'student', 'milestone', 'task', 'progress_update'));

CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('project', 'milestone', 'task')),
    target_id UUID NOT NULL,
    score DOUBLE PRECISION NOT NULL CHECK (score >= 0),
    max_score DOUBLE PRECISION NOT NULL DEFAULT 10 CHECK (max_score > 0 AND max_score <= 100),
    note TEXT,
    assessed_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (score <= max_score),
    UNIQUE (project_id, target_type, target_id)
);

CREATE TRIGGER assessments_set_updated_at BEFORE UPDATE ON assessments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_assessments_project_id ON assessments(project_id);
CREATE INDEX idx_assessments_target ON assessments(target_type, target_id);

-- +goose Down
DROP INDEX IF EXISTS idx_assessments_target;
DROP INDEX IF EXISTS idx_assessments_project_id;
DROP TRIGGER IF EXISTS assessments_set_updated_at ON assessments;
DROP TABLE IF EXISTS assessments;

ALTER TABLE feedback
    DROP CONSTRAINT IF EXISTS feedback_target_type_check,
    ADD CONSTRAINT feedback_target_type_check CHECK (target_type IN ('project', 'student', 'task', 'progress_update'));
