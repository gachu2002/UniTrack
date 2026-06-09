package app

import (
	"context"
	"log/slog"
)

func (s *Server) Bootstrap(ctx context.Context) error {
	if s.db == nil || s.cfg.BootstrapAdminEmail == "" || s.cfg.BootstrapAdminPassword == "" {
		return nil
	}

	var exists bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE email = $1)`, s.cfg.BootstrapAdminEmail).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}

	passwordHash, err := hashPassword(s.cfg.BootstrapAdminPassword)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(ctx, `
		INSERT INTO users (full_name, email, password_hash, role, status)
		VALUES ('System Admin', $1, $2, 'admin', 'active')
	`, s.cfg.BootstrapAdminEmail, passwordHash)
	if err == nil {
		s.logger.Info("created bootstrap admin", slog.String("email", s.cfg.BootstrapAdminEmail))
	}
	return err
}
