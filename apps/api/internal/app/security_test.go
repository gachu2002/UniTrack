package app

import (
	"fmt"
	"net/http/httptest"
	"testing"
	"time"

	"unitrack/api/internal/config"
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

func TestClientIPUsesForwardedForFromTrustedProxy(t *testing.T) {
	api := NewServer(config.Config{TrustedProxyCIDRs: []string{"10.0.0.0/8"}}, nil, nil)
	request := httptest.NewRequest("GET", "https://api.example.test/", nil)
	request.RemoteAddr = "10.0.0.12:443"
	request.Header.Set("X-Forwarded-For", "198.51.100.44, 10.0.0.8")

	if got := api.clientIP(request); got != "198.51.100.44" {
		t.Fatalf("clientIP = %q, want forwarded client", got)
	}
}

func TestClientIPIgnoresForwardedForFromUntrustedRemote(t *testing.T) {
	api := NewServer(config.Config{TrustedProxyCIDRs: []string{"10.0.0.0/8"}}, nil, nil)
	request := httptest.NewRequest("GET", "https://api.example.test/", nil)
	request.RemoteAddr = "203.0.113.9:443"
	request.Header.Set("X-Forwarded-For", "198.51.100.44")

	if got := api.clientIP(request); got != "203.0.113.9" {
		t.Fatalf("clientIP = %q, want direct remote address", got)
	}
}

func TestClientIPSkipsSpoofedForwardedPrefix(t *testing.T) {
	api := NewServer(config.Config{TrustedProxyCIDRs: []string{"10.0.0.0/8"}}, nil, nil)
	request := httptest.NewRequest("GET", "https://api.example.test/", nil)
	request.RemoteAddr = "10.0.0.12:443"
	request.Header.Set("X-Forwarded-For", "192.0.2.200, 198.51.100.44, 10.0.0.8")

	if got := api.clientIP(request); got != "198.51.100.44" {
		t.Fatalf("clientIP = %q, want nearest untrusted forwarded address", got)
	}
}
