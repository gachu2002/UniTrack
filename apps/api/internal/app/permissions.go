package app

import "context"

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

func (s *Server) projectExists(ctx context.Context, projectID string) (bool, error) {
	var exists bool
	err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1)`, projectID).Scan(&exists)
	return exists, err
}

func canCreateProject(user User) bool {
	return user.Role == RoleAdmin || user.Role == RoleTeacher
}
