-- +goose Up
ALTER TABLE tasks
    ADD CONSTRAINT tasks_project_id_id_unique UNIQUE (project_id, id);

ALTER TABLE task_assignees
    ADD COLUMN IF NOT EXISTS project_id UUID;

UPDATE task_assignees ta
SET project_id = t.project_id
FROM tasks t
WHERE ta.task_id = t.id
  AND ta.project_id IS NULL;

DELETE FROM task_assignees ta
WHERE ta.project_id IS NULL
   OR NOT EXISTS (
        SELECT 1
        FROM project_members pm
        WHERE pm.project_id = ta.project_id
          AND pm.student_id = ta.student_id
   );

ALTER TABLE task_assignees
    ALTER COLUMN project_id SET NOT NULL,
    ADD CONSTRAINT task_assignees_project_task_fk
        FOREIGN KEY (project_id, task_id)
        REFERENCES tasks(project_id, id)
        ON DELETE CASCADE,
    ADD CONSTRAINT task_assignees_project_member_fk
        FOREIGN KEY (project_id, student_id)
        REFERENCES project_members(project_id, student_id)
        ON DELETE CASCADE;

UPDATE progress_updates pu
SET project_id = t.project_id
FROM tasks t
WHERE pu.task_id = t.id
  AND pu.project_id <> t.project_id;

UPDATE uploaded_files uf
SET project_id = pu.project_id
FROM progress_updates pu
WHERE uf.related_entity_type = 'progress_update'
  AND uf.related_entity_id = pu.id
  AND uf.project_id <> pu.project_id;

UPDATE resource_links rl
SET project_id = pu.project_id
FROM progress_updates pu
WHERE rl.related_entity_type = 'progress_update'
  AND rl.related_entity_id = pu.id
  AND rl.project_id <> pu.project_id;

-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM progress_updates
        WHERE review_status = 'pending_review'
        GROUP BY task_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'duplicate pending progress submissions exist; resolve before applying assignment integrity migration';
    END IF;
END $$;
-- +goose StatementEnd

ALTER TABLE progress_updates
    ADD CONSTRAINT progress_updates_project_task_fk
        FOREIGN KEY (project_id, task_id)
        REFERENCES tasks(project_id, id)
        ON DELETE CASCADE;

CREATE UNIQUE INDEX progress_updates_one_pending_per_task_unique
    ON progress_updates(task_id)
    WHERE review_status = 'pending_review';

CREATE INDEX idx_task_assignees_project_student
    ON task_assignees(project_id, student_id);

CREATE INDEX idx_progress_updates_project_task
    ON progress_updates(project_id, task_id);

-- +goose Down
DROP INDEX IF EXISTS idx_progress_updates_project_task;
DROP INDEX IF EXISTS idx_task_assignees_project_student;
DROP INDEX IF EXISTS progress_updates_one_pending_per_task_unique;

ALTER TABLE progress_updates
    DROP CONSTRAINT IF EXISTS progress_updates_project_task_fk;

ALTER TABLE task_assignees
    DROP CONSTRAINT IF EXISTS task_assignees_project_member_fk,
    DROP CONSTRAINT IF EXISTS task_assignees_project_task_fk,
    DROP COLUMN IF EXISTS project_id;

ALTER TABLE tasks
    DROP CONSTRAINT IF EXISTS tasks_project_id_id_unique;
