-- +goose Up
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION ensure_progress_update_submitter_assigned()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM task_assignees ta
        JOIN users u ON u.id = ta.student_id
        WHERE ta.project_id = NEW.project_id
          AND ta.task_id = NEW.task_id
          AND ta.student_id = NEW.submitted_by
          AND u.role = 'student'
          AND u.status = 'active'
    ) THEN
        RAISE EXCEPTION 'progress update submitter must be an active assigned student'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS progress_updates_submitter_assigned ON progress_updates;
CREATE TRIGGER progress_updates_submitter_assigned
    BEFORE INSERT OR UPDATE OF project_id, task_id, submitted_by ON progress_updates
    FOR EACH ROW
    EXECUTE FUNCTION ensure_progress_update_submitter_assigned();

-- +goose Down
DROP TRIGGER IF EXISTS progress_updates_submitter_assigned ON progress_updates;
DROP FUNCTION IF EXISTS ensure_progress_update_submitter_assigned();
