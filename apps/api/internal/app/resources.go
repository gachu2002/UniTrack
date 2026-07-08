package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type createResourceLinkRequest struct {
	RelatedType string `json:"relatedType"`
	RelatedID   string `json:"relatedId"`
	Title       string `json:"title"`
	URL         string `json:"url"`
	Type        string `json:"type"`
	Description string `json:"description"`
}

type updateResourceLinkRequest struct {
	RelatedType *string `json:"relatedType"`
	RelatedID   *string `json:"relatedId"`
	Title       *string `json:"title"`
	URL         *string `json:"url"`
	Type        *string `json:"type"`
	Description *string `json:"description"`
}

type resourceLinkInput struct {
	RelatedType string
	RelatedID   string
	Title       string
	URL         string
	Type        string
	Description *string
}

var (
	errReviewedSubmissionLocked    = errors.New("reviewed submission support records cannot be changed")
	errResourceLinkTargetForbidden = errors.New("resource link target cannot be changed by this user")
)

func (s *Server) handleListResourceLinks(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	allowed, err := s.canViewProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this project")
		return
	}
	if wantsPaginatedResponse(r.URL.Query()) {
		pagination, err := parsePaginationParams(r.URL.Query(), 100, 500)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid resource link pagination")
			return
		}
		resources, total, err := s.listResourceLinksPage(r.Context(), projectID, pagination.Limit, pagination.Offset)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load resource links")
			return
		}
		writeJSON(w, http.StatusOK, paginatedResponse[ResourceLinkDTO]{Items: resources, Page: pagination.Page, Limit: pagination.Limit, Total: total})
		return
	}

	resources, err := s.listResourceLinks(r.Context(), projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load resource links")
		return
	}
	writeJSON(w, http.StatusOK, resources)
}

func (s *Server) handleCreateResourceLink(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	allowed, err := s.canViewProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this project")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "changing resource links", projectAcceptsSupportChanges) {
		return
	}

	var input createResourceLinkRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	resourceInput, err := normalizeCreateResourceLinkInput(projectID, input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create resource link")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	if _, ok := s.requireProjectSupportWriteTx(w, r.Context(), tx, user, projectID, "changing resource links"); !ok {
		return
	}
	allowed, err = canViewProjectTx(r.Context(), tx, user, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not verify resource access")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this project")
		return
	}
	if err := ensureResourceLinkTargetWritableForUserTx(r.Context(), tx, user, projectID, resourceInput.RelatedType, resourceInput.RelatedID); err != nil {
		if errors.Is(err, errReviewedSubmissionLocked) {
			writeError(w, http.StatusConflict, "reviewed submissions cannot change resource links")
			return
		}
		if errors.Is(err, errResourceLinkTargetForbidden) {
			writeError(w, http.StatusForbidden, "only the progress submitter or supervisor can change submission resources")
			return
		}
		writeError(w, http.StatusBadRequest, "resource target is invalid")
		return
	}

	var resourceID string
	err = tx.QueryRow(r.Context(), `
		INSERT INTO resource_links (project_id, related_entity_type, related_entity_id, title, url, type, description, added_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id::text
	`, projectID, resourceInput.RelatedType, resourceInput.RelatedID, resourceInput.Title, resourceInput.URL, resourceInput.Type, resourceInput.Description, user.ID).Scan(&resourceID)
	if isUniqueViolation(err, "idx_resource_links_unique_target_url") {
		writeError(w, http.StatusConflict, "a resource link with this URL already exists for this target")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create resource link")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create resource link")
		return
	}

	resource, err := s.getResourceLinkByID(r.Context(), resourceID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load resource link")
		return
	}
	writeJSON(w, http.StatusCreated, resource)
}

func (s *Server) handleUpdateResourceLink(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	resourceLinkID := chi.URLParam(r, "resourceLinkId")
	if !validUUIDParam(resourceLinkID) {
		writeError(w, http.StatusBadRequest, "invalid resource link id")
		return
	}
	allowed, err := s.canViewProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this project")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "changing resource links", projectAcceptsSupportChanges) {
		return
	}

	var input updateResourceLinkRequest
	if !decodeJSON(w, r, &input) {
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update resource link")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	canManageProject, ok := s.requireProjectSupportWriteTx(w, r.Context(), tx, user, projectID, "changing resource links")
	if !ok {
		return
	}
	allowed, err = canViewProjectTx(r.Context(), tx, user, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not verify resource access")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this project")
		return
	}

	current, err := scanResourceLink(tx.QueryRow(r.Context(), resourceLinkSelectSQL("WHERE rl.id = $1 AND rl.project_id = $2", "FOR UPDATE OF rl"), resourceLinkID, projectID))
	if isNoRows(err) {
		writeError(w, http.StatusNotFound, "resource link not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load resource link")
		return
	}
	if !canManageProject && current.AddedBy != user.ID {
		writeError(w, http.StatusForbidden, "you cannot update this resource link")
		return
	}
	if err := ensureResourceLinkTargetWritableForUserTx(r.Context(), tx, user, projectID, current.RelatedType, current.RelatedID); err != nil {
		if errors.Is(err, errReviewedSubmissionLocked) {
			writeError(w, http.StatusConflict, "reviewed submissions cannot change resource links")
			return
		}
		if errors.Is(err, errResourceLinkTargetForbidden) {
			writeError(w, http.StatusForbidden, "only the progress submitter or supervisor can change submission resources")
			return
		}
		writeError(w, http.StatusBadRequest, "resource target is invalid")
		return
	}
	resourceInput, err := normalizeUpdateResourceLinkInput(projectID, current, input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := ensureResourceLinkTargetWritableForUserTx(r.Context(), tx, user, projectID, resourceInput.RelatedType, resourceInput.RelatedID); err != nil {
		if errors.Is(err, errReviewedSubmissionLocked) {
			writeError(w, http.StatusConflict, "reviewed submissions cannot change resource links")
			return
		}
		if errors.Is(err, errResourceLinkTargetForbidden) {
			writeError(w, http.StatusForbidden, "only the progress submitter or supervisor can change submission resources")
			return
		}
		writeError(w, http.StatusBadRequest, "resource target is invalid")
		return
	}

	result, err := tx.Exec(r.Context(), `
		UPDATE resource_links
		SET related_entity_type = $1, related_entity_id = $2, title = $3, url = $4, type = $5, description = $6
		WHERE id = $7 AND project_id = $8
	`, resourceInput.RelatedType, resourceInput.RelatedID, resourceInput.Title, resourceInput.URL, resourceInput.Type, resourceInput.Description, resourceLinkID, projectID)
	if isUniqueViolation(err, "idx_resource_links_unique_target_url") {
		writeError(w, http.StatusConflict, "a resource link with this URL already exists for this target")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update resource link")
		return
	}
	if result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "resource link not found")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update resource link")
		return
	}

	resource, err := s.getResourceLinkByID(r.Context(), resourceLinkID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load resource link")
		return
	}
	writeJSON(w, http.StatusOK, resource)
}

func (s *Server) handleDeleteResourceLink(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	resourceLinkID := chi.URLParam(r, "resourceLinkId")
	if !validUUIDParam(resourceLinkID) {
		writeError(w, http.StatusBadRequest, "invalid resource link id")
		return
	}
	allowed, err := s.canViewProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this project")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "changing resource links", projectAcceptsSupportChanges) {
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete resource link")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	canManageProject, ok := s.requireProjectSupportWriteTx(w, r.Context(), tx, user, projectID, "changing resource links")
	if !ok {
		return
	}
	allowed, err = canViewProjectTx(r.Context(), tx, user, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not verify resource access")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this project")
		return
	}

	current, err := scanResourceLink(tx.QueryRow(r.Context(), resourceLinkSelectSQL("WHERE rl.id = $1 AND rl.project_id = $2", "FOR UPDATE OF rl"), resourceLinkID, projectID))
	if isNoRows(err) {
		writeError(w, http.StatusNotFound, "resource link not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load resource link")
		return
	}
	if !canManageProject && current.AddedBy != user.ID {
		writeError(w, http.StatusForbidden, "you cannot delete this resource link")
		return
	}
	if err := ensureResourceLinkTargetWritableForUserTx(r.Context(), tx, user, projectID, current.RelatedType, current.RelatedID); err != nil {
		if errors.Is(err, errReviewedSubmissionLocked) {
			writeError(w, http.StatusConflict, "reviewed submissions cannot change resource links")
			return
		}
		if errors.Is(err, errResourceLinkTargetForbidden) {
			writeError(w, http.StatusForbidden, "only the progress submitter or supervisor can change submission resources")
			return
		}
		writeError(w, http.StatusBadRequest, "resource target is invalid")
		return
	}

	result, err := tx.Exec(r.Context(), `DELETE FROM resource_links WHERE id = $1 AND project_id = $2`, resourceLinkID, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete resource link")
		return
	}
	if result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "resource link not found")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete resource link")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) listResourceLinks(ctx context.Context, projectID string) ([]ResourceLinkDTO, error) {
	rows, err := s.db.Query(ctx, resourceLinkSelectSQL("WHERE rl.project_id = $1", "ORDER BY rl.created_at DESC"), projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	resources := []ResourceLinkDTO{}
	for rows.Next() {
		resource, err := scanResourceLink(rows)
		if err != nil {
			return nil, err
		}
		resources = append(resources, resource)
	}
	return resources, rows.Err()
}

func (s *Server) listResourceLinksPage(ctx context.Context, projectID string, limit int, offset int) ([]ResourceLinkDTO, int64, error) {
	var total int64
	if err := s.db.QueryRow(ctx, `SELECT COUNT(*)::bigint FROM resource_links WHERE project_id = $1`, projectID).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := s.db.Query(ctx, resourceLinkSelectSQL("WHERE rl.project_id = $1", "ORDER BY rl.created_at DESC LIMIT $2 OFFSET $3"), projectID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	resources := []ResourceLinkDTO{}
	for rows.Next() {
		resource, err := scanResourceLink(rows)
		if err != nil {
			return nil, 0, err
		}
		resources = append(resources, resource)
	}
	return resources, total, rows.Err()
}

func (s *Server) getResourceLinkByID(ctx context.Context, resourceID string) (ResourceLinkDTO, error) {
	return scanResourceLink(s.db.QueryRow(ctx, resourceLinkSelectSQL("WHERE rl.id = $1", ""), resourceID))
}

func (s *Server) getResourceLinkByIDInProject(ctx context.Context, projectID string, resourceID string) (ResourceLinkDTO, error) {
	return scanResourceLink(s.db.QueryRow(ctx, resourceLinkSelectSQL("WHERE rl.id = $1 AND rl.project_id = $2", ""), resourceID, projectID))
}

func resourceLinkSelectSQL(where string, suffix string) string {
	return `
		SELECT
			rl.id::text,
			rl.project_id::text,
			rl.related_entity_type,
			rl.related_entity_id::text,
			CASE
				WHEN COALESCE(rl.related_entity_type, 'project') = 'project' THEN p.name
				WHEN rl.related_entity_type = 'milestone' THEN COALESCE((SELECT m.title FROM project_milestones m WHERE m.id = rl.related_entity_id), 'Milestone')
				WHEN rl.related_entity_type = 'task' THEN COALESCE((SELECT t.title FROM tasks t WHERE t.id = rl.related_entity_id), 'Task')
				WHEN rl.related_entity_type = 'progress_update' THEN COALESCE((SELECT COALESCE(pu.title, t.title) FROM progress_updates pu JOIN tasks t ON t.id = pu.task_id AND t.project_id = pu.project_id WHERE pu.id = rl.related_entity_id), 'Progress update')
				ELSE 'Resource'
			END,
			rl.title,
			rl.url,
			rl.type,
			rl.description,
			rl.added_by::text,
			u.full_name,
			rl.created_at,
			rl.updated_at
		FROM resource_links rl
		JOIN projects p ON p.id = rl.project_id
		JOIN users u ON u.id = rl.added_by
		` + where + `
		` + suffix + `
	`
}

func scanResourceLink(row pgx.Row) (ResourceLinkDTO, error) {
	var resource ResourceLinkDTO
	var relatedType, relatedID, description sql.NullString
	err := row.Scan(
		&resource.ID,
		&resource.ProjectID,
		&relatedType,
		&relatedID,
		&resource.RelatedLabel,
		&resource.Title,
		&resource.URL,
		&resource.Type,
		&description,
		&resource.AddedBy,
		&resource.AddedByName,
		&resource.CreatedAt,
		&resource.UpdatedAt,
	)
	if err != nil {
		return resource, err
	}
	resource.RelatedType = "project"
	resource.RelatedID = resource.ProjectID
	if relatedType.Valid {
		resource.RelatedType = relatedType.String
	}
	if relatedID.Valid {
		resource.RelatedID = relatedID.String
	}
	resource.Description = nullString(description)
	return resource, nil
}

func normalizeCreateResourceLinkInput(projectID string, input createResourceLinkRequest) (resourceLinkInput, error) {
	return normalizeResourceLinkInput(projectID, strings.TrimSpace(input.RelatedType), strings.TrimSpace(input.RelatedID), input.Title, input.URL, input.Type, input.Description)
}

func normalizeUpdateResourceLinkInput(projectID string, current ResourceLinkDTO, input updateResourceLinkRequest) (resourceLinkInput, error) {
	relatedType := current.RelatedType
	if input.RelatedType != nil {
		relatedType = strings.TrimSpace(*input.RelatedType)
	}
	relatedID := current.RelatedID
	if input.RelatedID != nil {
		relatedID = strings.TrimSpace(*input.RelatedID)
	}
	title := current.Title
	if input.Title != nil {
		title = *input.Title
	}
	resourceURL := current.URL
	if input.URL != nil {
		resourceURL = *input.URL
	}
	linkType := current.Type
	if input.Type != nil {
		linkType = *input.Type
	}
	description := stringValue(current.Description)
	if input.Description != nil {
		description = *input.Description
	}
	return normalizeResourceLinkInput(projectID, relatedType, relatedID, title, resourceURL, linkType, description)
}

func normalizeResourceLinkInput(projectID string, relatedType string, relatedID string, titleValue string, urlValue string, linkType string, descriptionValue string) (resourceLinkInput, error) {
	title := strings.TrimSpace(titleValue)
	if title == "" {
		return resourceLinkInput{}, errors.New("resource title is required")
	}
	resourceURL, err := normalizeResourceURL(urlValue)
	if err != nil {
		return resourceLinkInput{}, err
	}
	if linkType == "" {
		linkType = "external_link"
	}
	linkType = strings.TrimSpace(linkType)
	if !validResourceLinkType(linkType) {
		return resourceLinkInput{}, errors.New("invalid resource link type")
	}
	relatedType, relatedID, err = normalizeResourceLinkTarget(projectID, relatedType, relatedID)
	if err != nil {
		return resourceLinkInput{}, err
	}
	return resourceLinkInput{RelatedType: relatedType, RelatedID: relatedID, Title: title, URL: resourceURL, Type: linkType, Description: optionalString(descriptionValue)}, nil
}

func normalizeResourceURL(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", errors.New("resource URL is required")
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Host == "" {
		return "", errors.New("resource URL must be valid")
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", errors.New("resource URL must use http or https")
	}
	return trimmed, nil
}

func normalizeResourceLinkTarget(projectID string, relatedType string, relatedID string) (string, string, error) {
	if relatedType == "" {
		relatedType = "project"
	}
	if !validResourceLinkTargetType(relatedType) {
		return "", "", errors.New("invalid resource target")
	}
	if relatedType == "project" {
		if relatedID != "" && relatedID != projectID {
			return "", "", errors.New("project resource target must match the project")
		}
		return relatedType, projectID, nil
	}
	if relatedID == "" {
		return "", "", errors.New("resource target is required")
	}
	if !validUUIDParam(relatedID) {
		return "", "", errors.New("resource target is invalid")
	}
	return relatedType, relatedID, nil
}

func ensureResourceLinkTargetTx(ctx context.Context, q rowQueryer, projectID string, relatedType string, relatedID string) error {
	var exists bool
	switch relatedType {
	case "project":
		if relatedID != projectID {
			return pgx.ErrNoRows
		}
		if err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1)`, relatedID).Scan(&exists); err != nil {
			return err
		}
	case "milestone":
		if err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_milestones WHERE project_id = $1 AND id = $2)`, projectID, relatedID).Scan(&exists); err != nil {
			return err
		}
	case "task":
		if err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM tasks WHERE project_id = $1 AND id = $2 AND parent_task_id IS NULL)`, projectID, relatedID).Scan(&exists); err != nil {
			return err
		}
	case "progress_update":
		if err := q.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM progress_updates pu
				JOIN tasks t ON t.id = pu.task_id AND t.project_id = pu.project_id
				WHERE pu.project_id = $1 AND pu.id = $2 AND t.parent_task_id IS NULL
			)
		`, projectID, relatedID).Scan(&exists); err != nil {
			return err
		}
	}
	if !exists {
		return pgx.ErrNoRows
	}
	return nil
}

func ensureResourceLinkTargetWritableTx(ctx context.Context, tx pgx.Tx, projectID string, relatedType string, relatedID string) error {
	if err := ensureResourceLinkTargetTx(ctx, tx, projectID, relatedType, relatedID); err != nil {
		return err
	}
	if relatedType != "progress_update" {
		return nil
	}
	var reviewStatus string
	if err := tx.QueryRow(ctx, `
		SELECT pu.review_status
		FROM progress_updates pu
		JOIN tasks t ON t.id = pu.task_id AND t.project_id = pu.project_id
		WHERE pu.project_id = $1 AND pu.id = $2 AND t.parent_task_id IS NULL
		FOR UPDATE OF pu
	`, projectID, relatedID).Scan(&reviewStatus); err != nil {
		return err
	}
	if reviewStatus != "pending_review" {
		return errReviewedSubmissionLocked
	}
	return nil
}

func ensureResourceLinkTargetWritableForUserTx(ctx context.Context, tx pgx.Tx, user User, projectID string, relatedType string, relatedID string) error {
	if relatedType != "progress_update" {
		return ensureResourceLinkTargetTx(ctx, tx, projectID, relatedType, relatedID)
	}
	submittedBy, reviewStatus, err := progressUpdateEvidenceTargetTx(ctx, tx, projectID, relatedID)
	if err != nil {
		return err
	}
	if reviewStatus != "pending_review" {
		return errReviewedSubmissionLocked
	}
	canManageProject, err := canManageProjectTx(ctx, tx, user, projectID)
	if err != nil {
		return err
	}
	if !canManageProject && submittedBy != user.ID {
		return errResourceLinkTargetForbidden
	}
	return nil
}

func validResourceLinkTargetType(targetType string) bool {
	switch targetType {
	case "project", "milestone", "task", "progress_update":
		return true
	default:
		return false
	}
}

func validResourceLinkType(linkType string) bool {
	switch linkType {
	case "external_link", "github", "google_drive", "document", "design", "other":
		return true
	default:
		return false
	}
}
