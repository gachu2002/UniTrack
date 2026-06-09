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

type createTaskRequest struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Status      string   `json:"status"`
	Priority    string   `json:"priority"`
	Deadline    string   `json:"deadline"`
	MilestoneID string   `json:"milestoneId"`
	AssigneeIDs []string `json:"assigneeIds"`
}

type updateTaskRequest struct {
	Title                 *string  `json:"title"`
	Description           *string  `json:"description"`
	Status                *string  `json:"status"`
	Priority              *string  `json:"priority"`
	Deadline              *string  `json:"deadline"`
	MilestoneID           *string  `json:"milestoneId"`
	OfficialProgressState *string  `json:"officialProgressState"`
	AssigneeIDs           []string `json:"assigneeIds"`
}

type createProgressUpdateRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Blockers    string `json:"blockers"`
}

type reviewProgressRequest struct {
	ReviewStatus          string `json:"reviewStatus"`
	ReviewComment         string `json:"reviewComment"`
	OfficialProgressState string `json:"officialProgressState"`
}

func (s *Server) handleListTasks(w http.ResponseWriter, r *http.Request) {
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

	tasks, err := s.listProjectTasks(r.Context(), projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load tasks")
		return
	}
	writeJSON(w, http.StatusOK, tasks)
}

func (s *Server) handleCreateTask(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	allowed, err := s.canManageProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "only the supervising teacher or an admin can create official tasks")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "creating assignments", projectAcceptsNewAssignments) {
		return
	}

	var input createTaskRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	taskID, err := s.createTask(r.Context(), user, projectID, input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	task, err := s.getTaskDetail(r.Context(), projectID, taskID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load task")
		return
	}
	writeJSON(w, http.StatusCreated, task)
}

func (s *Server) handleGetTask(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	taskID := chi.URLParam(r, "taskId")
	allowed, err := s.canViewProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this project")
		return
	}

	detail, err := s.getTaskDetail(r.Context(), projectID, taskID)
	if isNoRows(err) {
		writeError(w, http.StatusNotFound, "task not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load task")
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handleUpdateTask(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	taskID := chi.URLParam(r, "taskId")
	allowed, err := s.canManageProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "only the supervising teacher or an admin can update official tasks")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "changing assignments", projectAcceptsPlanChanges) {
		return
	}

	var input updateTaskRequest
	if !decodeJSON(w, r, &input) {
		return
	}

	detail, err := s.getTaskDetail(r.Context(), projectID, taskID)
	if isNoRows(err) {
		writeError(w, http.StatusNotFound, "task not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load task")
		return
	}

	title := detail.Task.Title
	if input.Title != nil {
		title = strings.TrimSpace(*input.Title)
	}
	if title == "" {
		writeError(w, http.StatusBadRequest, "task title is required")
		return
	}
	description := detail.Task.Description
	if input.Description != nil {
		description = optionalString(*input.Description)
	}
	status := detail.Task.Status
	if input.Status != nil {
		status = strings.TrimSpace(*input.Status)
	}
	priority := detail.Task.Priority
	if input.Priority != nil {
		priority = strings.TrimSpace(*input.Priority)
	}
	officialProgressState := detail.Task.OfficialProgressState
	if input.OfficialProgressState != nil {
		officialProgressState = strings.TrimSpace(*input.OfficialProgressState)
	}
	deadlineValue := stringValue(detail.Task.Deadline)
	if input.Deadline != nil {
		deadlineValue = strings.TrimSpace(*input.Deadline)
	}
	deadline, err := parseOptionalDate(deadlineValue)
	if err != nil {
		writeError(w, http.StatusBadRequest, "deadline must be a date in YYYY-MM-DD format")
		return
	}
	milestoneID := stringValue(detail.Task.MilestoneID)
	if input.MilestoneID != nil {
		milestoneID = strings.TrimSpace(*input.MilestoneID)
	}
	if milestoneID == "" {
		writeError(w, http.StatusBadRequest, "assignment milestone is required")
		return
	}
	if err := s.ensureMilestoneInProject(r.Context(), projectID, milestoneID); err != nil {
		writeError(w, http.StatusBadRequest, "invalid milestone id")
		return
	}
	if !validTaskStatus(status) || !validPriority(priority) || !validOfficialProgressState(officialProgressState) {
		writeError(w, http.StatusBadRequest, "invalid task state")
		return
	}
	if contradictoryTaskState(status, officialProgressState) {
		writeError(w, http.StatusBadRequest, "task status conflicts with official progress state")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update task")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	_, err = tx.Exec(r.Context(), `
		UPDATE tasks
		SET title = $1, description = $2, status = $3, priority = $4, deadline = $5, milestone_id = $6, official_progress_state = $7, updated_by = $8
		WHERE id = $9 AND project_id = $10
	`, title, description, status, priority, deadline, optionalString(milestoneID), officialProgressState, user.ID, taskID, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update task")
		return
	}
	if input.AssigneeIDs != nil {
		if _, err := tx.Exec(r.Context(), `DELETE FROM task_assignees WHERE task_id = $1`, taskID); err != nil {
			writeError(w, http.StatusInternalServerError, "could not update assignees")
			return
		}
		if err := s.insertTaskAssignees(r.Context(), tx, projectID, taskID, input.AssigneeIDs); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update task")
		return
	}

	updated, err := s.getTaskDetail(r.Context(), projectID, taskID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load task")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleCreateProgressUpdate(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	taskID := chi.URLParam(r, "taskId")
	allowed, err := s.canViewProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this project")
		return
	}
	if user.Role != RoleStudent {
		writeError(w, http.StatusForbidden, "only assigned students can submit progress")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "submitting work", projectAcceptsStudentSubmissions) {
		return
	}
	if err := s.ensureMainTaskInProject(r.Context(), projectID, taskID); err != nil {
		writeError(w, http.StatusNotFound, "task not found")
		return
	}
	assigned, err := s.isTaskAssignedToStudent(r.Context(), taskID, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not verify task assignment")
		return
	}
	if !assigned {
		writeError(w, http.StatusForbidden, "students can submit progress only for assigned official tasks")
		return
	}

	var input createProgressUpdateRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	description := strings.TrimSpace(input.Description)
	if description == "" {
		writeError(w, http.StatusBadRequest, "progress description is required")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not submit progress")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	var taskStatus, officialState string
	if err := tx.QueryRow(r.Context(), `
		SELECT status, official_progress_state
		FROM tasks
		WHERE id = $1 AND project_id = $2 AND parent_task_id IS NULL
		FOR UPDATE
	`, taskID, projectID).Scan(&taskStatus, &officialState); err != nil {
		writeError(w, http.StatusNotFound, "task not found")
		return
	}
	if taskStatus == "done" || officialState == "completed" {
		writeError(w, http.StatusConflict, "completed assignments cannot receive new submissions")
		return
	}
	var hasPendingReview bool
	if err := tx.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM progress_updates WHERE task_id = $1 AND review_status = 'pending_review')`, taskID).Scan(&hasPendingReview); err != nil {
		writeError(w, http.StatusInternalServerError, "could not verify pending submissions")
		return
	}
	if hasPendingReview {
		writeError(w, http.StatusConflict, "this assignment already has a submission waiting for review")
		return
	}

	var updateID string
	err = tx.QueryRow(r.Context(), `
		INSERT INTO progress_updates (project_id, task_id, submitted_by, title, description, blockers)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id::text
	`, projectID, taskID, user.ID, optionalString(input.Title), description, optionalString(input.Blockers)).Scan(&updateID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not submit progress")
		return
	}
	if _, err := tx.Exec(r.Context(), `UPDATE tasks SET status = 'submitted', updated_by = $1 WHERE id = $2`, user.ID, taskID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update assignment state")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not submit progress")
		return
	}

	update, err := s.getProgressUpdate(r.Context(), projectID, updateID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load progress update")
		return
	}
	writeJSON(w, http.StatusCreated, update)
}

func (s *Server) handleListProjectProgressUpdates(w http.ResponseWriter, r *http.Request) {
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

	updates, err := s.listProjectProgressUpdates(r.Context(), projectID, 100)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load progress updates")
		return
	}
	writeJSON(w, http.StatusOK, updates)
}

func (s *Server) handleReviewProgressUpdate(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	updateID := chi.URLParam(r, "updateId")
	allowed, err := s.canManageProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "only the supervising teacher or an admin can review progress")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "reviewing submissions", projectAcceptsReviews) {
		return
	}

	var input reviewProgressRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	status := strings.TrimSpace(input.ReviewStatus)
	if !validReviewStatus(status) {
		writeError(w, http.StatusBadRequest, "invalid review status")
		return
	}
	officialState := strings.TrimSpace(input.OfficialProgressState)
	if officialState != "" && !validOfficialProgressState(officialState) {
		writeError(w, http.StatusBadRequest, "invalid official progress state")
		return
	}
	if officialState == "" {
		officialState = defaultOfficialStateForReview(status)
	}
	if contradictoryReviewState(status, officialState) {
		writeError(w, http.StatusBadRequest, "review decision conflicts with official progress state")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not review progress")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	var taskID, currentStatus string
	var submittedAt sql.NullTime
	if err := tx.QueryRow(r.Context(), `
		SELECT task_id::text, review_status, created_at FROM progress_updates WHERE id = $1 AND project_id = $2 FOR UPDATE
	`, updateID, projectID).Scan(&taskID, &currentStatus, &submittedAt); err != nil {
		writeError(w, http.StatusNotFound, "progress update not found")
		return
	}
	if currentStatus != "pending_review" {
		writeError(w, http.StatusConflict, "progress update has already been reviewed")
		return
	}
	var currentTaskStatus, currentOfficialState string
	if err := tx.QueryRow(r.Context(), `SELECT status, official_progress_state FROM tasks WHERE id = $1 FOR UPDATE`, taskID).Scan(&currentTaskStatus, &currentOfficialState); err != nil {
		writeError(w, http.StatusInternalServerError, "could not load assignment state")
		return
	}
	if currentTaskStatus == "done" || currentOfficialState == "completed" {
		writeError(w, http.StatusConflict, "completed assignments cannot be reviewed again")
		return
	}
	if submittedAt.Valid {
		var newerSubmissionExists bool
		if err := tx.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM progress_updates WHERE task_id = $1 AND created_at > $2)`, taskID, submittedAt.Time).Scan(&newerSubmissionExists); err != nil {
			writeError(w, http.StatusInternalServerError, "could not verify submission order")
			return
		}
		if newerSubmissionExists {
			writeError(w, http.StatusConflict, "a newer submission exists for this assignment")
			return
		}
	}

	_, err = tx.Exec(r.Context(), `
		INSERT INTO progress_reviews (progress_update_id, reviewed_by, review_status, review_comment, official_progress_state)
		VALUES ($1, $2, $3, $4, $5)
	`, updateID, user.ID, status, optionalString(input.ReviewComment), optionalString(officialState))
	if err != nil {
		if isUniqueViolation(err, "progress_reviews_one_review_per_update_unique") {
			writeError(w, http.StatusConflict, "progress update has already been reviewed")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not save review")
		return
	}
	_, err = tx.Exec(r.Context(), `UPDATE progress_updates SET review_status = $1 WHERE id = $2`, status, updateID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update progress status")
		return
	}
	_, err = tx.Exec(r.Context(), `UPDATE tasks SET status = $1, official_progress_state = $2, updated_by = $3 WHERE id = $4`, taskStatusForReview(status, officialState), officialState, user.ID, taskID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update assignment state")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not review progress")
		return
	}

	update, err := s.getProgressUpdate(r.Context(), projectID, updateID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load progress update")
		return
	}
	writeJSON(w, http.StatusOK, update)
}

func (s *Server) createTask(ctx context.Context, user User, projectID string, input createTaskRequest) (string, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return "", errors.New("task title is required")
	}
	status := strings.TrimSpace(input.Status)
	if status == "" {
		status = "todo"
	}
	priority := strings.TrimSpace(input.Priority)
	if priority == "" {
		priority = "medium"
	}
	if !validTaskStatus(status) {
		return "", errors.New("invalid task status")
	}
	if status == "done" {
		return "", errors.New("new assignments cannot start completed")
	}
	if !validPriority(priority) {
		return "", errors.New("invalid task priority")
	}
	deadline, err := parseOptionalDate(input.Deadline)
	if err != nil {
		return "", errors.New("deadline must be a date in YYYY-MM-DD format")
	}

	milestoneID := strings.TrimSpace(input.MilestoneID)
	if milestoneID == "" {
		return "", errors.New("assignment milestone is required")
	}
	if err := s.ensureMilestoneInProject(ctx, projectID, milestoneID); err != nil {
		return "", errors.New("invalid milestone id")
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return "", errors.New("could not create task")
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var taskID string
	err = tx.QueryRow(ctx, `
		INSERT INTO tasks (project_id, milestone_id, title, description, status, priority, deadline, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id::text
	`, projectID, optionalString(milestoneID), title, optionalString(input.Description), status, priority, deadline, user.ID).Scan(&taskID)
	if err != nil {
		return "", errors.New("could not create task")
	}

	if err := s.insertTaskAssignees(ctx, tx, projectID, taskID, input.AssigneeIDs); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", errors.New("could not save task")
	}
	return taskID, nil
}

func (s *Server) listProjectTasks(ctx context.Context, projectID string) ([]TaskDTO, error) {
	where := `WHERE t.project_id = $1 AND t.parent_task_id IS NULL`
	rows, err := s.db.Query(ctx, taskSelectSQL(where, `ORDER BY t.deadline ASC NULLS LAST, t.created_at DESC`), projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tasks := []TaskDTO{}
	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := s.loadTaskAssigneesForTasks(ctx, tasks); err != nil {
		return nil, err
	}
	return tasks, nil
}

func (s *Server) getTaskDetail(ctx context.Context, projectID string, taskID string) (TaskDetailDTO, error) {
	task, err := scanTask(s.db.QueryRow(ctx, taskSelectSQL(`WHERE t.project_id = $1 AND t.id = $2 AND t.parent_task_id IS NULL`, ``), projectID, taskID))
	if err != nil {
		return TaskDetailDTO{}, err
	}
	task.Assignees, err = s.loadTaskAssignees(ctx, task.ID)
	if err != nil {
		return TaskDetailDTO{}, err
	}

	updates, err := s.listProgressUpdates(ctx, projectID, taskID, 50)
	if err != nil {
		return TaskDetailDTO{}, err
	}
	return TaskDetailDTO{Task: task, ProgressUpdates: updates}, nil
}

func taskSelectSQL(where string, suffix string) string {
	return `
		SELECT
			t.id::text,
			t.project_id::text,
			p.name,
			t.milestone_id::text,
			m.title,
			t.title,
			t.description,
			t.status,
			t.priority,
			t.deadline,
			t.official_progress_state,
			t.created_by::text,
			u.full_name,
			t.created_at,
			t.updated_at,
			COUNT(DISTINCT pu.id)::bigint,
			COUNT(DISTINCT pu.id) FILTER (WHERE pu.review_status = 'pending_review')::bigint,
			(p.status = 'active' AND t.deadline IS NOT NULL AND t.deadline < current_date AND t.status <> 'done' AND t.official_progress_state <> 'completed')
		FROM tasks t
		JOIN projects p ON p.id = t.project_id
		JOIN users u ON u.id = t.created_by
		LEFT JOIN project_milestones m ON m.id = t.milestone_id
		LEFT JOIN progress_updates pu ON pu.task_id = t.id
		` + where + `
		GROUP BY t.id, p.name, u.full_name, m.id, m.title, p.status
		` + suffix + `
	`
}

func scanTask(row pgx.Row) (TaskDTO, error) {
	var task TaskDTO
	var milestoneID, milestoneTitle, description sql.NullString
	var deadline sql.NullTime
	err := row.Scan(
		&task.ID,
		&task.ProjectID,
		&task.ProjectName,
		&milestoneID,
		&milestoneTitle,
		&task.Title,
		&description,
		&task.Status,
		&task.Priority,
		&deadline,
		&task.OfficialProgressState,
		&task.CreatedBy,
		&task.CreatedByName,
		&task.CreatedAt,
		&task.UpdatedAt,
		&task.ProgressUpdateCount,
		&task.PendingReviewCount,
		&task.IsOverdue,
	)
	task.MilestoneID = nullString(milestoneID)
	task.MilestoneTitle = nullString(milestoneTitle)
	task.Description = nullString(description)
	task.Deadline = nullDate(deadline)
	if task.Assignees == nil {
		task.Assignees = []UserDTO{}
	}
	return task, err
}

func (s *Server) loadTaskAssignees(ctx context.Context, taskID string) ([]UserDTO, error) {
	rows, err := s.db.Query(ctx, `
		SELECT u.id::text, u.full_name, u.email, u.role, u.status, u.avatar_url, u.created_at, u.updated_at
		FROM task_assignees ta
		JOIN users u ON u.id = ta.student_id
		WHERE ta.task_id = $1
		ORDER BY u.full_name ASC
	`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []UserDTO{}
	for rows.Next() {
		var user User
		var avatar sql.NullString
		if err := rows.Scan(&user.ID, &user.FullName, &user.Email, &user.Role, &user.Status, &avatar, &user.CreatedAt, &user.UpdatedAt); err != nil {
			return nil, err
		}
		user.AvatarURL = nullString(avatar)
		users = append(users, userDTO(user))
	}
	return users, rows.Err()
}

func (s *Server) loadTaskAssigneesForTasks(ctx context.Context, tasks []TaskDTO) error {
	if len(tasks) == 0 {
		return nil
	}
	taskIDs := make([]string, 0, len(tasks))
	for index := range tasks {
		tasks[index].Assignees = []UserDTO{}
		taskIDs = append(taskIDs, tasks[index].ID)
	}

	rows, err := s.db.Query(ctx, `
		SELECT ta.task_id::text, u.id::text, u.full_name, u.email, u.role, u.status, u.avatar_url, u.created_at, u.updated_at
		FROM task_assignees ta
		JOIN users u ON u.id = ta.student_id
		WHERE ta.task_id::text = ANY($1)
		ORDER BY ta.task_id, u.full_name ASC
	`, taskIDs)
	if err != nil {
		return err
	}
	defer rows.Close()

	assigneesByTask := map[string][]UserDTO{}
	for rows.Next() {
		var taskID string
		var user User
		var avatar sql.NullString
		if err := rows.Scan(&taskID, &user.ID, &user.FullName, &user.Email, &user.Role, &user.Status, &avatar, &user.CreatedAt, &user.UpdatedAt); err != nil {
			return err
		}
		user.AvatarURL = nullString(avatar)
		assigneesByTask[taskID] = append(assigneesByTask[taskID], userDTO(user))
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for index := range tasks {
		if assignees, ok := assigneesByTask[tasks[index].ID]; ok {
			tasks[index].Assignees = assignees
		}
	}
	return nil
}

func (s *Server) insertTaskAssignees(ctx context.Context, tx pgx.Tx, projectID string, taskID string, assigneeIDs []string) error {
	seen := map[string]struct{}{}
	for _, assigneeID := range assigneeIDs {
		studentID := strings.TrimSpace(assigneeID)
		if studentID == "" {
			continue
		}
		if _, ok := seen[studentID]; ok {
			continue
		}
		seen[studentID] = struct{}{}
		var exists bool
		if err := tx.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM project_members pm
				JOIN users u ON u.id = pm.student_id
				WHERE pm.project_id = $1
				  AND pm.student_id = $2
				  AND u.role = 'student'
				  AND u.status = 'active'
			)
		`, projectID, studentID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return errors.New("assignees must be active project members")
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO task_assignees (task_id, student_id)
			VALUES ($1, $2)
			ON CONFLICT (task_id, student_id) DO NOTHING
		`, taskID, studentID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) ensureMainTaskInProject(ctx context.Context, projectID string, taskID string) error {
	var exists bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM tasks WHERE id = $1 AND project_id = $2 AND parent_task_id IS NULL)`, taskID, projectID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return pgx.ErrNoRows
	}
	return nil
}

func (s *Server) isTaskAssignedToStudent(ctx context.Context, taskID string, studentID string) (bool, error) {
	var assigned bool
	err := s.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM task_assignees WHERE task_id = $1 AND student_id = $2
		)
	`, taskID, studentID).Scan(&assigned)
	return assigned, err
}

func (s *Server) listProgressUpdates(ctx context.Context, projectID string, taskID string, limit int) ([]ProgressUpdateDTO, error) {
	rows, err := s.db.Query(ctx, `
		SELECT pu.id::text, pu.project_id::text, p.name, pu.task_id::text, t.title, pu.submitted_by::text, u.full_name,
		       pu.title, pu.description, pu.blockers, pu.review_status, pu.created_at, pu.updated_at
		FROM progress_updates pu
		JOIN projects p ON p.id = pu.project_id
		JOIN tasks t ON t.id = pu.task_id
		JOIN users u ON u.id = pu.submitted_by
		WHERE pu.project_id = $1 AND pu.task_id = $2
		ORDER BY pu.created_at DESC
		LIMIT $3
	`, projectID, taskID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	updates := []ProgressUpdateDTO{}
	for rows.Next() {
		update, err := scanProgressUpdate(rows)
		if err != nil {
			return nil, err
		}
		latest, err := s.latestReview(ctx, update.ID)
		if err != nil && !isNoRows(err) {
			return nil, err
		}
		if err == nil {
			update.LatestReview = &latest
		}
		updates = append(updates, update)
	}
	return updates, rows.Err()
}

func (s *Server) listProjectProgressUpdates(ctx context.Context, projectID string, limit int) ([]ProgressUpdateDTO, error) {
	rows, err := s.db.Query(ctx, `
		SELECT pu.id::text, pu.project_id::text, p.name, pu.task_id::text, t.title, pu.submitted_by::text, u.full_name,
		       pu.title, pu.description, pu.blockers, pu.review_status, pu.created_at, pu.updated_at
		FROM progress_updates pu
		JOIN projects p ON p.id = pu.project_id
		JOIN tasks t ON t.id = pu.task_id
		JOIN users u ON u.id = pu.submitted_by
		WHERE pu.project_id = $1
		ORDER BY pu.created_at DESC
		LIMIT $2
	`, projectID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	updates := []ProgressUpdateDTO{}
	for rows.Next() {
		update, err := scanProgressUpdate(rows)
		if err != nil {
			return nil, err
		}
		latest, err := s.latestReview(ctx, update.ID)
		if err != nil && !isNoRows(err) {
			return nil, err
		}
		if err == nil {
			update.LatestReview = &latest
		}
		updates = append(updates, update)
	}
	return updates, rows.Err()
}

func (s *Server) getProgressUpdate(ctx context.Context, projectID string, updateID string) (ProgressUpdateDTO, error) {
	update, err := scanProgressUpdate(s.db.QueryRow(ctx, `
		SELECT pu.id::text, pu.project_id::text, p.name, pu.task_id::text, t.title, pu.submitted_by::text, u.full_name,
		       pu.title, pu.description, pu.blockers, pu.review_status, pu.created_at, pu.updated_at
		FROM progress_updates pu
		JOIN projects p ON p.id = pu.project_id
		JOIN tasks t ON t.id = pu.task_id
		JOIN users u ON u.id = pu.submitted_by
		WHERE pu.project_id = $1 AND pu.id = $2
	`, projectID, updateID))
	if err != nil {
		return ProgressUpdateDTO{}, err
	}
	latest, err := s.latestReview(ctx, update.ID)
	if err != nil && !isNoRows(err) {
		return ProgressUpdateDTO{}, err
	}
	if err == nil {
		update.LatestReview = &latest
	}
	return update, nil
}

func scanProgressUpdate(row pgx.Row) (ProgressUpdateDTO, error) {
	var update ProgressUpdateDTO
	var title, blockers sql.NullString
	err := row.Scan(
		&update.ID,
		&update.ProjectID,
		&update.ProjectName,
		&update.TaskID,
		&update.TaskTitle,
		&update.SubmittedBy,
		&update.SubmittedByName,
		&title,
		&update.Description,
		&blockers,
		&update.ReviewStatus,
		&update.CreatedAt,
		&update.UpdatedAt,
	)
	update.Title = nullString(title)
	update.Blockers = nullString(blockers)
	return update, err
}

func (s *Server) latestReview(ctx context.Context, updateID string) (ProgressReviewDTO, error) {
	var review ProgressReviewDTO
	var comment, officialState sql.NullString
	err := s.db.QueryRow(ctx, `
		SELECT pr.id::text, pr.progress_update_id::text, pr.reviewed_by::text, u.full_name,
		       pr.review_status, pr.review_comment, pr.official_progress_state, pr.reviewed_at
		FROM progress_reviews pr
		JOIN users u ON u.id = pr.reviewed_by
		WHERE pr.progress_update_id = $1
		ORDER BY pr.reviewed_at DESC
		LIMIT 1
	`, updateID).Scan(
		&review.ID,
		&review.ProgressUpdateID,
		&review.ReviewedBy,
		&review.ReviewedByName,
		&review.ReviewStatus,
		&comment,
		&officialState,
		&review.ReviewedAt,
	)
	review.ReviewComment = nullString(comment)
	review.OfficialProgressState = nullString(officialState)
	return review, err
}

func validTaskStatus(status string) bool {
	switch status {
	case "todo", "in_progress", "submitted", "needs_changes", "done":
		return true
	default:
		return false
	}
}

func validPriority(priority string) bool {
	switch priority {
	case "low", "medium", "high":
		return true
	default:
		return false
	}
}

func validReviewStatus(status string) bool {
	switch status {
	case "approved", "needs_changes", "rejected":
		return true
	default:
		return false
	}
}

func validOfficialProgressState(status string) bool {
	switch status {
	case "no_progress", "in_progress", "needs_changes", "completed":
		return true
	default:
		return false
	}
}

func defaultOfficialStateForReview(reviewStatus string) string {
	if reviewStatus == "approved" {
		return "in_progress"
	}
	return "needs_changes"
}

func taskStatusForReview(reviewStatus string, officialState string) string {
	if officialState == "completed" {
		return "done"
	}
	if reviewStatus == "approved" {
		return "in_progress"
	}
	return "needs_changes"
}

func contradictoryReviewState(reviewStatus string, officialState string) bool {
	if officialState == "" {
		return false
	}
	if reviewStatus == "approved" {
		return officialState == "needs_changes" || officialState == "no_progress"
	}
	if reviewStatus == "needs_changes" || reviewStatus == "rejected" {
		return officialState == "completed"
	}
	return false
}

func contradictoryTaskState(status string, officialState string) bool {
	if status == "done" {
		return officialState != "completed"
	}
	return officialState == "completed"
}
