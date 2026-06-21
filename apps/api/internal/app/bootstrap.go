package app

import (
	"context"
	"fmt"
	"log/slog"
)

func (s *Server) Bootstrap(ctx context.Context) error {
	if s.db == nil || s.cfg.BootstrapAdminEmail == "" || s.cfg.BootstrapAdminPassword == "" {
		return nil
	}

	passwordHash, err := hashPassword(s.cfg.BootstrapAdminPassword)
	if err != nil {
		return err
	}

	var createdID string
	err = s.db.QueryRow(ctx, `
		INSERT INTO users (full_name, email, password_hash, role, status)
		VALUES ('System Admin', $1, $2, 'admin', 'active')
		ON CONFLICT (email) DO NOTHING
		RETURNING id::text
	`, s.cfg.BootstrapAdminEmail, passwordHash).Scan(&createdID)
	if err == nil {
		s.logger.Info("created bootstrap admin", slog.String("email", s.cfg.BootstrapAdminEmail))
		return nil
	}
	if !isNoRows(err) && !isUniqueViolation(err, "users_email_lower_unique") {
		return err
	}

	var role, status string
	if err := s.db.QueryRow(ctx, `SELECT role, status FROM users WHERE lower(email) = lower($1)`, s.cfg.BootstrapAdminEmail).Scan(&role, &status); err != nil {
		return err
	}
	if role != RoleAdmin || status != "active" {
		return fmt.Errorf("bootstrap admin email %s already belongs to a non-active-admin account", s.cfg.BootstrapAdminEmail)
	}
	return nil
}
