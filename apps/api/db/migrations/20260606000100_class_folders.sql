-- +goose Up
ALTER TABLE course_sections
    ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT 'blue';

UPDATE course_sections
SET color = 'blue'
WHERE color IS NULL OR trim(color) = '';

-- +goose StatementBegin
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'course_sections_color_check'
    ) THEN
        ALTER TABLE course_sections
            ADD CONSTRAINT course_sections_color_check
            CHECK (color IN ('blue', 'teal', 'amber', 'rose', 'violet', 'slate'));
    END IF;
END $$;
-- +goose StatementEnd

ALTER TABLE course_sections
    DROP COLUMN IF EXISTS course_id,
    DROP COLUMN IF EXISTS course_code,
    DROP COLUMN IF EXISTS section,
    DROP COLUMN IF EXISTS term;

-- +goose Down
ALTER TABLE course_sections
    ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id),
    ADD COLUMN IF NOT EXISTS course_code TEXT,
    ADD COLUMN IF NOT EXISTS section TEXT,
    ADD COLUMN IF NOT EXISTS term TEXT;

ALTER TABLE course_sections
    DROP CONSTRAINT IF EXISTS course_sections_color_check,
    DROP COLUMN IF EXISTS color;
