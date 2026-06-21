-- +goose Up

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION support_progress_update_is_reviewed(target_type TEXT, target_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    IF target_type IS DISTINCT FROM 'progress_update' THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM progress_updates pu
        WHERE pu.id = target_id
          AND pu.review_status <> 'pending_review'
    );
END;
$$ LANGUAGE plpgsql STABLE;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION ensure_reviewed_resource_link_immutable()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF support_progress_update_is_reviewed(NEW.related_entity_type, NEW.related_entity_id) THEN
            RAISE EXCEPTION 'reviewed submission resource links are immutable';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF support_progress_update_is_reviewed(OLD.related_entity_type, OLD.related_entity_id)
           OR support_progress_update_is_reviewed(NEW.related_entity_type, NEW.related_entity_id) THEN
            RAISE EXCEPTION 'reviewed submission resource links are immutable';
        END IF;
        RETURN NEW;
    END IF;

    IF support_progress_update_is_reviewed(OLD.related_entity_type, OLD.related_entity_id) THEN
        RAISE EXCEPTION 'reviewed submission resource links are immutable';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION ensure_reviewed_uploaded_file_immutable()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF support_progress_update_is_reviewed(NEW.related_entity_type, NEW.related_entity_id) THEN
            RAISE EXCEPTION 'reviewed submission evidence files are immutable';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF support_progress_update_is_reviewed(OLD.related_entity_type, OLD.related_entity_id)
           OR support_progress_update_is_reviewed(NEW.related_entity_type, NEW.related_entity_id) THEN
            RAISE EXCEPTION 'reviewed submission evidence files are immutable';
        END IF;
        RETURN NEW;
    END IF;

    IF support_progress_update_is_reviewed(OLD.related_entity_type, OLD.related_entity_id) THEN
        RAISE EXCEPTION 'reviewed submission evidence files are immutable';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION ensure_reviewed_progress_update_status_final()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.review_status <> 'pending_review'
       AND NEW.review_status IS DISTINCT FROM OLD.review_status THEN
        RAISE EXCEPTION 'reviewed submission review status is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS resource_links_reviewed_submission_immutable ON resource_links;
CREATE CONSTRAINT TRIGGER resource_links_reviewed_submission_immutable
    AFTER INSERT OR UPDATE OR DELETE ON resource_links
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ensure_reviewed_resource_link_immutable();

DROP TRIGGER IF EXISTS uploaded_files_reviewed_submission_immutable ON uploaded_files;
CREATE CONSTRAINT TRIGGER uploaded_files_reviewed_submission_immutable
    AFTER INSERT OR UPDATE OR DELETE ON uploaded_files
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION ensure_reviewed_uploaded_file_immutable();

DROP TRIGGER IF EXISTS progress_updates_review_status_final ON progress_updates;
CREATE TRIGGER progress_updates_review_status_final
    BEFORE UPDATE OF review_status ON progress_updates
    FOR EACH ROW EXECUTE FUNCTION ensure_reviewed_progress_update_status_final();

-- +goose Down
DROP TRIGGER IF EXISTS progress_updates_review_status_final ON progress_updates;
DROP TRIGGER IF EXISTS uploaded_files_reviewed_submission_immutable ON uploaded_files;
DROP TRIGGER IF EXISTS resource_links_reviewed_submission_immutable ON resource_links;

DROP FUNCTION IF EXISTS ensure_reviewed_progress_update_status_final();
DROP FUNCTION IF EXISTS ensure_reviewed_uploaded_file_immutable();
DROP FUNCTION IF EXISTS ensure_reviewed_resource_link_immutable();
DROP FUNCTION IF EXISTS support_progress_update_is_reviewed(TEXT, UUID);
