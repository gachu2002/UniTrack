package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

type contextKey string

const userContextKey contextKey = "user"

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Keep missing-account login attempts on the same bcrypt path as existing
// accounts so invalid credentials are harder to distinguish by timing.
const dummyPasswordHash = "$2a$10$J6QLh3IRgxGEWTI/Cbe9se2m2EOrIiVVz/2yFjT0PmDs1zXvnyAl."

func hashPassword(password string) (string, error) {
	value := strings.TrimSpace(password)
	if value != password {
		return "", errors.New("password cannot start or end with spaces")
	}
	if len(value) < 8 {
		return "", errors.New("password must be at least 8 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(value), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func verifyPassword(hash string, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}

	var input loginRequest
	if !decodeJSON(w, r, &input) {
		return
	}

	email := strings.ToLower(strings.TrimSpace(input.Email))
	if !s.enforceRateLimit(w, "login:network:"+requestIP(r), 60, 10*time.Minute, "too many login attempts; try again later") {
		return
	}
	if email != "" && !s.enforceRateLimit(w, "login:email:"+email, 25, 10*time.Minute, "too many login attempts; try again later") {
		return
	}
	if email == "" || strings.TrimSpace(input.Password) == "" {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not verify credentials")
		return
	}
	defer func() { _ = tx.Rollback(r.Context()) }()

	user, err := findUserByEmailTx(r.Context(), tx, email)
	if isNoRows(err) {
		_ = verifyPassword(dummyPasswordHash, input.Password)
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not verify credentials")
		return
	}
	if !verifyPassword(user.PasswordHash, input.Password) {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if user.Status != "active" {
		writeError(w, http.StatusForbidden, "account is inactive; contact your teacher or administrator")
		return
	}

	token, expiresAt, err := s.createSessionTx(r.Context(), tx, r, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create session")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create session")
		return
	}

	s.setSessionCookie(w, token, expiresAt)

	writeJSON(w, http.StatusOK, userDTO(user))
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	writeJSON(w, http.StatusOK, userDTO(user))
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}

	if cookie, err := r.Cookie(s.cfg.SessionCookieName); err == nil && cookie.Value != "" {
		_, _ = s.db.Exec(r.Context(), `UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, hashToken(cookie.Value))
	}

	http.SetCookie(w, &http.Cookie{
		Name:     s.cfg.SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.cfg.SessionSecure,
		SameSite: sessionSameSiteMode(s.cfg.SessionSameSite),
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.requireDB(w) {
			return
		}

		cookie, err := r.Cookie(s.cfg.SessionCookieName)
		if err != nil || cookie.Value == "" {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}

		user, err := s.findUserBySessionToken(r.Context(), cookie.Value)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		_, _ = s.db.Exec(r.Context(), `UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, hashToken(cookie.Value))

		ctx := context.WithValue(r.Context(), userContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func currentUser(r *http.Request) (User, bool) {
	user, ok := r.Context().Value(userContextKey).(User)
	return user, ok
}

func (s *Server) findUserByEmail(ctx context.Context, email string) (User, error) {
	var user User
	var avatar sql.NullString
	err := s.db.QueryRow(ctx, `
		SELECT id::text, full_name, email, password_hash, role, status, avatar_url, created_at, updated_at
		FROM users
		WHERE email = $1
	`, email).Scan(
		&user.ID,
		&user.FullName,
		&user.Email,
		&user.PasswordHash,
		&user.Role,
		&user.Status,
		&avatar,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	user.AvatarURL = nullString(avatar)
	return user, err
}

func findUserByEmailTx(ctx context.Context, tx pgx.Tx, email string) (User, error) {
	var user User
	var avatar sql.NullString
	err := tx.QueryRow(ctx, `
		SELECT id::text, full_name, email, password_hash, role, status, avatar_url, created_at, updated_at
		FROM users
		WHERE email = $1
		FOR UPDATE
	`, email).Scan(
		&user.ID,
		&user.FullName,
		&user.Email,
		&user.PasswordHash,
		&user.Role,
		&user.Status,
		&avatar,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	user.AvatarURL = nullString(avatar)
	return user, err
}

func (s *Server) findUserByID(ctx context.Context, userID string) (User, error) {
	var user User
	var avatar sql.NullString
	err := s.db.QueryRow(ctx, `
		SELECT id::text, full_name, email, password_hash, role, status, avatar_url, created_at, updated_at
		FROM users
		WHERE id = $1
	`, userID).Scan(
		&user.ID,
		&user.FullName,
		&user.Email,
		&user.PasswordHash,
		&user.Role,
		&user.Status,
		&avatar,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	user.AvatarURL = nullString(avatar)
	return user, err
}

func (s *Server) findUserBySessionToken(ctx context.Context, token string) (User, error) {
	var user User
	var avatar sql.NullString
	err := s.db.QueryRow(ctx, `
		SELECT u.id::text, u.full_name, u.email, u.password_hash, u.role, u.status, u.avatar_url, u.created_at, u.updated_at
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = $1
		  AND s.expires_at > now()
		  AND s.revoked_at IS NULL
		  AND u.status = 'active'
	`, hashToken(token)).Scan(
		&user.ID,
		&user.FullName,
		&user.Email,
		&user.PasswordHash,
		&user.Role,
		&user.Status,
		&avatar,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	user.AvatarURL = nullString(avatar)
	return user, err
}

func (s *Server) createSessionTx(ctx context.Context, tx pgx.Tx, r *http.Request, userID string) (string, time.Time, error) {
	token, err := generateToken()
	if err != nil {
		return "", time.Time{}, err
	}
	expiresAt := time.Now().Add(s.cfg.SessionTTL)
	_, err = tx.Exec(ctx, `
		INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address)
		VALUES ($1, $2, $3, $4, $5)
	`, userID, hashToken(token), expiresAt, r.UserAgent(), requestIP(r))
	if err != nil {
		return "", time.Time{}, err
	}
	return token, expiresAt, nil
}

func (s *Server) setSessionCookie(w http.ResponseWriter, token string, expiresAt time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cfg.SessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		MaxAge:   int(s.cfg.SessionTTL.Seconds()),
		HttpOnly: true,
		Secure:   s.cfg.SessionSecure,
		SameSite: sessionSameSiteMode(s.cfg.SessionSameSite),
	})
}

func sessionSameSiteMode(value string) http.SameSite {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "strict":
		return http.SameSiteStrictMode
	case "none":
		return http.SameSiteNoneMode
	default:
		return http.SameSiteLaxMode
	}
}

func requestIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func generateToken() (string, error) {
	buffer := make([]byte, 32)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func hashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

func isNoRows(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}
