// Package ratelimit provides an in-memory, per-IP rate limiting middleware
// for the credential-checking endpoints (login, recovery, onboarding,
// invite acceptance). See the long comment on Limiter below for why
// in-memory is the *correct* choice here, not a shortcut.
package ratelimit

import (
	"net"
	"net/http"
	"strings"
	"sync"

	"golang.org/x/time/rate"
)

// Limiter rate-limits requests per source IP using a token bucket per IP.
//
// This is in-memory and per-process ON PURPOSE: claude.md's deployment
// target is a single EC2 instance running one copy of this binary, so
// there is exactly one process's memory to keep counters in — there's
// nothing to synchronize across instances because there are no other
// instances. This keeps the limiter a few lines of stdlib-adjacent code
// instead of a Redis dependency the system doesn't otherwise need.
//
// If this service is ever horizontally scaled to multiple instances behind
// a load balancer, THIS LIMITER STOPS BEING CORRECT — each instance would
// track its own counters, so an attacker spread across instances gets a
// multiple of the intended limit. At that point (not before), move this to
// shared storage (Redis, or a database table keyed by IP).
type Limiter struct {
	mu       sync.Mutex
	limiters map[string]*rate.Limiter
	rateHz   rate.Limit // steady-state refill rate, in tokens/sec
	burst    int        // bucket size, i.e. max burst before throttling kicks in
}

// New builds a Limiter allowing `burst` immediate requests per IP, refilling
// at `perMinute` requests per minute thereafter. Conservative values are
// intentional — see claude.md's "Rate limiting" section: the exact numbers
// matter less than the fact that a guessing loop now costs wall-clock time.
func New(perMinute int, burst int) *Limiter {
	return &Limiter{
		limiters: make(map[string]*rate.Limiter),
		rateHz:   rate.Limit(float64(perMinute) / 60.0),
		burst:    burst,
	}
}

// limiterFor returns the per-IP token bucket for ip, creating it on first
// use. The map is never pruned — for a single small-scale EC2 deployment
// the memory cost of one rate.Limiter per distinct IP ever seen is
// negligible, and pruning would add complexity for no real benefit here.
func (l *Limiter) limiterFor(ip string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()
	lim, ok := l.limiters[ip]
	if !ok {
		lim = rate.NewLimiter(l.rateHz, l.burst)
		l.limiters[ip] = lim
	}
	return lim
}

// Middleware wraps next so that requests exceeding the per-IP rate get a
// 429 instead of reaching the handler. Wrap only credential-checking
// endpoints with this — see claude.md's list — not the whole app.
func (l *Limiter) Middleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := sourceIP(r)
		if !l.limiterFor(ip).Allow() {
			http.Error(w, `{"error":"too many requests"}`, http.StatusTooManyRequests)
			return
		}
		next(w, r)
	}
}

// sourceIP extracts the caller's IP for rate-limiting purposes. It trusts
// X-Forwarded-For, because in this deployment the only thing that can ever
// reach this process is the nginx reverse proxy running on the same box
// (the app's own port is never exposed to the internet — see claude.md's
// EC2 security group notes), and nginx is configured to set that header.
// Falls back to RemoteAddr for local/dev runs without nginx in front.
func sourceIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		first, _, _ := strings.Cut(fwd, ",")
		return strings.TrimSpace(first)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
