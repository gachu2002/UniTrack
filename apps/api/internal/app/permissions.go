package app

import (
	"context"

	"github.com/jackc/pgx/v5"
)

func (s *Server) canViewProject(ctx context.Context, user User, projectID string) (bool, error) {
	if user.Role == RoleAdmin {
		return s.projectExists(ctx, projectID)
	}

	var allowed bool
	if user.Role == RoleTeacher {
		err := s.db.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM projects WHERE id = $1 AND supervisor_id = $2
			)
		`, projectID, user.ID).Scan(&allowed)
		return allowed, err
	}

	if user.Role == RoleStudent {
		err := s.db.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM project_members WHERE project_id = $1 AND student_id = $2
			)
		`, projectID, user.ID).Scan(&allowed)
		return allowed, err
	}

	return false, nil
}

func (s *Server) canManageProject(ctx context.Context, user User, projectID string) (bool, error) {
	if user.Role == RoleAdmin {
		return s.projectExists(ctx, projectID)
	}
	if user.Role != RoleTeacher {
		return false, nil
	}

	var allowed bool
	err := s.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM projects WHERE id = $1 AND supervisor_id = $2
		)
	`, projectID, user.ID).Scan(&allowed)
	return allowed, err
}

func canViewProjectTx(ctx context.Context, tx pgx.Tx, user User, projectID string) (bool, error) {
	var role, status string
	var projectExists, isSupervisor, isMember bool
	err := tx.QueryRow(ctx, `
		SELECT
			u.role,
			u.status,
			EXISTS (SELECT 1 FROM projects p WHERE p.id = $2),
			EXISTS (SELECT 1 FROM projects p WHERE p.id = $2 AND p.supervisor_id = u.id),
			EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = $2 AND pm.student_id = u.id)
		FROM users u
		WHERE u.id = $1
		FOR UPDATE
	`, user.ID, projectID).Scan(&role, &status, &projectExists, &isSupervisor, &isMember)
	if err != nil {
		if isNoRows(err) {
			return false, nil
		}
		return false, err
	}
	if status != "active" || !projectExists {
		return false, nil
	}
	switch role {
	case RoleAdmin:
		return true, nil
	case RoleTeacher:
		return isSupervisor, nil
	case RoleStudent:
		return isMember, nil
	default:
		return false, nil
	}
}

func canManageProjectTx(ctx context.Context, tx pgx.Tx, user User, projectID string) (bool, error) {
	var role, status, supervisorID string
	err := tx.QueryRow(ctx, `
		SELECT u.role, u.status, p.supervisor_id::text
		FROM users u
		JOIN projects p ON p.id = $2
		WHERE u.id = $1
		FOR UPDATE OF u
	`, user.ID, projectID).Scan(&role, &status, &supervisorID)
	if err != nil {
		if isNoRows(err) {
			return false, nil
		}
		return false, err
	}
	if status != "active" {
		return false, nil
	}
	if role == RoleAdmin {
		return true, nil
	}
	return role == RoleTeacher && supervisorID == user.ID, nil
}

func (s *Server) projectExists(ctx context.Context, projectID string) (bool, error) {
	var exists bool
	err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1)`, projectID).Scan(&exists)
	return exists, err
}

func canCreateProject(user User) bool {
	return user.Role == RoleAdmin || user.Role == RoleTeacher
}
