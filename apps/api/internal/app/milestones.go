package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type createMilestoneRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	TargetDate  string `json:"targetDate"`
	SortOrder   *int   `json:"sortOrder"`
}

type updateMilestoneRequest struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	TargetDate  *string `json:"targetDate"`
	SortOrder   *int    `json:"sortOrder"`
}

type reorderMilestonesRequest struct {
	MilestoneIDs []string `json:"milestoneIds"`
}

func (s *Server) handleListMilestones(w http.ResponseWriter, r *http.Request) {
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

	milestones, err := s.listProjectMilestones(r.Context(), projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load milestones")
		return
	}
	writeJSON(w, http.StatusOK, milestones)
}

func (s *Server) handleCreateMilestone(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	allowed, err := s.canManageProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "only the supervising teacher or an admin can create milestones")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "changing project milestones", projectAcceptsPlanChanges) {
		return
	}

	var input createMilestoneRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	milestoneID, err := s.createMilestone(r.Context(), user, projectID, input)
	if isProjectLifecycleError(err) {
		writeProjectLifecycleError(w, err)
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	milestone, err := s.getProjectMilestone(r.Context(), projectID, milestoneID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load milestone")
		return
	}
	writeJSON(w, http.StatusCreated, milestone)
}

func (s *Server) handleUpdateMilestone(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	milestoneID := chi.URLParam(r, "milestoneId")
	if !requireValidUUIDParam(w, milestoneID, "invalid milestone id") {
		return
	}
	allowed, err := s.canManageProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "only the supervising teacher or an admin can update milestones")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "changing project milestones", projectAcceptsPlanChanges) {
		return
	}

	var input updateMilestoneRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	if err := s.updateMilestone(r.Context(), projectID, milestoneID, input); err != nil {
		if isProjectLifecycleError(err) {
			writeProjectLifecycleError(w, err)
			return
		}
		if isNoRows(err) {
			writeError(w, http.StatusNotFound, "milestone not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	updated, err := s.getProjectMilestone(r.Context(), projectID, milestoneID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load milestone")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleReorderMilestones(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	allowed, err := s.canManageProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "only the supervising teacher or an admin can reorder milestones")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "changing project milestones", projectAcceptsPlanChanges) {
		return
	}

	var input reorderMilestonesRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	if err := s.reorderMilestones(r.Context(), projectID, input.MilestoneIDs); err != nil {
		if isProjectLifecycleError(err) {
			writeProjectLifecycleError(w, err)
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	milestones, err := s.listProjectMilestones(r.Context(), projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load milestones")
		return
	}
	writeJSON(w, http.StatusOK, milestones)
}

func (s *Server) handleDeleteMilestone(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	milestoneID := chi.URLParam(r, "milestoneId")
	if !requireValidUUIDParam(w, milestoneID, "invalid milestone id") {
		return
	}
	allowed, err := s.canManageProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "only the supervising teacher or an admin can delete milestones")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "changing project milestones", projectAcceptsPlanChanges) {
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete milestone")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	if !s.requireProjectLifecycleTx(w, r.Context(), tx, projectID, "changing project milestones", projectAcceptsPlanChanges) {
		return
	}

	var assignmentCount int
	if err := tx.QueryRow(r.Context(), `SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND milestone_id = $2 AND parent_task_id IS NULL`, projectID, milestoneID).Scan(&assignmentCount); err != nil {
		writeError(w, http.StatusInternalServerError, "could not verify milestone assignments")
		return
	}
	if assignmentCount > 0 {
		writeError(w, http.StatusConflict, "move or delete milestone assignments before deleting this milestone")
		return
	}

	result, err := tx.Exec(r.Context(), `DELETE FROM project_milestones WHERE id = $1 AND project_id = $2`, milestoneID, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete milestone")
		return
	}
	if result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "milestone not found")
		return
	}
	if _, err := tx.Exec(r.Context(), `DELETE FROM assessments WHERE project_id = $1 AND target_type = 'milestone' AND target_id = $2`, projectID, milestoneID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete milestone")
		return
	}
	if _, err := tx.Exec(r.Context(), `DELETE FROM resource_links WHERE project_id = $1 AND related_entity_type = 'milestone' AND related_entity_id = $2`, projectID, milestoneID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete milestone")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete milestone")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) createMilestone(ctx context.Context, user User, projectID string, input createMilestoneRequest) (string, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return "", errors.New("milestone title is required")
	}
	targetDate, err := parseOptionalDate(input.TargetDate)
	if err != nil {
		return "", errors.New("target date must be a date in YYYY-MM-DD format")
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return "", errors.New("could not create milestone")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := s.lockProjectLifecycleTx(ctx, tx, projectID, "changing project milestones", projectAcceptsPlanChanges); err != nil {
		return "", err
	}

	sortOrder := 0
	if input.SortOrder != nil {
		sortOrder = *input.SortOrder
	} else if err := tx.QueryRow(ctx, `SELECT COALESCE(MAX(sort_order), 0) + 1 FROM project_milestones WHERE project_id = $1`, projectID).Scan(&sortOrder); err != nil {
		return "", errors.New("could not create milestone")
	}

	var milestoneID string
	err = tx.QueryRow(ctx, `
		INSERT INTO project_milestones (project_id, title, description, target_date, sort_order, created_by)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id::text
	`, projectID, title, optionalString(input.Description), targetDate, sortOrder, user.ID).Scan(&milestoneID)
	if err != nil {
		return "", errors.New("could not create milestone")
	}
	if err := tx.Commit(ctx); err != nil {
		return "", errors.New("could not create milestone")
	}
	return milestoneID, nil
}

func (s *Server) updateMilestone(ctx context.Context, projectID string, milestoneID string, input updateMilestoneRequest) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return errors.New("could not update milestone")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := s.lockProjectLifecycleTx(ctx, tx, projectID, "changing project milestones", projectAcceptsPlanChanges); err != nil {
		return err
	}

	var current MilestoneDTO
	var currentDescription sql.NullString
	var currentTargetDate sql.NullTime
	if err := tx.QueryRow(ctx, `
		SELECT id::text, title, description, target_date, sort_order
		FROM project_milestones
		WHERE id = $1 AND project_id = $2
		FOR UPDATE
	`, milestoneID, projectID).Scan(&current.ID, &current.Title, &currentDescription, &currentTargetDate, &current.SortOrder); err != nil {
		return err
	}
	current.Description = nullString(currentDescription)
	current.TargetDate = nullDate(currentTargetDate)

	title := current.Title
	if input.Title != nil {
		title = strings.TrimSpace(*input.Title)
	}
	if title == "" {
		return errors.New("milestone title is required")
	}
	description := stringValue(current.Description)
	if input.Description != nil {
		description = strings.TrimSpace(*input.Description)
	}
	targetDateValue := stringValue(current.TargetDate)
	if input.TargetDate != nil {
		targetDateValue = strings.TrimSpace(*input.TargetDate)
	}
	targetDate, err := parseOptionalDate(targetDateValue)
	if err != nil {
		return errors.New("target date must be a date in YYYY-MM-DD format")
	}
	sortOrder := current.SortOrder
	if input.SortOrder != nil {
		sortOrder = *input.SortOrder
	}

	result, err := tx.Exec(ctx, `
		UPDATE project_milestones
		SET title = $1, description = $2, target_date = $3, sort_order = $4
		WHERE id = $5 AND project_id = $6
	`, title, optionalString(description), targetDate, sortOrder, current.ID, projectID)
	if err != nil {
		return errors.New("could not update milestone")
	}
	if result.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	if err := tx.Commit(ctx); err != nil {
		return errors.New("could not update milestone")
	}
	return nil
}

func (s *Server) reorderMilestones(ctx context.Context, projectID string, milestoneIDs []string) error {
	if len(milestoneIDs) == 0 {
		return errors.New("milestone order is required")
	}
	orderedIDs := make([]string, 0, len(milestoneIDs))
	seen := map[string]struct{}{}
	for _, rawID := range milestoneIDs {
		milestoneID := strings.TrimSpace(rawID)
		if milestoneID == "" {
			return errors.New("milestone order contains an empty id")
		}
		if _, exists := seen[milestoneID]; exists {
			return errors.New("milestone order contains duplicate ids")
		}
		seen[milestoneID] = struct{}{}
		orderedIDs = append(orderedIDs, milestoneID)
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return errors.New("could not reorder milestones")
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := s.lockProjectLifecycleTx(ctx, tx, projectID, "changing project milestones", projectAcceptsPlanChanges); err != nil {
		return err
	}

	rows, err := tx.Query(ctx, `SELECT id::text FROM project_milestones WHERE project_id = $1 FOR UPDATE`, projectID)
	if err != nil {
		return errors.New("could not verify milestone order")
	}
	defer rows.Close()

	projectMilestoneIDs := map[string]struct{}{}
	for rows.Next() {
		var milestoneID string
		if err := rows.Scan(&milestoneID); err != nil {
			return errors.New("could not verify milestone order")
		}
		projectMilestoneIDs[milestoneID] = struct{}{}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return errors.New("could not verify milestone order")
	}
	if len(projectMilestoneIDs) != len(orderedIDs) {
		return errors.New("milestone order must include every checkpoint")
	}
	for _, milestoneID := range orderedIDs {
		if _, exists := projectMilestoneIDs[milestoneID]; !exists {
			return errors.New("milestone order contains a checkpoint outside this project")
		}
	}
	for index, milestoneID := range orderedIDs {
		if _, err := tx.Exec(ctx, `UPDATE project_milestones SET sort_order = $1 WHERE project_id = $2 AND id = $3`, index+1, projectID, milestoneID); err != nil {
			return errors.New("could not reorder milestones")
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return errors.New("could not reorder milestones")
	}
	return nil
}

func (s *Server) listProjectMilestones(ctx context.Context, projectID string) ([]MilestoneDTO, error) {
	rows, err := s.db.Query(ctx, milestoneSelectSQL(`WHERE m.project_id = $1`, `ORDER BY m.sort_order ASC, m.target_date ASC NULLS LAST, m.created_at ASC`), projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	milestones := []MilestoneDTO{}
	for rows.Next() {
		milestone, err := scanMilestone(rows)
		if err != nil {
			return nil, err
		}
		milestones = append(milestones, milestone)
	}
	return milestones, rows.Err()
}

func (s *Server) getProjectMilestone(ctx context.Context, projectID string, milestoneID string) (MilestoneDTO, error) {
	return scanMilestone(s.db.QueryRow(ctx, milestoneSelectSQL(`WHERE m.project_id = $1 AND m.id = $2`, ``), projectID, milestoneID))
}

func milestoneSelectSQL(where string, suffix string) string {
	return `
		SELECT
			m.id::text,
			m.project_id::text,
			m.title,
			m.description,
			m.target_date,
			m.sort_order,
			COUNT(DISTINCT t.id)::bigint,
			COUNT(DISTINCT t.id) FILTER (WHERE t.official_progress_state = 'completed')::bigint,
			COUNT(DISTINCT t.id) FILTER (WHERE t.official_progress_state = 'in_progress')::bigint,
			COUNT(DISTINCT t.id) FILTER (WHERE t.official_progress_state = 'needs_changes')::bigint,
			COUNT(DISTINCT pu.id) FILTER (WHERE pu.review_status = 'pending_review')::bigint,
			COUNT(DISTINCT t.id) FILTER (WHERE p.status = 'active' AND t.deadline IS NOT NULL AND t.deadline < current_date AND t.status <> 'done' AND t.official_progress_state <> 'completed')::bigint,
			m.created_by::text,
			u.full_name,
			m.created_at,
			m.updated_at
		FROM project_milestones m
		JOIN projects p ON p.id = m.project_id
		JOIN users u ON u.id = m.created_by
		LEFT JOIN tasks t ON t.milestone_id = m.id AND t.parent_task_id IS NULL
		LEFT JOIN progress_updates pu ON pu.task_id = t.id AND pu.project_id = t.project_id
		` + where + `
		GROUP BY m.id, u.full_name, p.status
		` + suffix + `
	`
}

func scanMilestone(row pgx.Row) (MilestoneDTO, error) {
	var milestone MilestoneDTO
	var description sql.NullString
	var targetDate sql.NullTime
	err := row.Scan(
		&milestone.ID,
		&milestone.ProjectID,
		&milestone.Title,
		&description,
		&targetDate,
		&milestone.SortOrder,
		&milestone.TaskCount,
		&milestone.CompletedTaskCount,
		&milestone.InProgressTaskCount,
		&milestone.NeedsChangesTaskCount,
		&milestone.PendingReviewCount,
		&milestone.OverdueTaskCount,
		&milestone.CreatedBy,
		&milestone.CreatedByName,
		&milestone.CreatedAt,
		&milestone.UpdatedAt,
	)
	milestone.Description = nullString(description)
	milestone.TargetDate = nullDate(targetDate)
	applyMilestoneRollup(&milestone)
	return milestone, err
}

func applyMilestoneRollup(milestone *MilestoneDTO) {
	if milestone.TaskCount == 0 {
		milestone.State = "empty"
		milestone.CompletionPercent = 0
		return
	}
	milestone.CompletionPercent = milestone.CompletedTaskCount * 100 / milestone.TaskCount
	if milestone.NeedsChangesTaskCount > 0 {
		milestone.State = "needs_changes"
		return
	}
	if milestone.CompletedTaskCount == milestone.TaskCount {
		milestone.State = "completed"
		return
	}
	if milestone.InProgressTaskCount > 0 || milestone.CompletedTaskCount > 0 {
		milestone.State = "in_progress"
		return
	}
	milestone.State = "planned"
}

type rowQueryer interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func (s *Server) ensureMilestoneInProject(ctx context.Context, projectID string, milestoneID string) error {
	return ensureMilestoneInProjectTx(ctx, s.db, projectID, milestoneID)
}

func ensureMilestoneInProjectTx(ctx context.Context, q rowQueryer, projectID string, milestoneID string) error {
	var exists bool
	if err := q.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM project_milestones WHERE id = $1 AND project_id = $2)`, milestoneID, projectID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return pgx.ErrNoRows
	}
	return nil
}
