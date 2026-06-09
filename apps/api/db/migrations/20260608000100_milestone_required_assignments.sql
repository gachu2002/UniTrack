-- +goose Up
WITH standalone_projects AS (
    SELECT t.project_id, COALESCE(MAX(m.sort_order), 0) + 1 AS sort_order
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN project_milestones m ON m.project_id = t.project_id
    WHERE t.parent_task_id IS NULL
      AND t.milestone_id IS NULL
    GROUP BY t.project_id
), generated_milestones AS (
    INSERT INTO project_milestones (project_id, title, description, sort_order, created_by)
    SELECT sp.project_id,
           'General assignments',
           'Auto-created to keep existing assignments under a milestone.',
           sp.sort_order,
           p.supervisor_id
    FROM standalone_projects sp
    JOIN projects p ON p.id = sp.project_id
    RETURNING id, project_id
)
UPDATE tasks t
SET milestone_id = gm.id
FROM generated_milestones gm
WHERE t.project_id = gm.project_id
  AND t.parent_task_id IS NULL
  AND t.milestone_id IS NULL;

ALTER TABLE tasks
    DROP CONSTRAINT IF EXISTS tasks_milestone_project_fk,
    DROP CONSTRAINT IF EXISTS tasks_milestone_official_only_check;

ALTER TABLE tasks
    ADD CONSTRAINT tasks_milestone_project_fk
        FOREIGN KEY (project_id, milestone_id)
        REFERENCES project_milestones(project_id, id)
        ON DELETE RESTRICT,
    ADD CONSTRAINT tasks_milestone_official_only_check
        CHECK (milestone_id IS NULL OR parent_task_id IS NULL),
    ADD CONSTRAINT tasks_assignment_requires_milestone_check
        CHECK (parent_task_id IS NOT NULL OR milestone_id IS NOT NULL);

-- +goose Down
ALTER TABLE tasks
    DROP CONSTRAINT IF EXISTS tasks_assignment_requires_milestone_check,
    DROP CONSTRAINT IF EXISTS tasks_milestone_project_fk;

ALTER TABLE tasks
    ADD CONSTRAINT tasks_milestone_project_fk
        FOREIGN KEY (project_id, milestone_id)
        REFERENCES project_milestones(project_id, id)
        ON DELETE SET NULL (milestone_id);
