package ratelimit

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func send(h http.HandlerFunc, remoteAddr, xff string) int {
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.RemoteAddr = remoteAddr
	if xff != "" {
		req.Header.Set("X-Forwarded-For", xff)
	}
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec.Code
}

func TestBurstThenThrottle(t *testing.T) {
	h := New(10, 5).Middleware(func(w http.ResponseWriter, r *http.Request) {})
	for i := range 5 {
		if code := send(h, "192.0.2.1:1000", ""); code != http.StatusOK {
			t.Fatalf("request %d: got %d, want 200", i+1, code)
		}
	}
	if code := send(h, "192.0.2.1:1000", ""); code != http.StatusTooManyRequests {
		t.Fatalf("6th request: got %d, want 429", code)
	}
}

func TestLimitsArePerIP(t *testing.T) {
	h := New(10, 1).Middleware(func(w http.ResponseWriter, r *http.Request) {})
	if send(h, "192.0.2.1:1000", "") != http.StatusOK {
		t.Fatal("first IP's first request throttled")
	}
	if send(h, "192.0.2.1:2000", "") != http.StatusTooManyRequests {
		t.Fatal("same IP on a different port was not throttled")
	}
	if send(h, "192.0.2.2:1000", "") != http.StatusOK {
		t.Fatal("a different IP was throttled")
	}
}

func TestUsesFirstForwardedFor(t *testing.T) {
	h := New(10, 1).Middleware(func(w http.ResponseWriter, r *http.Request) {})
	// Same proxy address, different real clients: separate budgets.
	if send(h, "127.0.0.1:1", "198.51.100.1") != http.StatusOK {
		t.Fatal("client 1 throttled")
	}
	if send(h, "127.0.0.1:1", "198.51.100.2, 10.0.0.1") != http.StatusOK {
		t.Fatal("client 2 throttled")
	}
	if send(h, "127.0.0.1:1", "198.51.100.1") != http.StatusTooManyRequests {
		t.Fatal("client 1 not throttled on its second request")
	}
}
