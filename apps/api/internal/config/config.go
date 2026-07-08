package config

import (
	"errors"
	"fmt"
	"net/mail"
	"net/url"
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
	UploadStorageBackend   string
	UploadStorageDir       string
	R2Bucket               string
	R2Endpoint             string
	R2AccessKeyID          string
	R2SecretAccessKey      string
	R2Region               string
	R2ObjectPrefix         string
}

func Load() (Config, error) {
	readTimeout, err := getduration("HTTP_READ_TIMEOUT", 10*time.Second)
	if err != nil {
		return Config{}, err
	}
	writeTimeout, err := getduration("HTTP_WRITE_TIMEOUT", 10*time.Second)
	if err != nil {
		return Config{}, err
	}
	idleTimeout, err := getduration("HTTP_IDLE_TIMEOUT", 60*time.Second)
	if err != nil {
		return Config{}, err
	}
	shutdownTimeout, err := getduration("HTTP_SHUTDOWN_TIMEOUT", 10*time.Second)
	if err != nil {
		return Config{}, err
	}
	sessionTTL, err := getduration("SESSION_TTL", 7*24*time.Hour)
	if err != nil {
		return Config{}, err
	}
	sessionSecure, err := getbool("SESSION_SECURE", false)
	if err != nil {
		return Config{}, err
	}
	sessionSameSite, err := getsamesite("SESSION_SAME_SITE", "lax")
	if err != nil {
		return Config{}, err
	}

	return Config{
		AppName:                getenv("APP_NAME", "UniTrack API"),
		AppEnv:                 getenv("APP_ENV", "development"),
		AppVersion:             getenv("APP_VERSION", "0.1.0"),
		HTTPHost:               getenv("HTTP_HOST", "0.0.0.0"),
		HTTPPort:               getenv("HTTP_PORT", getenv("PORT", "8080")),
		HTTPReadTimeout:        readTimeout,
		HTTPWriteTimeout:       writeTimeout,
		HTTPIdleTimeout:        idleTimeout,
		HTTPShutdownTimeout:    shutdownTimeout,
		CORSAllowedOrigins:     getlist("CORS_ALLOWED_ORIGINS", "http://localhost:5173"),
		DatabaseURL:            strings.TrimSpace(os.Getenv("DATABASE_URL")),
		SessionCookieName:      getenv("SESSION_COOKIE_NAME", "unitrack_session"),
		SessionTTL:             sessionTTL,
		SessionSecure:          sessionSecure,
		SessionSameSite:        sessionSameSite,
		BootstrapAdminEmail:    strings.ToLower(strings.TrimSpace(os.Getenv("AUTH_BOOTSTRAP_ADMIN_EMAIL"))),
		BootstrapAdminPassword: os.Getenv("AUTH_BOOTSTRAP_ADMIN_PASSWORD"),
		UploadStorageBackend:   strings.ToLower(getenv("UPLOAD_STORAGE_BACKEND", "local")),
		UploadStorageDir:       getenv("UPLOAD_STORAGE_DIR", "var/uploads"),
		R2Bucket:               strings.TrimSpace(os.Getenv("R2_BUCKET")),
		R2Endpoint:             strings.TrimRight(strings.TrimSpace(os.Getenv("R2_ENDPOINT")), "/"),
		R2AccessKeyID:          strings.TrimSpace(os.Getenv("R2_ACCESS_KEY_ID")),
		R2SecretAccessKey:      strings.TrimSpace(os.Getenv("R2_SECRET_ACCESS_KEY")),
		R2Region:               getenv("R2_REGION", "auto"),
		R2ObjectPrefix:         strings.Trim(strings.TrimSpace(os.Getenv("R2_OBJECT_PREFIX")), "/"),
	}, nil
}

func (cfg Config) Validate() error {
	production := strings.EqualFold(strings.TrimSpace(cfg.AppEnv), "production")
	if production && strings.TrimSpace(cfg.DatabaseURL) == "" {
		return errors.New("DATABASE_URL is required when APP_ENV=production")
	}
	if production && !cfg.SessionSecure {
		return errors.New("SESSION_SECURE=true is required when APP_ENV=production")
	}
	explicitStorageBackend := strings.TrimSpace(cfg.UploadStorageBackend) != ""
	backend := strings.ToLower(strings.TrimSpace(cfg.UploadStorageBackend))
	if backend == "" {
		backend = "local"
	}
	switch backend {
	case "local":
		if production {
			return errors.New("UPLOAD_STORAGE_BACKEND=r2 is required when APP_ENV=production")
		}
		if explicitStorageBackend && strings.TrimSpace(cfg.UploadStorageDir) == "" {
			return errors.New("UPLOAD_STORAGE_DIR is required when UPLOAD_STORAGE_BACKEND=local")
		}
	case "r2":
		if strings.TrimSpace(cfg.R2Bucket) == "" || strings.TrimSpace(cfg.R2Endpoint) == "" || strings.TrimSpace(cfg.R2AccessKeyID) == "" || strings.TrimSpace(cfg.R2SecretAccessKey) == "" {
			return errors.New("R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY are required when UPLOAD_STORAGE_BACKEND=r2")
		}
		parsedEndpoint, err := url.Parse(strings.TrimSpace(cfg.R2Endpoint))
		if err != nil || parsedEndpoint.Scheme == "" || parsedEndpoint.Host == "" || parsedEndpoint.Path != "" || parsedEndpoint.RawQuery != "" || parsedEndpoint.Fragment != "" {
			return errors.New("R2_ENDPOINT must be a valid http(s) origin")
		}
		if parsedEndpoint.Scheme != "http" && parsedEndpoint.Scheme != "https" {
			return errors.New("R2_ENDPOINT must be a valid http(s) origin")
		}
		if production && parsedEndpoint.Scheme != "https" {
			return errors.New("R2_ENDPOINT must use https when APP_ENV=production")
		}
	case "":
		// Already normalized to local above.
	default:
		return errors.New("UPLOAD_STORAGE_BACKEND must be local or r2")
	}
	if strings.EqualFold(strings.TrimSpace(cfg.SessionSameSite), "none") && !cfg.SessionSecure {
		return errors.New("SESSION_SAME_SITE=none requires SESSION_SECURE=true")
	}
	for _, origin := range cfg.CORSAllowedOrigins {
		trimmedOrigin := strings.TrimSpace(origin)
		if trimmedOrigin == "*" {
			return errors.New("CORS_ALLOWED_ORIGINS must list exact origins when credentialed sessions are enabled")
		}
		parsedOrigin, err := url.Parse(trimmedOrigin)
		if err != nil || parsedOrigin.Scheme == "" || parsedOrigin.Host == "" || parsedOrigin.Path != "" || parsedOrigin.RawQuery != "" || parsedOrigin.Fragment != "" {
			return errors.New("CORS_ALLOWED_ORIGINS must contain valid http(s) origins")
		}
		if parsedOrigin.Scheme != "http" && parsedOrigin.Scheme != "https" {
			return errors.New("CORS_ALLOWED_ORIGINS must contain valid http(s) origins")
		}
		if production && parsedOrigin.Scheme != "https" {
			return errors.New("CORS_ALLOWED_ORIGINS must use https origins when APP_ENV=production")
		}
	}
	bootstrapEmail := strings.TrimSpace(cfg.BootstrapAdminEmail)
	bootstrapPassword := strings.TrimSpace(cfg.BootstrapAdminPassword)
	if (bootstrapEmail == "") != (bootstrapPassword == "") {
		return errors.New("AUTH_BOOTSTRAP_ADMIN_EMAIL and AUTH_BOOTSTRAP_ADMIN_PASSWORD must be set together")
	}
	if bootstrapEmail != "" {
		parsed, err := mail.ParseAddress(bootstrapEmail)
		if err != nil || parsed.Address != bootstrapEmail {
			return errors.New("AUTH_BOOTSTRAP_ADMIN_EMAIL must be a valid email address")
		}
		if bootstrapPassword != cfg.BootstrapAdminPassword {
			return errors.New("AUTH_BOOTSTRAP_ADMIN_PASSWORD cannot start or end with spaces")
		}
		if len(bootstrapPassword) < 8 {
			return errors.New("AUTH_BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters")
		}
	}
	return nil
}

func getenv(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func getduration(key string, fallback time.Duration) (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be a valid duration: %w", key, err)
	}
	if parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive duration", key)
	}
	return parsed, nil
}

func getbool(key string, fallback bool) (bool, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("%s must be a valid boolean: %w", key, err)
	}
	return parsed, nil
}

func getsamesite(key string, fallback string) (string, error) {
	value := strings.ToLower(strings.TrimSpace(getenv(key, fallback)))
	switch value {
	case "strict", "lax", "none":
		return value, nil
	default:
		return "", fmt.Errorf("%s must be strict, lax, or none", key)
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
