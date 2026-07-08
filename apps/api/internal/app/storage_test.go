package app

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"unitrack/api/internal/config"
)

func TestLocalFileStorePutOpenDelete(t *testing.T) {
	store := localFileStore{baseDir: t.TempDir()}
	key := store.ObjectKey("project-1", "evidence.txt")

	if err := store.Put(context.Background(), key, strings.NewReader("evidence"), "text/plain", int64(len("evidence"))); err != nil {
		t.Fatalf("put local file: %v", err)
	}
	info, err := os.Stat(key)
	if err != nil {
		t.Fatalf("stat local file: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Fatalf("local file mode = %#o, want 0600", got)
	}

	object, err := store.Open(context.Background(), key)
	if err != nil {
		t.Fatalf("open local file: %v", err)
	}
	body, err := io.ReadAll(object.Body)
	closeErr := object.Body.Close()
	if err != nil {
		t.Fatalf("read local file: %v", err)
	}
	if closeErr != nil {
		t.Fatalf("close local file: %v", closeErr)
	}
	if string(body) != "evidence" || object.Size != int64(len("evidence")) {
		t.Fatalf("local object body/size = %q/%d", string(body), object.Size)
	}

	if err := store.Delete(context.Background(), key); err != nil {
		t.Fatalf("delete local file: %v", err)
	}
	if _, err := store.Open(context.Background(), key); !errors.Is(err, errStoredObjectNotFound) {
		t.Fatalf("open deleted local file error = %v, want not found", err)
	}
}

func TestR2FileStorePutOpenDelete(t *testing.T) {
	var putBody string
	var putContentType string
	var deleted bool

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/unitrack-test/prefix/projects/project-1/evidence.txt" {
			http.NotFound(w, r)
			return
		}

		switch r.Method {
		case http.MethodPut:
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Errorf("read put body: %v", err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			putBody = string(body)
			putContentType = r.Header.Get("Content-Type")
			w.WriteHeader(http.StatusOK)
		case http.MethodGet:
			w.Header().Set("Content-Type", "text/plain")
			w.Header().Set("Content-Length", "8")
			_, _ = w.Write([]byte("evidence"))
		case http.MethodDelete:
			deleted = true
			w.WriteHeader(http.StatusNoContent)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer server.Close()

	store := newR2FileStore(config.Config{
		R2Endpoint:        server.URL,
		R2Bucket:          "unitrack-test",
		R2ObjectPrefix:    "prefix",
		R2AccessKeyID:     "test-access-key",
		R2SecretAccessKey: "test-secret-key",
	})
	key := store.ObjectKey("project-1", "evidence.txt")
	if key != "prefix/projects/project-1/evidence.txt" {
		t.Fatalf("r2 object key = %q", key)
	}

	if err := store.Put(context.Background(), key, strings.NewReader("evidence"), " text/plain ", int64(len("evidence"))); err != nil {
		t.Fatalf("put r2 object: %v", err)
	}
	if putBody != "evidence" || putContentType != "text/plain" {
		t.Fatalf("put body/content-type = %q/%q", putBody, putContentType)
	}

	object, err := store.Open(context.Background(), key)
	if err != nil {
		t.Fatalf("open r2 object: %v", err)
	}
	body, err := io.ReadAll(object.Body)
	closeErr := object.Body.Close()
	if err != nil {
		t.Fatalf("read r2 object: %v", err)
	}
	if closeErr != nil {
		t.Fatalf("close r2 object: %v", closeErr)
	}
	if string(body) != "evidence" || object.Size != int64(len("evidence")) || object.ContentType != "text/plain" {
		t.Fatalf("r2 object body/size/content-type = %q/%d/%q", string(body), object.Size, object.ContentType)
	}

	if err := store.Delete(context.Background(), key); err != nil {
		t.Fatalf("delete r2 object: %v", err)
	}
	if !deleted {
		t.Fatal("delete r2 object was not called")
	}
}

func TestR2FileStoreOpenMapsNotFound(t *testing.T) {
	server := httptest.NewServer(http.NotFoundHandler())
	defer server.Close()

	store := newR2FileStore(config.Config{
		R2Endpoint:        server.URL,
		R2Bucket:          "unitrack-test",
		R2AccessKeyID:     "test-access-key",
		R2SecretAccessKey: "test-secret-key",
	})

	_, err := store.Open(context.Background(), store.ObjectKey("project-1", "missing.txt"))
	if !errors.Is(err, errStoredObjectNotFound) {
		t.Fatalf("open missing r2 object error = %v, want not found", err)
	}
}
