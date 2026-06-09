package app

import (
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
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
	now := time.Now()
	store.mu.Lock()
	defer store.mu.Unlock()

	entry, exists := store.entries[key]
	if !exists || now.After(entry.ResetAt) {
		store.entries[key] = rateLimitEntry{Count: 1, ResetAt: now.Add(window)}
		store.cleanupExpiredLocked(now)
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
	if len(store.entries) < 1000 {
		return
	}
	for key, entry := range store.entries {
		if now.After(entry.ResetAt) {
			delete(store.entries, key)
		}
	}
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
		if origin != "" && !s.isTrustedOrigin(origin, r) {
			writeError(w, http.StatusForbidden, "request origin is not allowed")
			return
		}

		next.ServeHTTP(w, r)
	})
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
		if strings.TrimSpace(allowed) == "*" || normalized == normalizeOrigin(allowed) {
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
