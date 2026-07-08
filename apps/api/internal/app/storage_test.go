package app

import (
	"context"
	"errors"
	"io"
	"os"
	"strings"
	"testing"
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
