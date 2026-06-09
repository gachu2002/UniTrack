package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type createProjectRequest struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	Topic        string `json:"topic"`
	ClassID      string `json:"classId"`
	SupervisorID string `json:"supervisorId"`
	StartDate    string `json:"startDate"`
	EndDate      string `json:"endDate"`
	Status       string `json:"status"`
}

type updateProjectRequest struct {
	Name            *string `json:"name"`
	Description     *string `json:"description"`
	Topic           *string `json:"topic"`
	ClassID         *string `json:"classId"`
	StartDate       *string `json:"startDate"`
	EndDate         *string `json:"endDate"`
	Status          *string `json:"status"`
	ProgressSummary *string `json:"progressSummary"`
}

type addProjectMemberRequest struct {
	Email string `json:"email"`
}

type updateProjectMemberRequest struct {
	MemberRole string `json:"memberRole"`
}

func (s *Server) handleListProjects(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	limit, err := parseListLimit(r.URL.Query().Get("limit"), 24, 200)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project list limit")
		return
	}
	projects, err := s.listProjectsFiltered(r.Context(), user, limit, r.URL.Query().Get("unassigned") == "true")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load projects")
		return
	}
	writeJSON(w, http.StatusOK, projects)
}

func (s *Server) handleGetProject(w http.ResponseWriter, r *http.Request) {
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

	project, err := s.getProjectByID(r.Context(), projectID)
	if isNoRows(err) {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load project")
		return
	}

	writeJSON(w, http.StatusOK, project)
}

func (s *Server) handleCreateProject(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	if !canCreateProject(user) {
		writeError(w, http.StatusForbidden, "only teachers and admins can create projects")
		return
	}

	var input createProjectRequest
	if !decodeJSON(w, r, &input) {
		return
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "project name is required")
		return
	}

	status := strings.TrimSpace(input.Status)
	if status == "" {
		status = "active"
	}
	if !validProjectStatus(status) {
		writeError(w, http.StatusBadRequest, "invalid project status")
		return
	}

	classID := strings.TrimSpace(input.ClassID)
	if classID != "" {
		classAllowed, err := s.canUseCourseSectionForProject(r.Context(), user, classID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid class id")
			return
		}
		if !classAllowed {
			writeError(w, http.StatusForbidden, "you do not have access to this active class")
			return
		}
	}

	startDate, err := parseDate(input.StartDate)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid start date")
		return
	}
	endDate, err := parseDate(input.EndDate)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid end date")
		return
	}
	if startDate != nil && endDate != nil && endDate.Before(*startDate) {
		writeError(w, http.StatusBadRequest, "end date cannot be before start date")
		return
	}

	supervisorID := user.ID
	if user.Role == RoleAdmin && strings.TrimSpace(input.SupervisorID) != "" {
		supervisorID = strings.TrimSpace(input.SupervisorID)
	}
	if err := s.ensureSupervisor(r.Context(), supervisorID); err != nil {
		writeError(w, http.StatusBadRequest, "supervisor must be an active teacher or admin")
		return
	}
	if classID != "" {
		ownerMatches, err := s.classOwnerMatchesSupervisor(r.Context(), classID, supervisorID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid class id")
			return
		}
		if !ownerMatches {
			writeError(w, http.StatusBadRequest, "project supervisor must own the class")
			return
		}
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create project")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	var projectID string
	err = tx.QueryRow(r.Context(), `
		INSERT INTO projects (name, description, topic, supervisor_id, start_date, end_date, status, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id::text
	`, name, optionalString(input.Description), optionalString(input.Topic), supervisorID, startDate, endDate, status, user.ID).Scan(&projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create project")
		return
	}

	if classID != "" {
		_, err = tx.Exec(r.Context(), `
			INSERT INTO course_section_projects (course_section_id, project_id, added_by)
			VALUES ($1, $2, $3)
		`, classID, projectID, user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not link project to class")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save project")
		return
	}

	project, err := s.getProjectByID(r.Context(), projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load project")
		return
	}
	writeJSON(w, http.StatusCreated, project)
}

func (s *Server) handleUpdateProject(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	allowed, err := s.canManageProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "only the supervising teacher or an admin can update this project")
		return
	}

	current, err := s.getProjectByID(r.Context(), projectID)
	if isNoRows(err) {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load project")
		return
	}

	var input updateProjectRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	if current.Status == projectStatusArchived && !projectUpdateOnlyStatus(input) {
		writeError(w, http.StatusConflict, projectLifecycleMessage(current.Status, "changing project details"))
		return
	}

	name := current.Name
	if input.Name != nil {
		name = strings.TrimSpace(*input.Name)
	}
	if name == "" {
		writeError(w, http.StatusBadRequest, "project name is required")
		return
	}

	status := current.Status
	if input.Status != nil {
		status = strings.TrimSpace(*input.Status)
	}
	if !validProjectStatus(status) {
		writeError(w, http.StatusBadRequest, "invalid project status")
		return
	}

	startDateValue := stringValue(current.StartDate)
	if input.StartDate != nil {
		startDateValue = strings.TrimSpace(*input.StartDate)
	}
	endDateValue := stringValue(current.EndDate)
	if input.EndDate != nil {
		endDateValue = strings.TrimSpace(*input.EndDate)
	}
	startDate, err := parseDate(startDateValue)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid start date")
		return
	}
	endDate, err := parseDate(endDateValue)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid end date")
		return
	}
	if startDate != nil && endDate != nil && endDate.Before(*startDate) {
		writeError(w, http.StatusBadRequest, "end date cannot be before start date")
		return
	}

	description := stringValue(current.Description)
	if input.Description != nil {
		description = strings.TrimSpace(*input.Description)
	}
	topic := stringValue(current.Topic)
	if input.Topic != nil {
		topic = strings.TrimSpace(*input.Topic)
	}
	progressSummary := stringValue(current.ProgressSummary)
	if input.ProgressSummary != nil {
		progressSummary = strings.TrimSpace(*input.ProgressSummary)
	}
	var classID string
	unlinkClass := false
	if input.ClassID != nil {
		classID = strings.TrimSpace(*input.ClassID)
		if classID == "" {
			unlinkClass = true
		} else {
			classAllowed, err := s.canUseCourseSectionForProject(r.Context(), user, classID)
			if err != nil {
				writeError(w, http.StatusBadRequest, "invalid class id")
				return
			}
			if !classAllowed {
				writeError(w, http.StatusForbidden, "you do not have access to this active class")
				return
			}
			ownerMatches, err := s.classOwnerMatchesSupervisor(r.Context(), classID, current.SupervisorID)
			if err != nil {
				writeError(w, http.StatusBadRequest, "invalid class id")
				return
			}
			if !ownerMatches {
				writeError(w, http.StatusBadRequest, "project supervisor must own the class")
				return
			}
		}
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update project")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	_, err = tx.Exec(r.Context(), `
		UPDATE projects
		SET name = $1, description = $2, topic = $3, start_date = $4, end_date = $5, status = $6, progress_summary = $7
		WHERE id = $8
	`, name, optionalString(description), optionalString(topic), startDate, endDate, status, optionalString(progressSummary), projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update project")
		return
	}
	if unlinkClass {
		_, err = tx.Exec(r.Context(), `DELETE FROM course_section_projects WHERE project_id = $1`, projectID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not update project class")
			return
		}
	} else if input.ClassID != nil {
		_, err = tx.Exec(r.Context(), `
			INSERT INTO course_section_projects (course_section_id, project_id, added_by)
			VALUES ($1, $2, $3)
			ON CONFLICT (project_id) DO UPDATE
			SET course_section_id = EXCLUDED.course_section_id,
				added_by = EXCLUDED.added_by,
				added_at = now()
		`, classID, projectID, user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not update project class")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save project")
		return
	}

	updated, err := s.getProjectByID(r.Context(), projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load project")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleListProjectMembers(w http.ResponseWriter, r *http.Request) {
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

	rows, err := s.db.Query(r.Context(), `
		SELECT u.id::text, u.full_name, u.email, u.role, u.status, pm.member_role, pm.joined_at
		FROM project_members pm
		JOIN users u ON u.id = pm.student_id
		WHERE pm.project_id = $1
		ORDER BY pm.joined_at ASC, u.full_name ASC
	`, projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load members")
		return
	}
	defer rows.Close()

	members := []ProjectMemberDTO{}
	for rows.Next() {
		var member ProjectMemberDTO
		if err := rows.Scan(&member.ID, &member.FullName, &member.Email, &member.Role, &member.Status, &member.MemberRole, &member.JoinedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "could not load members")
			return
		}
		members = append(members, member)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "could not load members")
		return
	}

	writeJSON(w, http.StatusOK, members)
}

func (s *Server) handleUpdateProjectMember(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	memberID := chi.URLParam(r, "memberId")
	allowed, err := s.canManageProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "only the supervising teacher or an admin can update project members")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "changing project members", projectAcceptsTeamChanges) {
		return
	}

	var input updateProjectMemberRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	memberRole := strings.TrimSpace(input.MemberRole)
	if !validProjectMemberRole(memberRole) {
		writeError(w, http.StatusBadRequest, "invalid project member role")
		return
	}

	member, err := s.updateProjectMemberRole(r.Context(), projectID, memberID, memberRole)
	if isNoRows(err) {
		writeError(w, http.StatusNotFound, "project member not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update project member")
		return
	}
	writeJSON(w, http.StatusOK, member)
}

func (s *Server) handleAddProjectMember(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	allowed, err := s.canManageProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "only the supervising teacher or an admin can add project members")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "changing project members", projectAcceptsTeamChanges) {
		return
	}

	var input addProjectMemberRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if !validEmailAddress(email) {
		writeError(w, http.StatusBadRequest, "valid student email is required")
		return
	}

	var studentID, role, status string
	err = s.db.QueryRow(r.Context(), `SELECT id::text, role, status FROM users WHERE lower(email) = $1`, email).Scan(&studentID, &role, &status)
	if isNoRows(err) {
		writeError(w, http.StatusNotFound, "student account not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load student account")
		return
	}
	if role != RoleStudent {
		writeError(w, http.StatusBadRequest, "project members must be student accounts")
		return
	}
	if status != "active" {
		writeError(w, http.StatusConflict, "student account is inactive; contact an administrator before adding")
		return
	}

	var member ProjectMemberDTO
	err = s.db.QueryRow(r.Context(), `
		WITH inserted AS (
			INSERT INTO project_members (project_id, student_id)
			VALUES ($1, $2)
			RETURNING student_id, member_role, joined_at
		)
		SELECT u.id::text, u.full_name, u.email, u.role, u.status, inserted.member_role, inserted.joined_at
		FROM inserted
		JOIN users u ON u.id = inserted.student_id
	`, projectID, studentID).Scan(&member.ID, &member.FullName, &member.Email, &member.Role, &member.Status, &member.MemberRole, &member.JoinedAt)
	if isUniqueViolation(err, "project_members_project_id_student_id_key") {
		writeError(w, http.StatusConflict, "student is already a project member")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not add project member")
		return
	}
	writeJSON(w, http.StatusCreated, member)
}

func (s *Server) handleRemoveProjectMember(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	projectID := chi.URLParam(r, "projectId")
	memberID := chi.URLParam(r, "memberId")
	allowed, err := s.canManageProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "only the supervising teacher or an admin can remove project members")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "changing project members", projectAcceptsTeamChanges) {
		return
	}

	var isSupervisor bool
	if err := s.db.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1 AND supervisor_id = $2)`, projectID, memberID).Scan(&isSupervisor); err != nil {
		writeError(w, http.StatusInternalServerError, "could not verify project member")
		return
	}
	if isSupervisor {
		writeError(w, http.StatusBadRequest, "project supervisor cannot be removed")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not remove project member")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	result, err := tx.Exec(r.Context(), `DELETE FROM project_members WHERE project_id = $1 AND student_id = $2`, projectID, memberID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not remove project member")
		return
	}
	if result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "project member not found")
		return
	}
	if _, err := tx.Exec(r.Context(), `
		DELETE FROM task_assignees ta
		USING tasks t
		WHERE ta.task_id = t.id AND t.project_id = $1 AND ta.student_id = $2
	`, projectID, memberID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not remove task assignments")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not remove project member")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

func (s *Server) updateProjectMemberRole(ctx context.Context, projectID string, memberID string, memberRole string) (ProjectMemberDTO, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return ProjectMemberDTO{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	rows, err := tx.Query(ctx, `SELECT student_id::text FROM project_members WHERE project_id = $1 ORDER BY student_id FOR UPDATE`, projectID)
	if err != nil {
		return ProjectMemberDTO{}, err
	}
	targetFound := false
	for rows.Next() {
		var currentMemberID string
		if err := rows.Scan(&currentMemberID); err != nil {
			rows.Close()
			return ProjectMemberDTO{}, err
		}
		if currentMemberID == memberID {
			targetFound = true
		}
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return ProjectMemberDTO{}, err
	}
	rows.Close()
	if !targetFound {
		return ProjectMemberDTO{}, pgx.ErrNoRows
	}

	if memberRole == "leader" {
		if _, err := tx.Exec(ctx, `UPDATE project_members SET member_role = 'member' WHERE project_id = $1 AND student_id <> $2 AND member_role = 'leader'`, projectID, memberID); err != nil {
			return ProjectMemberDTO{}, err
		}
	}

	var member ProjectMemberDTO
	err = tx.QueryRow(ctx, `
		WITH updated AS (
			UPDATE project_members
			SET member_role = $1
			WHERE project_id = $2 AND student_id = $3
			RETURNING student_id, member_role, joined_at
		)
		SELECT u.id::text, u.full_name, u.email, u.role, u.status, updated.member_role, updated.joined_at
		FROM updated
		JOIN users u ON u.id = updated.student_id
	`, memberRole, projectID, memberID).Scan(&member.ID, &member.FullName, &member.Email, &member.Role, &member.Status, &member.MemberRole, &member.JoinedAt)
	if err != nil {
		return ProjectMemberDTO{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ProjectMemberDTO{}, err
	}
	return member, nil
}

func (s *Server) listProjects(ctx context.Context, user User, limit int) ([]ProjectDTO, error) {
	return s.listProjectsFiltered(ctx, user, limit, false)
}

func (s *Server) listProjectsFiltered(ctx context.Context, user User, limit int, unassigned bool) ([]ProjectDTO, error) {
	where := ""
	args := []any{}

	switch user.Role {
	case RoleTeacher:
		args = append(args, user.ID)
		where = appendProjectWhere(where, "p.supervisor_id = $1")
	case RoleStudent:
		args = append(args, user.ID)
		where = appendProjectWhere(where, "EXISTS (SELECT 1 FROM project_members pm2 WHERE pm2.project_id = p.id AND pm2.student_id = $1)")
	}
	if unassigned {
		where = appendProjectWhere(where, "NOT EXISTS (SELECT 1 FROM course_section_projects csp_filter WHERE csp_filter.project_id = p.id)")
	}
	args = append(args, limit)
	query := projectSelectSQL(where, "ORDER BY p.updated_at DESC LIMIT $"+strconv.Itoa(len(args)))

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []ProjectDTO{}
	for rows.Next() {
		project, err := scanProject(rows)
		if err != nil {
			return nil, err
		}
		projects = append(projects, project)
	}
	return projects, rows.Err()
}

func appendProjectWhere(where string, condition string) string {
	if where == "" {
		return "WHERE " + condition
	}
	return where + " AND " + condition
}

func parseListLimit(value string, fallback int, max int) (int, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fallback, nil
	}
	limit, err := strconv.Atoi(trimmed)
	if err != nil || limit <= 0 {
		return 0, errors.New("invalid limit")
	}
	if limit > max {
		return max, nil
	}
	return limit, nil
}

func (s *Server) getProjectByID(ctx context.Context, projectID string) (ProjectDTO, error) {
	return scanProject(s.db.QueryRow(ctx, projectSelectSQL("WHERE p.id = $1", ""), projectID))
}

func projectSelectSQL(where string, suffix string) string {
	return `
		SELECT
			p.id::text,
			p.name,
			p.description,
			p.topic,
			cs.id::text,
			cs.title,
			cs.color,
			p.supervisor_id::text,
			u.full_name,
			to_char(p.start_date, 'YYYY-MM-DD'),
			to_char(p.end_date, 'YYYY-MM-DD'),
			p.status,
			p.official_progress_state,
			p.progress_summary,
			(SELECT COUNT(*)::bigint FROM project_members pm WHERE pm.project_id = p.id),
			(SELECT COUNT(*)::bigint FROM tasks t WHERE t.project_id = p.id AND t.parent_task_id IS NULL),
			(SELECT COUNT(*)::bigint FROM tasks t WHERE t.project_id = p.id AND t.parent_task_id IS NULL AND t.official_progress_state = 'completed'),
			(SELECT COUNT(*)::bigint FROM tasks t WHERE t.project_id = p.id AND t.parent_task_id IS NULL AND t.official_progress_state = 'in_progress'),
			(SELECT COUNT(*)::bigint FROM tasks t WHERE t.project_id = p.id AND t.parent_task_id IS NULL AND t.official_progress_state = 'needs_changes'),
			(SELECT COUNT(*)::bigint FROM project_milestones m WHERE m.project_id = p.id),
			(
				SELECT COUNT(*)::bigint
				FROM project_milestones m
				WHERE m.project_id = p.id
				  AND EXISTS (SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.milestone_id = m.id AND t.parent_task_id IS NULL)
				  AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.milestone_id = m.id AND t.parent_task_id IS NULL AND t.official_progress_state <> 'completed')
			),
			(SELECT COUNT(*)::bigint FROM tasks t WHERE t.project_id = p.id AND p.status = 'active' AND t.parent_task_id IS NULL AND t.deadline < current_date AND t.status <> 'done' AND t.official_progress_state <> 'completed'),
			(SELECT COUNT(*)::bigint FROM progress_updates pu WHERE pu.project_id = p.id AND p.status <> 'archived' AND pu.review_status = 'pending_review'),
			(SELECT MAX(pr.reviewed_at) FROM progress_reviews pr JOIN progress_updates pu ON pu.id = pr.progress_update_id WHERE pu.project_id = p.id AND pr.review_status = 'approved'),
			p.created_at,
			p.updated_at
		FROM projects p
		JOIN users u ON u.id = p.supervisor_id
		LEFT JOIN course_section_projects csp ON csp.project_id = p.id
		LEFT JOIN course_sections cs ON cs.id = csp.course_section_id
		` + where + `
		` + suffix + `
	`
}

func scanProject(row pgx.Row) (ProjectDTO, error) {
	var project ProjectDTO
	var description, topic, classID, classTitle, classColor, startDate, endDate, progressSummary sql.NullString
	var lastApproved sql.NullTime
	err := row.Scan(
		&project.ID,
		&project.Name,
		&description,
		&topic,
		&classID,
		&classTitle,
		&classColor,
		&project.SupervisorID,
		&project.SupervisorName,
		&startDate,
		&endDate,
		&project.Status,
		&project.OfficialProgressState,
		&progressSummary,
		&project.MemberCount,
		&project.TaskCount,
		&project.CompletedTaskCount,
		&project.InProgressTaskCount,
		&project.NeedsChangesTaskCount,
		&project.MilestoneCount,
		&project.CompletedMilestoneCount,
		&project.OverdueTaskCount,
		&project.PendingReviewCount,
		&lastApproved,
		&project.CreatedAt,
		&project.UpdatedAt,
	)
	project.Description = nullString(description)
	project.Topic = nullString(topic)
	project.ClassID = nullString(classID)
	project.ClassTitle = nullString(classTitle)
	project.ClassColor = nullString(classColor)
	project.StartDate = nullString(startDate)
	project.EndDate = nullString(endDate)
	project.ProgressSummary = nullString(progressSummary)
	project.LastApprovedUpdateAt = nullTime(lastApproved)
	applyProjectProgressRollup(&project)
	return project, err
}

func applyProjectProgressRollup(project *ProjectDTO) {
	if project.MilestoneCount > 0 {
		project.PlannedProgressPercent = project.CompletedMilestoneCount * 100 / project.MilestoneCount
	} else if project.TaskCount > 0 {
		project.PlannedProgressPercent = project.CompletedTaskCount * 100 / project.TaskCount
	}
	if project.TaskCount == 0 {
		project.OfficialProgressState = "no_progress"
		return
	}
	if project.NeedsChangesTaskCount > 0 {
		project.OfficialProgressState = "needs_changes"
		return
	}
	if project.CompletedTaskCount == project.TaskCount {
		project.OfficialProgressState = "completed"
		return
	}
	if project.InProgressTaskCount > 0 || project.CompletedTaskCount > 0 {
		project.OfficialProgressState = "in_progress"
		return
	}
	project.OfficialProgressState = "no_progress"
}

func (s *Server) ensureSupervisor(ctx context.Context, supervisorID string) error {
	var role, status string
	if err := s.db.QueryRow(ctx, `SELECT role, status FROM users WHERE id = $1`, supervisorID).Scan(&role, &status); err != nil {
		return err
	}
	if status != "active" || (role != RoleTeacher && role != RoleAdmin) {
		return errors.New("invalid supervisor")
	}
	return nil
}

func validEmailAddress(email string) bool {
	if email == "" || strings.ContainsAny(email, " \t\r\n") {
		return false
	}
	address, err := mail.ParseAddress(email)
	return err == nil && address.Address == email
}

func parseDate(value string) (*time.Time, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil, nil
	}
	parsed, err := time.Parse("2006-01-02", trimmed)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

const (
	projectStatusActive    = "active"
	projectStatusOnHold    = "on_hold"
	projectStatusCompleted = "completed"
	projectStatusArchived  = "archived"
)

func validProjectStatus(status string) bool {
	switch status {
	case projectStatusActive, projectStatusOnHold, projectStatusCompleted, projectStatusArchived:
		return true
	default:
		return false
	}
}

func projectUpdateOnlyStatus(input updateProjectRequest) bool {
	return input.Status != nil && input.Name == nil && input.Description == nil && input.Topic == nil && input.ClassID == nil && input.StartDate == nil && input.EndDate == nil && input.ProgressSummary == nil
}

func (s *Server) requireProjectLifecycle(w http.ResponseWriter, ctx context.Context, projectID string, action string, accepts func(string) bool) bool {
	status, err := s.getProjectStatus(ctx, projectID)
	if isNoRows(err) {
		writeError(w, http.StatusNotFound, "project not found")
		return false
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not verify project lifecycle")
		return false
	}
	if !accepts(status) {
		writeError(w, http.StatusConflict, projectLifecycleMessage(status, action))
		return false
	}
	return true
}

func (s *Server) getProjectStatus(ctx context.Context, projectID string) (string, error) {
	var status string
	err := s.db.QueryRow(ctx, `SELECT status FROM projects WHERE id = $1`, projectID).Scan(&status)
	return status, err
}

func projectAcceptsMetadataChanges(status string) bool {
	return status != projectStatusArchived
}

func projectAcceptsPlanChanges(status string) bool {
	return status == projectStatusActive || status == projectStatusOnHold
}

func projectAcceptsNewAssignments(status string) bool {
	return status == projectStatusActive
}

func projectAcceptsStudentSubmissions(status string) bool {
	return status == projectStatusActive
}

func projectAcceptsReviews(status string) bool {
	return status != projectStatusArchived
}

func projectAcceptsTeamChanges(status string) bool {
	return status == projectStatusActive || status == projectStatusOnHold
}

func projectAcceptsSupportChanges(status string) bool {
	return status == projectStatusActive || status == projectStatusOnHold
}

func projectLifecycleMessage(status string, action string) string {
	switch status {
	case projectStatusArchived:
		return "archived projects are read-only; reactivate the project before " + action
	case projectStatusCompleted:
		return "completed projects are closed; reopen the project before " + action
	case projectStatusOnHold:
		return "projects on hold must be reactivated before " + action
	default:
		return "project lifecycle state does not allow " + action
	}
}
