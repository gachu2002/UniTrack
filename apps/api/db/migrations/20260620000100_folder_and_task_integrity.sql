-- +goose Up

-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM tasks child
        JOIN tasks parent ON parent.id = child.parent_task_id
        WHERE child.project_id <> parent.project_id
    ) THEN
        RAISE EXCEPTION 'cross-project child tasks exist; resolve before applying task parent integrity migration';
    END IF;
END $$;
-- +goose StatementEnd

ALTER TABLE tasks
    ADD CONSTRAINT tasks_project_parent_task_fk
        FOREIGN KEY (project_id, parent_task_id)
        REFERENCES tasks(project_id, id)
        ON DELETE CASCADE;

-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM course_section_projects csp
        JOIN course_sections cs ON cs.id = csp.course_section_id
        JOIN projects p ON p.id = csp.project_id
        WHERE cs.owner_teacher_id <> p.supervisor_id
    ) THEN
        RAISE EXCEPTION 'folder/project owner mismatches exist; resolve before applying folder integrity migration';
    END IF;
END $$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION ensure_course_section_project_owner_matches()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'course_section_projects' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM course_sections cs
            JOIN projects p ON p.id = NEW.project_id
            WHERE cs.id = NEW.course_section_id
              AND cs.owner_teacher_id = p.supervisor_id
        ) THEN
            RAISE EXCEPTION 'project supervisor must own the folder';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'projects' THEN
        IF NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id
           AND EXISTS (
                SELECT 1
                FROM course_section_projects csp
                JOIN course_sections cs ON cs.id = csp.course_section_id
                WHERE csp.project_id = NEW.id
                  AND cs.owner_teacher_id <> NEW.supervisor_id
           ) THEN
            RAISE EXCEPTION 'project supervisor must own the linked folder';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'course_sections' THEN
        IF NEW.owner_teacher_id IS DISTINCT FROM OLD.owner_teacher_id
           AND EXISTS (
                SELECT 1
                FROM course_section_projects csp
                JOIN projects p ON p.id = csp.project_id
                WHERE csp.course_section_id = NEW.id
                  AND p.supervisor_id <> NEW.owner_teacher_id
           ) THEN
            RAISE EXCEPTION 'folder owner must supervise linked projects';
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS course_section_projects_owner_match ON course_section_projects;
CREATE CONSTRAINT TRIGGER course_section_projects_owner_match
    AFTER INSERT OR UPDATE ON course_section_projects
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ensure_course_section_project_owner_matches();

DROP TRIGGER IF EXISTS projects_folder_owner_match ON projects;
CREATE CONSTRAINT TRIGGER projects_folder_owner_match
    AFTER UPDATE OF supervisor_id ON projects
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ensure_course_section_project_owner_matches();

DROP TRIGGER IF EXISTS course_sections_project_supervisor_match ON course_sections;
CREATE CONSTRAINT TRIGGER course_sections_project_supervisor_match
    AFTER UPDATE OF owner_teacher_id ON course_sections
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ensure_course_section_project_owner_matches();

-- +goose Down
DROP TRIGGER IF EXISTS course_sections_project_supervisor_match ON course_sections;
DROP TRIGGER IF EXISTS projects_folder_owner_match ON projects;
DROP TRIGGER IF EXISTS course_section_projects_owner_match ON course_section_projects;
DROP FUNCTION IF EXISTS ensure_course_section_project_owner_matches();

ALTER TABLE tasks
    DROP CONSTRAINT IF EXISTS tasks_project_parent_task_fk;
