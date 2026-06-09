package app

import (
	"context"
	"database/sql"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type createCourseSectionRequest struct {
	Title          string `json:"title"`
	Color          string `json:"color"`
	Description    string `json:"description"`
	OwnerTeacherID string `json:"ownerTeacherId"`
	Status         string `json:"status"`
}

type updateCourseSectionRequest struct {
	Title       *string `json:"title"`
	Color       *string `json:"color"`
	Description *string `json:"description"`
	Status      *string `json:"status"`
}

type linkCourseSectionProjectRequest struct {
	ProjectID string `json:"projectId"`
}

func (s *Server) handleListCourseSections(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	if user.Role != RoleTeacher && user.Role != RoleAdmin {
		writeError(w, http.StatusForbidden, "only teachers and admins can view classes")
		return
	}

	items, err := s.listCourseSections(r.Context(), user)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load classes")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) handleCreateCourseSection(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	if user.Role != RoleTeacher && user.Role != RoleAdmin {
		writeError(w, http.StatusForbidden, "only teachers and admins can create classes")
		return
	}

	var input createCourseSectionRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	title := strings.TrimSpace(input.Title)
	if title == "" {
		writeError(w, http.StatusBadRequest, "class title is required")
		return
	}
	status := strings.TrimSpace(input.Status)
	if status == "" {
		status = "active"
	}
	if !validCourseSectionStatus(status) {
		writeError(w, http.StatusBadRequest, "invalid class status")
		return
	}
	color := strings.TrimSpace(input.Color)
	if color == "" {
		color = "blue"
	}
	if !validClassColor(color) {
		writeError(w, http.StatusBadRequest, "invalid class color")
		return
	}

	ownerTeacherID := user.ID
	if user.Role == RoleAdmin && strings.TrimSpace(input.OwnerTeacherID) != "" {
		ownerTeacherID = strings.TrimSpace(input.OwnerTeacherID)
	}
	if err := s.ensureSupervisor(r.Context(), ownerTeacherID); err != nil {
		writeError(w, http.StatusBadRequest, "owner must be an active teacher or admin")
		return
	}

	var classID string
	err := s.db.QueryRow(r.Context(), `
		INSERT INTO course_sections (title, color, description, owner_teacher_id, status, created_by)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id::text
	`, title, color, optionalString(input.Description), ownerTeacherID, status, user.ID).Scan(&classID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create class")
		return
	}

	item, err := s.getCourseSectionByID(r.Context(), classID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load class")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

func (s *Server) handleGetCourseSection(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	classID := chi.URLParam(r, "classId")
	allowed, err := s.canManageCourseSection(r.Context(), user, classID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid class id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this class")
		return
	}

	item, err := s.getCourseSectionByID(r.Context(), classID)
	if isNoRows(err) {
		writeError(w, http.StatusNotFound, "class not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load class")
		return
	}
	projects, err := s.listCourseSectionProjects(r.Context(), user, classID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load class projects")
		return
	}
	writeJSON(w, http.StatusOK, CourseSectionDetailDTO{ClassFolder: item, Projects: projects})
}

func (s *Server) handleUpdateCourseSection(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	classID := chi.URLParam(r, "classId")
	allowed, err := s.canManageCourseSection(r.Context(), user, classID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid class id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this class")
		return
	}

	current, err := s.getCourseSectionByID(r.Context(), classID)
	if isNoRows(err) {
		writeError(w, http.StatusNotFound, "class not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load class")
		return
	}

	var input updateCourseSectionRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	title := current.Title
	if input.Title != nil {
		title = strings.TrimSpace(*input.Title)
	}
	if title == "" {
		writeError(w, http.StatusBadRequest, "class title is required")
		return
	}
	status := current.Status
	if input.Status != nil {
		status = strings.TrimSpace(*input.Status)
	}
	if !validCourseSectionStatus(status) {
		writeError(w, http.StatusBadRequest, "invalid class status")
		return
	}
	color := current.Color
	if input.Color != nil {
		color = strings.TrimSpace(*input.Color)
	}
	if color == "" {
		color = "blue"
	}
	if !validClassColor(color) {
		writeError(w, http.StatusBadRequest, "invalid class color")
		return
	}
	description := stringValue(current.Description)
	if input.Description != nil {
		description = strings.TrimSpace(*input.Description)
	}

	_, err = s.db.Exec(r.Context(), `
		UPDATE course_sections
		SET title = $1, color = $2, description = $3, status = $4
		WHERE id = $5
	`, title, color, optionalString(description), status, classID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update class")
		return
	}
	updated, err := s.getCourseSectionByID(r.Context(), classID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load class")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleLinkCourseSectionProject(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	classID := chi.URLParam(r, "classId")
	allowed, err := s.canManageCourseSection(r.Context(), user, classID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid class id")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you do not have access to this class")
		return
	}

	var input linkCourseSectionProjectRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	projectID := strings.TrimSpace(input.ProjectID)
	projectAllowed, err := s.canManageProject(r.Context(), user, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project id")
		return
	}
	if !projectAllowed {
		writeError(w, http.StatusForbidden, "you cannot link this project")
		return
	}
	if !s.requireProjectLifecycle(w, r.Context(), projectID, "moving the project between folders", projectAcceptsMetadataChanges) {
		return
	}
	classUsable, err := s.canUseCourseSectionForProject(r.Context(), user, classID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid class id")
		return
	}
	if !classUsable {
		writeError(w, http.StatusForbidden, "you do not have access to this active class")
		return
	}
	ownerMatches, err := s.classOwnerMatchesProjectSupervisor(r.Context(), classID, projectID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid project or class")
		return
	}
	if !ownerMatches {
		writeError(w, http.StatusBadRequest, "project supervisor must own the class")
		return
	}

	_, err = s.db.Exec(r.Context(), `
		INSERT INTO course_section_projects (course_section_id, project_id, added_by)
		VALUES ($1, $2, $3)
		ON CONFLICT (project_id) DO UPDATE
		SET course_section_id = EXCLUDED.course_section_id,
			added_by = EXCLUDED.added_by,
			added_at = now()
	`, classID, projectID, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not link project to class")
		return
	}

	detail, err := s.getCourseSectionByID(r.Context(), classID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load class")
		return
	}
	projects, err := s.listCourseSectionProjects(r.Context(), user, classID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load class projects")
		return
	}
	writeJSON(w, http.StatusOK, CourseSectionDetailDTO{ClassFolder: detail, Projects: projects})
}

func (s *Server) listCourseSections(ctx context.Context, user User) ([]CourseSectionDTO, error) {
	where := ""
	args := []any{}
	if user.Role == RoleTeacher {
		where = "WHERE cs.owner_teacher_id = $1"
		args = append(args, user.ID)
	} else if user.Role != RoleAdmin {
		return []CourseSectionDTO{}, nil
	}

	rows, err := s.db.Query(ctx, courseSectionSelectSQL(where, "ORDER BY cs.updated_at DESC"), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []CourseSectionDTO{}
	for rows.Next() {
		item, err := scanCourseSection(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Server) getCourseSectionByID(ctx context.Context, classID string) (CourseSectionDTO, error) {
	return scanCourseSection(s.db.QueryRow(ctx, courseSectionSelectSQL("WHERE cs.id = $1", ""), classID))
}

func (s *Server) listCourseSectionProjects(ctx context.Context, user User, classID string) ([]ProjectDTO, error) {
	where := "WHERE EXISTS (SELECT 1 FROM course_section_projects csp WHERE csp.project_id = p.id AND csp.course_section_id = $1)"
	args := []any{classID}
	if user.Role == RoleTeacher {
		where += " AND p.supervisor_id = $2"
		args = append(args, user.ID)
	} else if user.Role != RoleAdmin {
		return []ProjectDTO{}, nil
	}
	rows, err := s.db.Query(ctx, projectSelectSQL(where, "ORDER BY p.updated_at DESC"), args...)
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

func (s *Server) canManageCourseSection(ctx context.Context, user User, classID string) (bool, error) {
	if user.Role == RoleAdmin {
		var exists bool
		err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM course_sections WHERE id = $1)`, classID).Scan(&exists)
		return exists, err
	}
	if user.Role != RoleTeacher {
		return false, nil
	}
	var allowed bool
	err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM course_sections WHERE id = $1 AND owner_teacher_id = $2)`, classID, user.ID).Scan(&allowed)
	return allowed, err
}

func (s *Server) canUseCourseSectionForProject(ctx context.Context, user User, classID string) (bool, error) {
	var allowed bool
	if user.Role == RoleAdmin {
		err := s.db.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM course_sections cs
				WHERE cs.id = $1 AND cs.status = 'active'
			)
		`, classID).Scan(&allowed)
		return allowed, err
	}
	if user.Role != RoleTeacher {
		return false, nil
	}
	err := s.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM course_sections cs
			WHERE cs.id = $1 AND cs.owner_teacher_id = $2 AND cs.status = 'active'
		)
	`, classID, user.ID).Scan(&allowed)
	return allowed, err
}

func (s *Server) classOwnerMatchesSupervisor(ctx context.Context, classID string, supervisorID string) (bool, error) {
	var matches bool
	err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM course_sections WHERE id = $1 AND owner_teacher_id = $2)`, classID, supervisorID).Scan(&matches)
	return matches, err
}

func (s *Server) classOwnerMatchesProjectSupervisor(ctx context.Context, classID string, projectID string) (bool, error) {
	var matches bool
	err := s.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM course_sections cs
			JOIN projects p ON p.supervisor_id = cs.owner_teacher_id
			WHERE cs.id = $1 AND p.id = $2
		)
	`, classID, projectID).Scan(&matches)
	return matches, err
}

func courseSectionSelectSQL(where string, suffix string) string {
	return `
		SELECT
			cs.id::text,
			cs.title,
			cs.color,
			cs.description,
			cs.owner_teacher_id::text,
			u.full_name,
			cs.status,
			COUNT(DISTINCT csp.project_id)::bigint,
			COUNT(DISTINCT pu.id) FILTER (WHERE p.status <> 'archived' AND pu.review_status = 'pending_review')::bigint,
			COUNT(DISTINCT t.id) FILTER (WHERE p.status = 'active' AND t.parent_task_id IS NULL AND t.deadline < current_date AND t.status <> 'done' AND t.official_progress_state <> 'completed')::bigint,
			cs.created_at,
			cs.updated_at
		FROM course_sections cs
		JOIN users u ON u.id = cs.owner_teacher_id
		LEFT JOIN course_section_projects csp ON csp.course_section_id = cs.id
		LEFT JOIN projects p ON p.id = csp.project_id
		LEFT JOIN tasks t ON t.project_id = p.id
		LEFT JOIN progress_updates pu ON pu.project_id = p.id
		` + where + `
		GROUP BY cs.id, u.full_name
		` + suffix + `
	`
}

func scanCourseSection(row pgx.Row) (CourseSectionDTO, error) {
	var item CourseSectionDTO
	var description sql.NullString
	err := row.Scan(
		&item.ID,
		&item.Title,
		&item.Color,
		&description,
		&item.OwnerTeacherID,
		&item.OwnerTeacherName,
		&item.Status,
		&item.ProjectCount,
		&item.PendingReviewCount,
		&item.OverdueTaskCount,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	item.Description = nullString(description)
	return item, err
}

func validCourseSectionStatus(status string) bool {
	switch status {
	case "active", "archived":
		return true
	default:
		return false
	}
}

func validClassColor(color string) bool {
	switch color {
	case "blue", "teal", "amber", "rose", "violet", "slate":
		return true
	default:
		return false
	}
}
