package app

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"time"
)

func (s *Server) handleStudentWork(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	if teacherID := r.URL.Query().Get("teacherId"); teacherID != "" {
		s.handleTeacherWork(w, r, user, teacherID)
		return
	}
	target, err := s.studentWorkTarget(r.Context(), user, r.URL.Query().Get("studentId"))
	if err != nil {
		writeStatusError(w, err, http.StatusInternalServerError, "could not load student work")
		return
	}

	activeTasks, err := s.listStudentWorkTasks(r.Context(), user, target.ID, true)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load active assignments")
		return
	}
	historyTasks, err := s.listStudentWorkTasks(r.Context(), user, target.ID, false)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load assignment history")
		return
	}
	updates, err := s.listStudentWorkUpdates(r.Context(), user, target.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load submission history")
		return
	}
	currentProjects, err := s.listStudentCurrentProjects(r.Context(), user, target.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load current projects")
		return
	}
	if activeTasks == nil {
		activeTasks = []TaskDTO{}
	}
	if historyTasks == nil {
		historyTasks = []TaskDTO{}
	}
	if updates == nil {
		updates = []ProgressUpdateDTO{}
	}
	if currentProjects == nil {
		currentProjects = []ProjectDTO{}
	}
	writeJSON(w, http.StatusOK, StudentWorkDTO{Student: target, ActiveTasks: activeTasks, HistoryTasks: historyTasks, ProgressUpdates: updates, CurrentProjects: currentProjects})
}

func (s *Server) handleTeacherWork(w http.ResponseWriter, r *http.Request, user User, teacherID string) {
	target, err := s.teacherWorkTarget(r.Context(), user, teacherID)
	if err != nil {
		writeStatusError(w, err, http.StatusInternalServerError, "could not load supervisor")
		return
	}
	where := "WHERE p.supervisor_id = $1"
	args := []any{target.ID}
	if user.Role == RoleStudent {
		where += " AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.student_id = $2)"
		args = append(args, user.ID)
	}
	rows, err := s.db.Query(r.Context(), projectSelectSQL(where, "ORDER BY p.updated_at DESC"), args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load supervisor projects")
		return
	}
	defer rows.Close()
	projects := []ProjectDTO{}
	for rows.Next() {
		project, err := scanProject(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load supervisor projects")
			return
		}
		projects = append(projects, project)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "could not load supervisor projects")
		return
	}
	writeJSON(w, http.StatusOK, TeacherWorkDTO{Teacher: target, Projects: projects})
}

func (s *Server) teacherWorkTarget(ctx context.Context, user User, rawTeacherID string) (UserDTO, error) {
	if !validUUIDParam(rawTeacherID) {
		return UserDTO{}, badRequestError("a valid teacher id is required")
	}
	var target User
	err := s.db.QueryRow(ctx, `
		SELECT id::text, full_name, email, password_hash, role, status, avatar_url, created_at, updated_at
		FROM users WHERE id = $1 AND role IN ('teacher', 'admin')
	`, rawTeacherID).Scan(&target.ID, &target.FullName, &target.Email, &target.PasswordHash, &target.Role, &target.Status, &target.AvatarURL, &target.CreatedAt, &target.UpdatedAt)
	if err != nil {
		if isNoRows(err) {
			return UserDTO{}, statusError{status: http.StatusNotFound, message: "supervisor not found"}
		}
		return UserDTO{}, err
	}
	if user.Role == RoleAdmin || (user.Role == RoleTeacher && user.ID == target.ID) {
		return userDTO(target), nil
	}
	if user.Role != RoleStudent {
		return UserDTO{}, statusError{status: http.StatusForbidden, message: "supervisor is restricted"}
	}
	var allowed bool
	err = s.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM project_members pm
			JOIN projects p ON p.id = pm.project_id
			WHERE pm.student_id = $1 AND p.supervisor_id = $2
		)
	`, user.ID, target.ID).Scan(&allowed)
	if err != nil {
		return UserDTO{}, err
	}
	if !allowed {
		return UserDTO{}, statusError{status: http.StatusForbidden, message: "supervisor is not assigned to one of your projects"}
	}
	return userDTO(target), nil
}

func (s *Server) studentWorkTarget(ctx context.Context, user User, rawStudentID string) (UserDTO, error) {
	if user.Role == RoleStudent {
		return userDTO(user), nil
	}
	if !validUUIDParam(rawStudentID) {
		return UserDTO{}, badRequestError("a valid student id is required")
	}

	var target User
	err := s.db.QueryRow(ctx, `
		SELECT id::text, full_name, email, password_hash, role, status, avatar_url, created_at, updated_at
		FROM users WHERE id = $1 AND role = 'student'
	`, rawStudentID).Scan(&target.ID, &target.FullName, &target.Email, &target.PasswordHash, &target.Role, &target.Status, &target.AvatarURL, &target.CreatedAt, &target.UpdatedAt)
	if err != nil {
		if isNoRows(err) {
			return UserDTO{}, statusError{status: http.StatusNotFound, message: "student not found"}
		}
		return UserDTO{}, err
	}
	if user.Role == RoleAdmin {
		return userDTO(target), nil
	}

	var allowed bool
	err = s.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM project_members pm
			JOIN projects p ON p.id = pm.project_id
			WHERE pm.student_id = $1 AND p.supervisor_id = $2
		)
	`, target.ID, user.ID).Scan(&allowed)
	if err != nil {
		return UserDTO{}, err
	}
	if !allowed {
		return UserDTO{}, statusError{status: http.StatusForbidden, message: "student is not in one of your supervised projects"}
	}
	return userDTO(target), nil
}

func (s *Server) listStudentWorkTasks(ctx context.Context, user User, studentID string, activeOnly bool) ([]TaskDTO, error) {
	where := `WHERE t.parent_task_id IS NULL AND EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.project_id = t.project_id AND ta.student_id = $1)`
	args := []any{studentID}
	if activeOnly {
		where += ` AND p.status = 'active'`
	}
	if user.Role == RoleTeacher {
		args = append(args, user.ID)
		where += ` AND p.supervisor_id = $2`
	}
	rows, err := s.db.Query(ctx, taskSelectSQL(where, `ORDER BY t.deadline ASC NULLS LAST, t.updated_at DESC`), args...)
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

func (s *Server) listStudentCurrentProjects(ctx context.Context, user User, studentID string) ([]ProjectDTO, error) {
	where := `WHERE p.status = 'active' AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.student_id = $1)`
	args := []any{studentID}
	if user.Role == RoleTeacher {
		where += ` AND p.supervisor_id = $2`
		args = append(args, user.ID)
	}
	rows, err := s.db.Query(ctx, projectSelectSQL(where, `ORDER BY p.end_date ASC NULLS LAST, p.updated_at DESC`), args...)
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

func (s *Server) listStudentWorkUpdates(ctx context.Context, user User, studentID string) ([]ProgressUpdateDTO, error) {
	where := `WHERE t.parent_task_id IS NULL AND pu.submitted_by = $1`
	args := []any{studentID}
	if user.Role == RoleTeacher {
		args = append(args, user.ID)
		where += ` AND p.supervisor_id = $2`
	}
	rows, err := s.db.Query(ctx, `
		SELECT pu.id::text, pu.project_id::text, p.name, p.supervisor_id::text, supervisor.full_name, pu.task_id::text, t.title, pu.submitted_by::text, u.full_name,
			   pu.title, pu.description, pu.blockers, pu.review_status, pu.created_at, pu.updated_at
		FROM progress_updates pu
		JOIN projects p ON p.id = pu.project_id
		JOIN tasks t ON t.id = pu.task_id AND t.project_id = pu.project_id
		JOIN users u ON u.id = pu.submitted_by
		JOIN users supervisor ON supervisor.id = p.supervisor_id
		`+where+`
		ORDER BY pu.created_at DESC
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	updates := []ProgressUpdateDTO{}
	for rows.Next() {
		var update ProgressUpdateDTO
		var title, blockers sql.NullString
		err := rows.Scan(
			&update.ID, &update.ProjectID, &update.ProjectName, &update.SupervisorID, &update.SupervisorName,
			&update.TaskID, &update.TaskTitle, &update.SubmittedBy, &update.SubmittedByName,
			&title, &update.Description, &blockers, &update.ReviewStatus, &update.CreatedAt, &update.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		update.Title = nullString(title)
		update.Blockers = nullString(blockers)
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

func (s *Server) handleGlobalSearch(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	result := GlobalSearchDTO{Students: []UserDTO{}, Projects: []SearchResultDTO{}, Folders: []SearchResultDTO{}}
	if len(query) < 2 {
		writeJSON(w, http.StatusOK, result)
		return
	}

	if user.Role != RoleStudent {
		students, err := s.searchAccessibleStudents(r.Context(), user, query)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not search students")
			return
		}
		result.Students = students
	}
	projects, _, err := s.listProjectsFiltered(r.Context(), user, 6, 0, false, query, false, "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not search projects")
		return
	}
	for _, project := range projects {
		result.Projects = append(result.Projects, SearchResultDTO{ID: project.ID, Label: project.Name, Detail: stringValue(project.ClassTitle)})
	}
	if user.Role != RoleStudent {
		folders, _, err := s.listCourseSectionsFiltered(r.Context(), user, 6, 0, "", query)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not search folders")
			return
		}
		for _, folder := range folders {
			result.Folders = append(result.Folders, SearchResultDTO{ID: folder.ID, Label: folder.Title, Detail: folder.OwnerTeacherName})
		}
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) searchAccessibleStudents(ctx context.Context, user User, query string) ([]UserDTO, error) {
	where := `u.role = 'student' AND u.status = 'active' AND (u.full_name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')`
	args := []any{query}
	if user.Role == RoleTeacher {
		where += ` AND EXISTS (SELECT 1 FROM project_members pm JOIN projects p ON p.id = pm.project_id WHERE pm.student_id = u.id AND p.supervisor_id = $2)`
		args = append(args, user.ID)
	}
	rows, err := s.db.Query(ctx, `
		SELECT u.id::text, u.full_name, u.email, u.role, u.status, u.avatar_url, u.created_at, u.updated_at
		FROM users u WHERE `+where+` ORDER BY u.full_name ASC LIMIT 6
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	students := []UserDTO{}
	for rows.Next() {
		var student UserDTO
		var avatarURL sql.NullString
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&student.ID, &student.FullName, &student.Email, &student.Role, &student.Status, &avatarURL, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		student.AvatarURL = nullString(avatarURL)
		student.CreatedAt = &createdAt
		student.UpdatedAt = &updatedAt
		students = append(students, student)
	}
	return students, rows.Err()
}
