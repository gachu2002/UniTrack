-- +goose Up

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION support_progress_update_is_reviewed(target_type TEXT, target_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    IF target_type IS DISTINCT FROM 'progress_update'
       AND target_type IS DISTINCT FROM 'resource_link' THEN
        RETURN FALSE;
    END IF;

    IF target_type = 'progress_update' THEN
        RETURN EXISTS (
            SELECT 1
            FROM progress_updates pu
            WHERE pu.id = target_id
              AND pu.review_status <> 'pending_review'
        );
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM resource_links rl
        JOIN progress_updates pu ON pu.id = rl.related_entity_id AND pu.project_id = rl.project_id
        JOIN tasks t ON t.id = pu.task_id AND t.project_id = pu.project_id
        WHERE rl.id = target_id
          AND rl.related_entity_type = 'progress_update'
          AND t.parent_task_id IS NULL
          AND pu.review_status <> 'pending_review'
    );
END;
$$ LANGUAGE plpgsql STABLE;
-- +goose StatementEnd

-- +goose Down

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
