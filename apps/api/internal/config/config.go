package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppName                string
	AppEnv                 string
	AppVersion             string
	HTTPHost               string
	HTTPPort               string
	HTTPReadTimeout        time.Duration
	HTTPWriteTimeout       time.Duration
	HTTPIdleTimeout        time.Duration
	HTTPShutdownTimeout    time.Duration
	CORSAllowedOrigins     []string
	DatabaseURL            string
	SessionCookieName      string
	SessionTTL             time.Duration
	SessionSecure          bool
	SessionSameSite        string
	BootstrapAdminEmail    string
	BootstrapAdminPassword string
	UploadStorageDir       string
}

func Load() Config {
	return Config{
		AppName:                getenv("APP_NAME", "UniTrack API"),
		AppEnv:                 getenv("APP_ENV", "development"),
		AppVersion:             getenv("APP_VERSION", "0.1.0"),
		HTTPHost:               getenv("HTTP_HOST", "0.0.0.0"),
		HTTPPort:               getenv("HTTP_PORT", getenv("PORT", "8080")),
		HTTPReadTimeout:        getduration("HTTP_READ_TIMEOUT", 10*time.Second),
		HTTPWriteTimeout:       getduration("HTTP_WRITE_TIMEOUT", 10*time.Second),
		HTTPIdleTimeout:        getduration("HTTP_IDLE_TIMEOUT", 60*time.Second),
		HTTPShutdownTimeout:    getduration("HTTP_SHUTDOWN_TIMEOUT", 10*time.Second),
		CORSAllowedOrigins:     getlist("CORS_ALLOWED_ORIGINS", "http://localhost:5173"),
		DatabaseURL:            strings.TrimSpace(os.Getenv("DATABASE_URL")),
		SessionCookieName:      getenv("SESSION_COOKIE_NAME", "unitrack_session"),
		SessionTTL:             getduration("SESSION_TTL", 7*24*time.Hour),
		SessionSecure:          getbool("SESSION_SECURE", false),
		SessionSameSite:        getsamesite("SESSION_SAME_SITE", "lax"),
		BootstrapAdminEmail:    strings.ToLower(strings.TrimSpace(os.Getenv("AUTH_BOOTSTRAP_ADMIN_EMAIL"))),
		BootstrapAdminPassword: os.Getenv("AUTH_BOOTSTRAP_ADMIN_PASSWORD"),
		UploadStorageDir:       getenv("UPLOAD_STORAGE_DIR", "var/uploads"),
	}
}

func getenv(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func getduration(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func getbool(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func getsamesite(key string, fallback string) string {
	value := strings.ToLower(strings.TrimSpace(getenv(key, fallback)))
	switch value {
	case "strict", "lax", "none":
		return value
	default:
		return fallback
	}
}

func getlist(key string, fallback string) []string {
	value := getenv(key, fallback)
	parts := strings.Split(value, ",")
	items := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item != "" {
			items = append(items, item)
		}
	}
	return items
}
