package app

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
)

func (s *Server) Bootstrap(ctx context.Context) error {
	production := strings.EqualFold(strings.TrimSpace(s.cfg.AppEnv), "production")
	if s.db == nil {
		if production {
			return fmt.Errorf("production bootstrap requires a database connection")
		}
		return nil
	}
	if s.cfg.BootstrapAdminEmail == "" || s.cfg.BootstrapAdminPassword == "" {
		if production {
			return s.requireExistingActiveAdmin(ctx)
		}
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
		if s.logger != nil {
			s.logger.Info("created bootstrap admin", slog.String("email", s.cfg.BootstrapAdminEmail))
		}
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

func (s *Server) requireExistingActiveAdmin(ctx context.Context) error {
	var count int
	if err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'`).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		return fmt.Errorf("production startup requires AUTH_BOOTSTRAP_ADMIN_EMAIL and AUTH_BOOTSTRAP_ADMIN_PASSWORD or an existing active admin account")
	}
	return nil
}
