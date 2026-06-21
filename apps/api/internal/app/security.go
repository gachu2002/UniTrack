package app

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	maxRateLimitEntries  = 10000
	maxRateLimitKeyBytes = 128
)

type rateLimitStore struct {
	mu      sync.Mutex
	entries map[string]rateLimitEntry
}

type rateLimitEntry struct {
	Count   int
	ResetAt time.Time
}

func newRateLimitStore() *rateLimitStore {
	return &rateLimitStore{entries: map[string]rateLimitEntry{}}
}

func (store *rateLimitStore) allow(key string, limit int, window time.Duration) bool {
	if store == nil || limit <= 0 || window <= 0 {
		return true
	}
	key = normalizeRateLimitKey(key)
	now := time.Now()
	store.mu.Lock()
	defer store.mu.Unlock()

	entry, exists := store.entries[key]
	if !exists || now.After(entry.ResetAt) {
		store.cleanupExpiredLocked(now)
		if !exists && len(store.entries) >= maxRateLimitEntries {
			return false
		}
		store.entries[key] = rateLimitEntry{Count: 1, ResetAt: now.Add(window)}
		return true
	}
	if entry.Count >= limit {
		return false
	}
	entry.Count++
	store.entries[key] = entry
	return true
}

func (store *rateLimitStore) cleanupExpiredLocked(now time.Time) {
	if len(store.entries) < maxRateLimitEntries {
		return
	}
	for key, entry := range store.entries {
		if now.After(entry.ResetAt) {
			delete(store.entries, key)
		}
	}
}

func normalizeRateLimitKey(key string) string {
	key = strings.TrimSpace(key)
	if key == "" {
		return "anonymous"
	}
	if len(key) <= maxRateLimitKeyBytes {
		return key
	}
	hash := sha256.Sum256([]byte(key))
	return "sha256:" + hex.EncodeToString(hash[:])
}

func (s *Server) enforceRateLimit(w http.ResponseWriter, key string, limit int, window time.Duration, message string) bool {
	if s.rateLimits == nil || s.rateLimits.allow(key, limit, window) {
		return true
	}
	writeError(w, http.StatusTooManyRequests, message)
	return false
}

func (s *Server) requireTrustedOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isSafeHTTPMethod(r.Method) {
			next.ServeHTTP(w, r)
			return
		}

		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin == "" {
			origin = originFromReferer(r.Header.Get("Referer"))
		}
		if origin == "" {
			if hasSessionCookie(r, s.cfg.SessionCookieName) {
				writeError(w, http.StatusForbidden, "request origin is not allowed")
				return
			}
			next.ServeHTTP(w, r)
			return
		}
		if !s.isTrustedOrigin(origin, r) {
			writeError(w, http.StatusForbidden, "request origin is not allowed")
			return
		}

		next.ServeHTTP(w, r)
	})
}

func hasSessionCookie(r *http.Request, cookieName string) bool {
	cookie, err := r.Cookie(cookieName)
	return err == nil && cookie.Value != ""
}

func isSafeHTTPMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	default:
		return false
	}
}

func (s *Server) isTrustedOrigin(origin string, r *http.Request) bool {
	normalized := normalizeOrigin(origin)
	if normalized == "" {
		return false
	}
	if normalized == normalizeOrigin(requestOrigin(r)) {
		return true
	}
	for _, allowed := range s.cfg.CORSAllowedOrigins {
		if normalized == normalizeOrigin(allowed) {
			return true
		}
	}
	return false
}

func originFromReferer(referer string) string {
	parsed, err := url.Parse(strings.TrimSpace(referer))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}
	return parsed.Scheme + "://" + parsed.Host
}

func requestOrigin(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if forwarded := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))); forwarded == "http" || forwarded == "https" {
		scheme = forwarded
	}
	return scheme + "://" + r.Host
}

func normalizeOrigin(value string) string {
	parsed, err := url.Parse(strings.TrimRight(strings.TrimSpace(value), "/"))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}
	return strings.ToLower(parsed.Scheme + "://" + parsed.Host)
}
