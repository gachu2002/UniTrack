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

func hashPassword(password string) (string, error) {
	value := strings.TrimSpace(password)
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
	if !s.enforceRateLimit(w, "login:"+requestIP(r)+":"+email, 10, 10*time.Minute, "too many login attempts; try again later") {
		return
	}
	if email == "" || strings.TrimSpace(input.Password) == "" {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	user, err := s.findUserByEmail(r.Context(), email)
	if err != nil || !verifyPassword(user.PasswordHash, input.Password) {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if user.Status != "active" {
		writeError(w, http.StatusForbidden, "account is inactive; contact your teacher or administrator")
		return
	}

	if err := s.createSession(w, r, user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create session")
		return
	}

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
		SameSite: http.SameSiteLaxMode,
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

func (s *Server) createSession(w http.ResponseWriter, r *http.Request, userID string) error {
	token, err := generateToken()
	if err != nil {
		return err
	}
	expiresAt := time.Now().Add(s.cfg.SessionTTL)
	_, err = s.db.Exec(r.Context(), `
		INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address)
		VALUES ($1, $2, $3, $4, $5)
	`, userID, hashToken(token), expiresAt, r.UserAgent(), requestIP(r))
	if err != nil {
		return err
	}

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
	return nil
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
