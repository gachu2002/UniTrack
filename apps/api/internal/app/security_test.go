package app

import (
	"fmt"
	"testing"
	"time"
)

func TestRateLimitStoreRejectsNewKeysAtCap(t *testing.T) {
	store := newRateLimitStore()
	for index := 0; index < maxRateLimitEntries; index++ {
		if !store.allow(fmt.Sprintf("key-%d", index), 1, time.Hour) {
			t.Fatalf("key %d rejected before cap", index)
		}
	}

	if store.allow("overflow", 1, time.Hour) {
		t.Fatal("new rate-limit key accepted after cap")
	}
}

func TestRateLimitStoreNormalizesLongKeys(t *testing.T) {
	store := newRateLimitStore()
	longKey := fmt.Sprintf("login:email:%0130d", 1)
	if !store.allow(longKey, 1, time.Hour) {
		t.Fatal("long key rejected on first attempt")
	}
	if store.allow(longKey, 1, time.Hour) {
		t.Fatal("long key bypassed limit normalization")
	}
}
