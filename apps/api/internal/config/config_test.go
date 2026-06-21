package config

import "testing"

func TestValidateRejectsSameSiteNoneWithoutSecure(t *testing.T) {
	cfg := Config{SessionSameSite: "none", SessionSecure: false, CORSAllowedOrigins: []string{"https://app.example.test"}}
	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate accepted SameSite=None without Secure")
	}
}

func TestValidateRejectsWildcardCORSOrigins(t *testing.T) {
	cfg := Config{SessionSameSite: "lax", CORSAllowedOrigins: []string{"*"}}
	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate accepted wildcard CORS origins")
	}
}

func TestValidateRejectsInvalidCORSOrigins(t *testing.T) {
	cases := [][]string{
		{"not an origin"},
		{"https://app.example.test/path"},
		{"ftp://app.example.test"},
	}
	for _, origins := range cases {
		cfg := Config{SessionSameSite: "lax", CORSAllowedOrigins: origins}
		if err := cfg.Validate(); err == nil {
			t.Fatalf("Validate accepted invalid CORS origins %v", origins)
		}
	}
}

func TestValidateAcceptsSecureSameSiteNoneWithExactOrigin(t *testing.T) {
	cfg := Config{SessionSameSite: "none", SessionSecure: true, CORSAllowedOrigins: []string{"https://app.example.test"}}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("Validate rejected secure SameSite=None config: %v", err)
	}
}

func TestValidateRejectsProductionWithoutDatabaseURL(t *testing.T) {
	cfg := Config{AppEnv: "production", SessionSameSite: "lax", SessionSecure: true, CORSAllowedOrigins: []string{"https://app.example.test"}}
	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate accepted production config without DATABASE_URL")
	}
}

func TestValidateRejectsProductionWithoutSecureCookies(t *testing.T) {
	cfg := Config{AppEnv: "production", DatabaseURL: "postgres://example", SessionSameSite: "lax", SessionSecure: false, CORSAllowedOrigins: []string{"https://app.example.test"}}
	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate accepted production config without secure cookies")
	}
}

func TestValidateRejectsProductionHTTPOrigins(t *testing.T) {
	cfg := Config{AppEnv: "production", DatabaseURL: "postgres://example", SessionSameSite: "lax", SessionSecure: true, CORSAllowedOrigins: []string{"http://app.example.test"}}
	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate accepted production config with http origin")
	}
}

func TestValidateAcceptsProductionHTTPSOrigin(t *testing.T) {
	cfg := Config{
		AppEnv:               "production",
		DatabaseURL:          "postgres://example",
		SessionSameSite:      "none",
		SessionSecure:        true,
		CORSAllowedOrigins:   []string{"https://app.example.test"},
		UploadStorageBackend: "r2",
		R2Bucket:             "unitrack-evidence",
		R2Endpoint:           "https://account.r2.cloudflarestorage.com",
		R2AccessKeyID:        "access-key",
		R2SecretAccessKey:    "secret-key",
	}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("Validate rejected production HTTPS config: %v", err)
	}
}

func TestValidateRejectsProductionLocalUploadStorage(t *testing.T) {
	cfg := Config{AppEnv: "production", DatabaseURL: "postgres://example", SessionSameSite: "lax", SessionSecure: true, CORSAllowedOrigins: []string{"https://app.example.test"}, UploadStorageBackend: "local", UploadStorageDir: "var/uploads"}
	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate accepted production config with local upload storage")
	}
}

func TestValidateRejectsIncompleteR2StorageConfig(t *testing.T) {
	cfg := Config{SessionSameSite: "lax", CORSAllowedOrigins: []string{"https://app.example.test"}, UploadStorageBackend: "r2", R2Bucket: "unitrack-evidence"}
	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate accepted incomplete R2 upload storage config")
	}
}

func TestValidateRejectsInvalidR2Endpoint(t *testing.T) {
	cfg := Config{SessionSameSite: "lax", CORSAllowedOrigins: []string{"https://app.example.test"}, UploadStorageBackend: "r2", R2Bucket: "unitrack-evidence", R2Endpoint: "not an origin", R2AccessKeyID: "access-key", R2SecretAccessKey: "secret-key"}
	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate accepted invalid R2 endpoint")
	}
}

func TestValidateAcceptsDevelopmentLocalUploadStorage(t *testing.T) {
	cfg := Config{SessionSameSite: "lax", CORSAllowedOrigins: []string{"https://app.example.test"}, UploadStorageBackend: "local", UploadStorageDir: "var/uploads"}
	if err := cfg.Validate(); err != nil {
		t.Fatalf("Validate rejected development local upload storage: %v", err)
	}
}

func TestValidateRejectsPartialBootstrapAdminConfig(t *testing.T) {
	cfg := Config{SessionSameSite: "lax", CORSAllowedOrigins: []string{"https://app.example.test"}, BootstrapAdminEmail: "admin@example.test"}
	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate accepted partial bootstrap admin config")
	}
}

func TestValidateRejectsInvalidBootstrapAdminEmail(t *testing.T) {
	cfg := Config{SessionSameSite: "lax", CORSAllowedOrigins: []string{"https://app.example.test"}, BootstrapAdminEmail: "not an email", BootstrapAdminPassword: "AdminPass123"}
	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate accepted invalid bootstrap admin email")
	}
}

func TestValidateRejectsWeakBootstrapAdminPassword(t *testing.T) {
	cfg := Config{SessionSameSite: "lax", CORSAllowedOrigins: []string{"https://app.example.test"}, BootstrapAdminEmail: "admin@example.test", BootstrapAdminPassword: "short"}
	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate accepted weak bootstrap admin password")
	}
}
