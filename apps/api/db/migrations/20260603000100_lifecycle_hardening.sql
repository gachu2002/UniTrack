-- +goose Up
ALTER TABLE invitations
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

UPDATE invitations
SET status = 'accepted'
WHERE accepted_at IS NOT NULL;

UPDATE invitations
SET status = 'expired'
WHERE accepted_at IS NULL AND expires_at <= now();

WITH ranked AS (
    SELECT id,
           row_number() OVER (PARTITION BY project_id, lower(email) ORDER BY created_at DESC) AS row_number
    FROM invitations
    WHERE status = 'pending'
)
UPDATE invitations i
SET status = 'revoked', revoked_at = now()
FROM ranked r
WHERE i.id = r.id AND r.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_project_email_unique
    ON invitations (project_id, lower(email))
    WHERE status = 'pending';

WITH ranked AS (
    SELECT id,
           row_number() OVER (PARTITION BY progress_update_id ORDER BY reviewed_at DESC, id DESC) AS row_number
    FROM progress_reviews
)
DELETE FROM progress_reviews pr
USING ranked r
WHERE pr.id = r.id AND r.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS progress_reviews_one_review_per_update_unique
    ON progress_reviews (progress_update_id);

CREATE TABLE IF NOT EXISTS course_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    course_code TEXT,
    section TEXT,
    term TEXT,
    description TEXT,
    owner_teacher_id UUID NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_section_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_section_id UUID NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    added_by UUID NOT NULL REFERENCES users(id),
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (course_section_id, project_id),
    UNIQUE (project_id)
);

CREATE TRIGGER course_sections_set_updated_at BEFORE UPDATE ON course_sections FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS course_sections_owner_idx ON course_sections(owner_teacher_id);
CREATE INDEX IF NOT EXISTS course_sections_term_idx ON course_sections(term);
CREATE INDEX IF NOT EXISTS course_sections_status_idx ON course_sections(status);
CREATE INDEX IF NOT EXISTS course_section_projects_section_idx ON course_section_projects(course_section_id);
CREATE INDEX IF NOT EXISTS course_section_projects_project_idx ON course_section_projects(project_id);

-- +goose Down
DROP INDEX IF EXISTS course_section_projects_project_idx;
DROP INDEX IF EXISTS course_section_projects_section_idx;
DROP INDEX IF EXISTS course_sections_status_idx;
DROP INDEX IF EXISTS course_sections_term_idx;
DROP INDEX IF EXISTS course_sections_owner_idx;
DROP TRIGGER IF EXISTS course_sections_set_updated_at ON course_sections;
DROP TABLE IF EXISTS course_section_projects;
DROP TABLE IF EXISTS course_sections;
DROP INDEX IF EXISTS progress_reviews_one_review_per_update_unique;
DROP INDEX IF EXISTS invitations_pending_project_email_unique;
ALTER TABLE invitations
    DROP COLUMN IF EXISTS revoked_at,
    DROP COLUMN IF EXISTS accepted_by,
    DROP COLUMN IF EXISTS status;
