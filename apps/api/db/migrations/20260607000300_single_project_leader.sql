-- +goose Up
WITH ranked_leaders AS (
    SELECT project_id,
           student_id,
           ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY joined_at ASC, student_id ASC) AS leader_rank
    FROM project_members
    WHERE member_role = 'leader'
)
UPDATE project_members pm
SET member_role = 'member'
FROM ranked_leaders ranked
WHERE pm.project_id = ranked.project_id
  AND pm.student_id = ranked.student_id
  AND ranked.leader_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS project_members_one_leader_per_project
    ON project_members(project_id)
    WHERE member_role = 'leader';

-- +goose Down
DROP INDEX IF EXISTS project_members_one_leader_per_project;
