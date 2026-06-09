package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type createAdminUserRequest struct {
	FullName string `json:"fullName"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
	Status   string `json:"status"`
}

type updateAdminUserRequest struct {
	FullName *string `json:"fullName"`
	Role     *string `json:"role"`
	Status   *string `json:"status"`
}

type setAdminUserPasswordRequest struct {
	Password string `json:"password"`
}

func (s *Server) handleAdminListUsers(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	_ = user

	limit, err := parseListLimit(r.URL.Query().Get("limit"), 50, 200)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user list limit")
		return
	}
	search := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("search")))
	role := strings.TrimSpace(r.URL.Query().Get("role"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if role != "" && !validUserRole(role) {
		writeError(w, http.StatusBadRequest, "invalid user role")
		return
	}
	if status != "" && !validUserStatus(status) {
		writeError(w, http.StatusBadRequest, "invalid user status")
		return
	}

	rows, err := s.db.Query(r.Context(), `
		SELECT id::text, full_name, email, role, status, avatar_url, created_at, updated_at
		FROM users
		WHERE ($1 = '' OR lower(full_name) LIKE '%' || $1 || '%' OR lower(email) LIKE '%' || $1 || '%')
		  AND ($2 = '' OR role = $2)
		  AND ($3 = '' OR status = $3)
		ORDER BY created_at DESC
		LIMIT $4
	`, search, role, status, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load users")
		return
	}
	defer rows.Close()

	users := []UserDTO{}
	for rows.Next() {
		user, err := scanUserDTOFromRows(rows)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load users")
			return
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "could not load users")
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (s *Server) handleAdminCreateUser(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}

	var input createAdminUserRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	fullName := strings.TrimSpace(input.FullName)
	email := strings.ToLower(strings.TrimSpace(input.Email))
	role := strings.TrimSpace(input.Role)
	status := strings.TrimSpace(input.Status)
	if status == "" {
		status = "active"
	}
	if fullName == "" {
		writeError(w, http.StatusBadRequest, "full name is required")
		return
	}
	if !validEmailAddress(email) {
		writeError(w, http.StatusBadRequest, "valid email is required")
		return
	}
	if !validUserRole(role) {
		writeError(w, http.StatusBadRequest, "invalid user role")
		return
	}
	if !validUserStatus(status) {
		writeError(w, http.StatusBadRequest, "invalid user status")
		return
	}
	passwordHash, err := hashPassword(input.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create user")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	var created UserDTO
	var avatar sql.NullString
	var createdAt, updatedAt time.Time
	err = tx.QueryRow(r.Context(), `
		INSERT INTO users (full_name, email, password_hash, role, status)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id::text, full_name, email, role, status, avatar_url, created_at, updated_at
	`, fullName, email, passwordHash, role, status).Scan(&created.ID, &created.FullName, &created.Email, &created.Role, &created.Status, &avatar, &createdAt, &updatedAt)
	if err != nil {
		if isUniqueViolation(err, "users_email_key") || isUniqueViolation(err, "users_email_lower_unique") {
			writeError(w, http.StatusConflict, "a user with this email already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not create user")
		return
	}
	created.AvatarURL = nullString(avatar)
	created.CreatedAt = &createdAt
	created.UpdatedAt = &updatedAt

	if err := insertActivityLogTx(r.Context(), tx, actor.ID, "admin.user_created", "user", created.ID, map[string]any{"email": email, "role": role, "status": status}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not record account change")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create user")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleAdminUpdateUser(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	userID := chi.URLParam(r, "userId")

	var input updateAdminUserRequest
	if !decodeJSON(w, r, &input) {
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update user")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	target, err := findUserByIDTx(r.Context(), tx, userID)
	if isNoRows(err) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	nextFullName := target.FullName
	nextRole := target.Role
	nextStatus := target.Status
	if input.FullName != nil {
		nextFullName = strings.TrimSpace(*input.FullName)
		if nextFullName == "" {
			writeError(w, http.StatusBadRequest, "full name cannot be blank")
			return
		}
	}
	if input.Role != nil {
		nextRole = strings.TrimSpace(*input.Role)
		if !validUserRole(nextRole) {
			writeError(w, http.StatusBadRequest, "invalid user role")
			return
		}
	}
	if input.Status != nil {
		nextStatus = strings.TrimSpace(*input.Status)
		if !validUserStatus(nextStatus) {
			writeError(w, http.StatusBadRequest, "invalid user status")
			return
		}
	}
	if err := s.ensureAdminMutationSafe(r.Context(), tx, actor, target, nextRole, nextStatus); err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}

	var updated UserDTO
	var avatar sql.NullString
	var createdAt, updatedAt time.Time
	err = tx.QueryRow(r.Context(), `
		UPDATE users
		SET full_name = $1, role = $2, status = $3
		WHERE id = $4
		RETURNING id::text, full_name, email, role, status, avatar_url, created_at, updated_at
	`, nextFullName, nextRole, nextStatus, userID).Scan(&updated.ID, &updated.FullName, &updated.Email, &updated.Role, &updated.Status, &avatar, &createdAt, &updatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update user")
		return
	}
	updated.AvatarURL = nullString(avatar)
	updated.CreatedAt = &createdAt
	updated.UpdatedAt = &updatedAt

	if target.Status != "inactive" && nextStatus == "inactive" {
		if _, err := tx.Exec(r.Context(), `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, userID); err != nil {
			writeError(w, http.StatusInternalServerError, "could not revoke user sessions")
			return
		}
	}
	if err := insertActivityLogTx(r.Context(), tx, actor.ID, "admin.user_updated", "user", userID, map[string]any{
		"from": map[string]string{"fullName": target.FullName, "role": target.Role, "status": target.Status},
		"to":   map[string]string{"fullName": nextFullName, "role": nextRole, "status": nextStatus},
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not record account change")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update user")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleAdminSetUserPassword(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	userID := chi.URLParam(r, "userId")
	var input setAdminUserPasswordRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	passwordHash, err := hashPassword(input.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not set password")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	var exists bool
	if err := tx.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM users WHERE id = $1)`, userID).Scan(&exists); err != nil {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	if !exists {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if _, err := tx.Exec(r.Context(), `UPDATE users SET password_hash = $1 WHERE id = $2`, passwordHash, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not set password")
		return
	}
	if err := insertActivityLogTx(r.Context(), tx, actor.ID, "admin.user_password_set", "user", userID, map[string]any{"passwordSet": true}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not record account change")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not set password")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "password_set"})
}

func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) (User, bool) {
	user, ok := currentUser(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return User{}, false
	}
	if user.Role != RoleAdmin {
		writeError(w, http.StatusForbidden, "admin access required")
		return User{}, false
	}
	return user, true
}

func (s *Server) ensureAdminMutationSafe(ctx context.Context, tx pgx.Tx, actor User, target User, nextRole string, nextStatus string) error {
	if target.ID == actor.ID && (nextRole != RoleAdmin || nextStatus != "active") {
		return errors.New("admin cannot remove their own active admin access")
	}
	if target.Role != RoleAdmin || target.Status != "active" || (nextRole == RoleAdmin && nextStatus == "active") {
		return nil
	}
	var activeAdminCount int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active' AND id <> $1`, target.ID).Scan(&activeAdminCount); err != nil {
		return err
	}
	if activeAdminCount == 0 {
		return errors.New("at least one active admin account is required")
	}
	return nil
}

func findUserByIDTx(ctx context.Context, tx pgx.Tx, userID string) (User, error) {
	var user User
	var avatar sql.NullString
	err := tx.QueryRow(ctx, `
		SELECT id::text, full_name, email, password_hash, role, status, avatar_url, created_at, updated_at
		FROM users
		WHERE id = $1
		FOR UPDATE
	`, userID).Scan(&user.ID, &user.FullName, &user.Email, &user.PasswordHash, &user.Role, &user.Status, &avatar, &user.CreatedAt, &user.UpdatedAt)
	user.AvatarURL = nullString(avatar)
	return user, err
}

func scanUserDTOFromRows(rows pgx.Rows) (UserDTO, error) {
	var user UserDTO
	var avatar sql.NullString
	var createdAt, updatedAt time.Time
	err := rows.Scan(&user.ID, &user.FullName, &user.Email, &user.Role, &user.Status, &avatar, &createdAt, &updatedAt)
	user.AvatarURL = nullString(avatar)
	user.CreatedAt = &createdAt
	user.UpdatedAt = &updatedAt
	return user, err
}

func insertActivityLogTx(ctx context.Context, tx pgx.Tx, actorID string, action string, entityType string, entityID string, metadata any) error {
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO activity_logs (actor_id, action, entity_type, entity_id, metadata)
		VALUES ($1, $2, $3, $4, $5::jsonb)
	`, actorID, action, entityType, entityID, string(metadataJSON))
	return err
}

func validUserRole(role string) bool {
	switch role {
	case RoleAdmin, RoleTeacher, RoleStudent:
		return true
	default:
		return false
	}
}

func validUserStatus(status string) bool {
	switch status {
	case "active", "inactive":
		return true
	default:
		return false
	}
}
