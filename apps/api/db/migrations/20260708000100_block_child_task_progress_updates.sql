-- +goose Up
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION ensure_progress_update_submitter_assigned()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM task_assignees ta
        JOIN tasks t ON t.project_id = ta.project_id AND t.id = ta.task_id
        JOIN users u ON u.id = ta.student_id
        WHERE ta.project_id = NEW.project_id
          AND ta.task_id = NEW.task_id
          AND ta.student_id = NEW.submitted_by
          AND t.parent_task_id IS NULL
          AND u.role = 'student'
          AND u.status = 'active'
    ) THEN
        RAISE EXCEPTION 'progress update submitter must be an active assigned student on an official assignment'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- +goose Down
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
