-- +goose Up

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION support_resource_link_target_matches_project(target_project_id UUID, target_type TEXT, target_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    IF target_type IS NULL THEN
        RETURN target_id IS NULL;
    END IF;

    CASE target_type
        WHEN 'project' THEN
            RETURN COALESCE(target_id = target_project_id, FALSE);
        WHEN 'milestone' THEN
            RETURN EXISTS (
                SELECT 1
                FROM project_milestones pm
                WHERE pm.project_id = target_project_id
                  AND pm.id = target_id
            );
        WHEN 'task' THEN
            RETURN EXISTS (
                SELECT 1
                FROM tasks t
                WHERE t.project_id = target_project_id
                  AND t.id = target_id
                  AND t.parent_task_id IS NULL
            );
        WHEN 'progress_update' THEN
            RETURN EXISTS (
                SELECT 1
                FROM progress_updates pu
                JOIN tasks t ON t.id = pu.task_id AND t.project_id = pu.project_id
                WHERE pu.project_id = target_project_id
                  AND pu.id = target_id
                  AND t.parent_task_id IS NULL
            );
        ELSE
            RETURN FALSE;
    END CASE;
END;
$$ LANGUAGE plpgsql STABLE;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION support_uploaded_file_target_matches_project(target_project_id UUID, target_type TEXT, target_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    CASE target_type
        WHEN 'project' THEN
            RETURN COALESCE(target_id = target_project_id, FALSE);
        WHEN 'task' THEN
            RETURN EXISTS (
                SELECT 1
                FROM tasks t
                WHERE t.project_id = target_project_id
                  AND t.id = target_id
                  AND t.parent_task_id IS NULL
            );
        WHEN 'progress_update' THEN
            RETURN EXISTS (
                SELECT 1
                FROM progress_updates pu
                JOIN tasks t ON t.id = pu.task_id AND t.project_id = pu.project_id
                WHERE pu.project_id = target_project_id
                  AND pu.id = target_id
                  AND t.parent_task_id IS NULL
            );
        WHEN 'resource_link' THEN
            RETURN EXISTS (
                SELECT 1
                FROM resource_links rl
                WHERE rl.project_id = target_project_id
                  AND rl.id = target_id
            );
        ELSE
            RETURN FALSE;
    END CASE;
END;
$$ LANGUAGE plpgsql STABLE;
-- +goose StatementEnd

-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM resource_links rl
        WHERE NOT support_resource_link_target_matches_project(rl.project_id, rl.related_entity_type, rl.related_entity_id)
    ) THEN
        RAISE EXCEPTION 'resource links with invalid targets exist; resolve before applying support target integrity migration';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM uploaded_files uf
        WHERE NOT support_uploaded_file_target_matches_project(uf.project_id, uf.related_entity_type, uf.related_entity_id)
    ) THEN
        RAISE EXCEPTION 'uploaded files with invalid targets exist; resolve before applying support target integrity migration';
    END IF;
END $$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION ensure_resource_link_target_matches_project()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT support_resource_link_target_matches_project(NEW.project_id, NEW.related_entity_type, NEW.related_entity_id) THEN
        RAISE EXCEPTION 'resource link target must belong to its project';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION ensure_uploaded_file_target_matches_project()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT support_uploaded_file_target_matches_project(NEW.project_id, NEW.related_entity_type, NEW.related_entity_id) THEN
        RAISE EXCEPTION 'uploaded file target must belong to its project';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION ensure_support_targets_still_match_project()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM resource_links rl
        WHERE NOT support_resource_link_target_matches_project(rl.project_id, rl.related_entity_type, rl.related_entity_id)
    ) THEN
        RAISE EXCEPTION 'resource link target must belong to its project';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM uploaded_files uf
        WHERE NOT support_uploaded_file_target_matches_project(uf.project_id, uf.related_entity_type, uf.related_entity_id)
    ) THEN
        RAISE EXCEPTION 'uploaded file target must belong to its project';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS resource_links_target_project_match ON resource_links;
CREATE CONSTRAINT TRIGGER resource_links_target_project_match
    AFTER INSERT OR UPDATE OF project_id, related_entity_type, related_entity_id ON resource_links
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ensure_resource_link_target_matches_project();

DROP TRIGGER IF EXISTS uploaded_files_target_project_match ON uploaded_files;
CREATE CONSTRAINT TRIGGER uploaded_files_target_project_match
    AFTER INSERT OR UPDATE OF project_id, related_entity_type, related_entity_id ON uploaded_files
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ensure_uploaded_file_target_matches_project();

DROP TRIGGER IF EXISTS project_milestones_support_target_update_match ON project_milestones;
CREATE CONSTRAINT TRIGGER project_milestones_support_target_update_match
    AFTER UPDATE OF project_id ON project_milestones
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ensure_support_targets_still_match_project();

DROP TRIGGER IF EXISTS project_milestones_support_target_delete_match ON project_milestones;
CREATE CONSTRAINT TRIGGER project_milestones_support_target_delete_match
    AFTER DELETE ON project_milestones
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ensure_support_targets_still_match_project();

DROP TRIGGER IF EXISTS tasks_support_target_update_match ON tasks;
CREATE CONSTRAINT TRIGGER tasks_support_target_update_match
    AFTER UPDATE OF project_id, parent_task_id ON tasks
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ensure_support_targets_still_match_project();

DROP TRIGGER IF EXISTS tasks_support_target_delete_match ON tasks;
CREATE CONSTRAINT TRIGGER tasks_support_target_delete_match
    AFTER DELETE ON tasks
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ensure_support_targets_still_match_project();

DROP TRIGGER IF EXISTS progress_updates_support_target_update_match ON progress_updates;
CREATE CONSTRAINT TRIGGER progress_updates_support_target_update_match
    AFTER UPDATE OF project_id, task_id ON progress_updates
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ensure_support_targets_still_match_project();

DROP TRIGGER IF EXISTS progress_updates_support_target_delete_match ON progress_updates;
CREATE CONSTRAINT TRIGGER progress_updates_support_target_delete_match
    AFTER DELETE ON progress_updates
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ensure_support_targets_still_match_project();

DROP TRIGGER IF EXISTS resource_links_file_target_update_match ON resource_links;
CREATE CONSTRAINT TRIGGER resource_links_file_target_update_match
    AFTER UPDATE OF project_id ON resource_links
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ensure_support_targets_still_match_project();

DROP TRIGGER IF EXISTS resource_links_file_target_delete_match ON resource_links;
CREATE CONSTRAINT TRIGGER resource_links_file_target_delete_match
    AFTER DELETE ON resource_links
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ensure_support_targets_still_match_project();

-- +goose Down
DROP TRIGGER IF EXISTS resource_links_file_target_delete_match ON resource_links;
DROP TRIGGER IF EXISTS resource_links_file_target_update_match ON resource_links;
DROP TRIGGER IF EXISTS progress_updates_support_target_delete_match ON progress_updates;
DROP TRIGGER IF EXISTS progress_updates_support_target_update_match ON progress_updates;
DROP TRIGGER IF EXISTS tasks_support_target_delete_match ON tasks;
DROP TRIGGER IF EXISTS tasks_support_target_update_match ON tasks;
DROP TRIGGER IF EXISTS project_milestones_support_target_delete_match ON project_milestones;
DROP TRIGGER IF EXISTS project_milestones_support_target_update_match ON project_milestones;
DROP TRIGGER IF EXISTS uploaded_files_target_project_match ON uploaded_files;
DROP TRIGGER IF EXISTS resource_links_target_project_match ON resource_links;

DROP FUNCTION IF EXISTS ensure_support_targets_still_match_project();
DROP FUNCTION IF EXISTS ensure_uploaded_file_target_matches_project();
DROP FUNCTION IF EXISTS ensure_resource_link_target_matches_project();
DROP FUNCTION IF EXISTS support_uploaded_file_target_matches_project(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS support_resource_link_target_matches_project(UUID, TEXT, UUID);
