-- +goose Up
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS courses_code_lower_unique ON courses (lower(code));
CREATE INDEX IF NOT EXISTS courses_status_idx ON courses(status);

-- +goose StatementBegin
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'courses_set_updated_at') THEN
        CREATE TRIGGER courses_set_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;
-- +goose StatementEnd

WITH normalized AS (
    SELECT
        cs.id,
        COALESCE(NULLIF(trim(cs.course_code), ''), 'COURSE-' || left(cs.id::text, 8)) AS code,
        COALESCE(NULLIF(trim(cs.course_code), ''), cs.title) AS title,
        cs.created_by,
        cs.created_at
    FROM course_sections cs
), selected AS (
    SELECT DISTINCT ON (lower(code)) code, title, created_by
    FROM normalized
    ORDER BY lower(code), created_at ASC, id ASC
)
INSERT INTO courses (code, title, created_by)
SELECT code, title, created_by
FROM selected
ON CONFLICT (lower(code)) DO NOTHING;

ALTER TABLE course_sections
    ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id);

UPDATE course_sections cs
SET course_id = c.id
FROM courses c
WHERE cs.course_id IS NULL
  AND lower(c.code) = lower(COALESCE(NULLIF(trim(cs.course_code), ''), 'COURSE-' || left(cs.id::text, 8)));

ALTER TABLE course_sections
    ALTER COLUMN course_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS course_sections_course_idx ON course_sections(course_id);

-- +goose Down
DROP INDEX IF EXISTS course_sections_course_idx;
ALTER TABLE course_sections DROP COLUMN IF EXISTS course_id;
DROP TRIGGER IF EXISTS courses_set_updated_at ON courses;
DROP INDEX IF EXISTS courses_status_idx;
DROP INDEX IF EXISTS courses_code_lower_unique;
DROP TABLE IF EXISTS courses;
