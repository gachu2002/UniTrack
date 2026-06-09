package app

import (
	"context"
	"net/http"
	"strconv"
)

func (s *Server) handleDashboard(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)

	stats, err := s.dashboardStats(r.Context(), user)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load dashboard")
		return
	}
	projects, err := s.dashboardProjects(r.Context(), user, 16)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load dashboard projects")
		return
	}
	tasks, err := s.dashboardTasks(r.Context(), user, 8)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load dashboard tasks")
		return
	}
	updates, err := s.dashboardProgressUpdates(r.Context(), user, 8)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load dashboard progress")
		return
	}
	if projects == nil {
		projects = []ProjectDTO{}
	}
	if tasks == nil {
		tasks = []TaskDTO{}
	}
	if updates == nil {
		updates = []ProgressUpdateDTO{}
	}

	writeJSON(w, http.StatusOK, DashboardDTO{
		Role:            user.Role,
		Stats:           stats,
		Projects:        projects,
		Tasks:           tasks,
		ProgressUpdates: updates,
	})
}

func (s *Server) dashboardProjects(ctx context.Context, user User, limit int) ([]ProjectDTO, error) {
	if user.Role == RoleStudent {
		return s.listProjects(ctx, user, limit)
	}

	where := ""
	args := []any{}
	if user.Role == RoleTeacher {
		args = append(args, user.ID)
		where = appendProjectWhere(where, "p.supervisor_id = $1")
	}
	args = append(args, limit)
	limitPlaceholder := "$" + strconv.Itoa(len(args))
	attentionOrder := `
		ORDER BY
			(SELECT COUNT(*) FROM progress_updates pu WHERE pu.project_id = p.id AND p.status <> 'archived' AND pu.review_status = 'pending_review') DESC,
			(SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND p.status = 'active' AND t.parent_task_id IS NULL AND t.deadline < current_date AND t.status <> 'done' AND t.official_progress_state <> 'completed') DESC,
			CASE
				WHEN p.status = 'active'
				 AND EXISTS (SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.parent_task_id IS NULL)
				 AND (
					(SELECT MAX(pr.reviewed_at) FROM progress_reviews pr JOIN progress_updates pu ON pu.id = pr.progress_update_id WHERE pu.project_id = p.id AND pr.review_status = 'approved') IS NULL
					OR (SELECT MAX(pr.reviewed_at) FROM progress_reviews pr JOIN progress_updates pu ON pu.id = pr.progress_update_id WHERE pu.project_id = p.id AND pr.review_status = 'approved') < now() - interval '7 days'
				 )
				THEN 1 ELSE 0
			END DESC,
			(SELECT MAX(pr.reviewed_at) FROM progress_reviews pr JOIN progress_updates pu ON pu.id = pr.progress_update_id WHERE pu.project_id = p.id AND pr.review_status = 'approved') ASC NULLS FIRST,
			p.updated_at DESC
		LIMIT ` + limitPlaceholder

	rows, err := s.db.Query(ctx, projectSelectSQL(where, attentionOrder), args...)
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

func (s *Server) dashboardStats(ctx context.Context, user User) (DashboardStats, error) {
	var stats DashboardStats
	var err error

	switch user.Role {
	case RoleAdmin:
		err = s.db.QueryRow(ctx, `
			SELECT
				(SELECT COUNT(*) FROM projects),
				(SELECT COUNT(*) FROM tasks WHERE parent_task_id IS NULL),
				(SELECT COUNT(*) FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.status = 'active' AND t.parent_task_id IS NULL AND t.deadline < current_date AND t.status <> 'done' AND t.official_progress_state <> 'completed'),
				(SELECT COUNT(*) FROM progress_updates pu JOIN projects p ON p.id = pu.project_id WHERE p.status <> 'archived' AND pu.review_status = 'pending_review'),
				(SELECT COUNT(*) FROM users WHERE role = 'student'),
				(SELECT COUNT(*) FROM users WHERE role = 'teacher')
		`).Scan(&stats.ProjectCount, &stats.TaskCount, &stats.OverdueTaskCount, &stats.PendingReviews, &stats.StudentCount, &stats.TeacherCount)
	case RoleTeacher:
		err = s.db.QueryRow(ctx, `
			SELECT
				(SELECT COUNT(*) FROM projects WHERE supervisor_id = $1),
				(SELECT COUNT(*) FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.supervisor_id = $1 AND t.parent_task_id IS NULL),
				(SELECT COUNT(*) FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.supervisor_id = $1 AND p.status = 'active' AND t.parent_task_id IS NULL AND t.deadline < current_date AND t.status <> 'done' AND t.official_progress_state <> 'completed'),
				(SELECT COUNT(*) FROM progress_updates pu JOIN projects p ON p.id = pu.project_id WHERE p.supervisor_id = $1 AND p.status <> 'archived' AND pu.review_status = 'pending_review'),
				(SELECT COUNT(DISTINCT pm.student_id) FROM project_members pm JOIN projects p ON p.id = pm.project_id WHERE p.supervisor_id = $1)
		`, user.ID).Scan(&stats.ProjectCount, &stats.TaskCount, &stats.OverdueTaskCount, &stats.PendingReviews, &stats.StudentCount)
	case RoleStudent:
		err = s.db.QueryRow(ctx, `
			SELECT
				(SELECT COUNT(*) FROM project_members WHERE student_id = $1),
				(SELECT COUNT(*) FROM task_assignees ta JOIN tasks t ON t.id = ta.task_id WHERE ta.student_id = $1 AND t.parent_task_id IS NULL),
				(SELECT COUNT(*) FROM task_assignees ta JOIN tasks t ON t.id = ta.task_id JOIN projects p ON p.id = t.project_id WHERE ta.student_id = $1 AND p.status = 'active' AND t.parent_task_id IS NULL AND t.deadline < current_date AND t.status <> 'done' AND t.official_progress_state <> 'completed'),
				(SELECT COUNT(*) FROM progress_updates WHERE submitted_by = $1 AND review_status = 'pending_review')
		`, user.ID).Scan(&stats.ProjectCount, &stats.TaskCount, &stats.OverdueTaskCount, &stats.PendingReviews)
	}

	return stats, err
}

func (s *Server) dashboardTasks(ctx context.Context, user User, limit int) ([]TaskDTO, error) {
	where := `WHERE t.parent_task_id IS NULL
		AND EXISTS (SELECT 1 FROM projects p WHERE p.id = t.project_id AND p.status = 'active')
		AND t.deadline IS NOT NULL
		AND t.deadline < current_date
		AND t.status <> 'done'
		AND t.official_progress_state <> 'completed'`
	args := []any{limit}
	orderBy := `ORDER BY t.deadline ASC, t.updated_at DESC`

	switch user.Role {
	case RoleTeacher:
		where = `WHERE t.parent_task_id IS NULL
			AND EXISTS (SELECT 1 FROM projects p WHERE p.id = t.project_id AND p.supervisor_id = $1 AND p.status = 'active')
			AND t.deadline IS NOT NULL
			AND t.deadline < current_date
			AND t.status <> 'done'
			AND t.official_progress_state <> 'completed'`
		args = []any{user.ID, limit}
	case RoleStudent:
		where = `WHERE t.parent_task_id IS NULL
			AND EXISTS (SELECT 1 FROM projects p WHERE p.id = t.project_id AND p.status = 'active')
			AND EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.student_id = $1)
			AND t.status <> 'done'
			AND t.official_progress_state <> 'completed'
			AND NOT EXISTS (SELECT 1 FROM progress_updates pu_waiting WHERE pu_waiting.task_id = t.id AND pu_waiting.review_status = 'pending_review')`
		args = []any{user.ID, limit}
		orderBy = `ORDER BY
			CASE WHEN t.official_progress_state = 'needs_changes' THEN 0 ELSE 1 END,
			CASE WHEN t.deadline IS NOT NULL AND t.deadline < current_date THEN 0 ELSE 1 END,
			t.deadline ASC NULLS LAST,
			t.updated_at DESC`
	}

	rows, err := s.db.Query(ctx, taskSelectSQL(where, orderBy+` LIMIT $`+strconv.Itoa(len(args))), args...)
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

func (s *Server) dashboardProgressUpdates(ctx context.Context, user User, limit int) ([]ProgressUpdateDTO, error) {
	where := `WHERE pu.review_status = 'pending_review' AND EXISTS (SELECT 1 FROM projects p WHERE p.id = pu.project_id AND p.status <> 'archived')`
	args := []any{limit}
	orderBy := `ORDER BY pu.created_at ASC`

	switch user.Role {
	case RoleTeacher:
		where = `WHERE pu.review_status = 'pending_review' AND EXISTS (SELECT 1 FROM projects p WHERE p.id = pu.project_id AND p.supervisor_id = $1 AND p.status <> 'archived')`
		args = []any{user.ID, limit}
	case RoleStudent:
		where = `WHERE pu.submitted_by = $1`
		args = []any{user.ID, limit}
		orderBy = `ORDER BY pu.created_at DESC`
	}

	rows, err := s.db.Query(ctx, `
		SELECT pu.id::text, pu.project_id::text, p.name, pu.task_id::text, t.title, pu.submitted_by::text, u.full_name,
		       pu.title, pu.description, pu.blockers, pu.review_status, pu.created_at, pu.updated_at
		FROM progress_updates pu
		JOIN projects p ON p.id = pu.project_id
		JOIN tasks t ON t.id = pu.task_id
		JOIN users u ON u.id = pu.submitted_by
		`+where+`
		`+orderBy+`
		LIMIT $`+strconv.Itoa(len(args))+`
	`, args...)
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
