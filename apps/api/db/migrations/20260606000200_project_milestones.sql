-- +goose Up
CREATE TABLE project_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    target_date DATE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, id)
);

ALTER TABLE tasks
    ADD COLUMN milestone_id UUID,
    ADD CONSTRAINT tasks_milestone_project_fk
        FOREIGN KEY (project_id, milestone_id)
        REFERENCES project_milestones(project_id, id)
        ON DELETE SET NULL (milestone_id),
    ADD CONSTRAINT tasks_milestone_official_only_check
        CHECK (milestone_id IS NULL OR parent_task_id IS NULL);

CREATE TRIGGER project_milestones_set_updated_at BEFORE UPDATE ON project_milestones FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_project_milestones_project_id ON project_milestones(project_id);
CREATE INDEX idx_project_milestones_target_date ON project_milestones(target_date);
CREATE INDEX idx_tasks_milestone_id ON tasks(milestone_id);

-- +goose Down
DROP INDEX IF EXISTS idx_tasks_milestone_id;
DROP INDEX IF EXISTS idx_project_milestones_target_date;
DROP INDEX IF EXISTS idx_project_milestones_project_id;
DROP TRIGGER IF EXISTS project_milestones_set_updated_at ON project_milestones;
ALTER TABLE tasks
    DROP CONSTRAINT IF EXISTS tasks_milestone_official_only_check,
    DROP CONSTRAINT IF EXISTS tasks_milestone_project_fk,
    DROP COLUMN IF EXISTS milestone_id;
DROP TABLE IF EXISTS project_milestones;
