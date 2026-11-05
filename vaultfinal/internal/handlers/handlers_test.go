package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"vaultfinal/internal/auth"
	"vaultfinal/internal/config"
	"vaultfinal/internal/crypto"
	"vaultfinal/internal/store"
	"vaultfinal/internal/testdb"
)

// ---- unit tests (no database) ----

func TestAdminAllowed(t *testing.T) {
	cases := []struct {
		admin      store.Admin
		wantOK     bool
		wantReason string
	}{
		{store.Admin{Active: true, Role: auth.AdminRoleSuperadmin}, true, ""},
		{store.Admin{Active: true, Role: auth.AdminRoleAdmin}, true, ""},
		{store.Admin{Active: false, Role: auth.AdminRoleSuperadmin}, false, "inactive"},
		{store.Admin{Active: true, Role: "viewer"}, false, "role_not_permitted"},
		{store.Admin{Active: true, Role: ""}, false, "role_not_permitted"},
	}
	for _, tc := range cases {
		reason, ok := adminAllowed(&tc.admin)
		if ok != tc.wantOK || reason != tc.wantReason {
			t.Errorf("adminAllowed(%+v) = (%q, %v), want (%q, %v)", tc.admin, reason, ok, tc.wantReason, tc.wantOK)
		}
	}
}

func TestClientIP(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "192.0.2.9:4444"
	if got := clientIP(r); got != "192.0.2.9" {
		t.Fatalf("got %q", got)
	}
	r.RemoteAddr = "[::1]:5555"
	if got := clientIP(r); got != "::1" {
		t.Fatalf("IPv6: got %q, want ::1 (no brackets)", got)
	}
	r.Header.Set("X-Forwarded-For", " 198.51.100.7 , 10.0.0.1")
	if got := clientIP(r); got != "198.51.100.7" {
		t.Fatalf("got %q", got)
	}
}

func TestDecodeJSONRejectsUnknownFields(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"count":1,"admin":true}`))
	r.Header.Set("Content-Type", "application/json")
	var dst provisionRequest
	if err := decodeJSON(httptest.NewRecorder(), r, &dst); err == nil {
		t.Fatal("unknown field accepted")
	}
}

func TestDecodeJSONRejectsMissingContentType(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"count":1}`))
	var dst provisionRequest
	if err := decodeJSON(httptest.NewRecorder(), r, &dst); err == nil {
		t.Fatal("missing Content-Type accepted")
	}
}

func TestDecodeJSONRejectsWrongContentType(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"count":1}`))
	r.Header.Set("Content-Type", "text/plain")
	var dst provisionRequest
	if err := decodeJSON(httptest.NewRecorder(), r, &dst); err == nil {
		t.Fatal("non-JSON Content-Type accepted")
	}
}

func TestCORSAllowedOriginPreflight(t *testing.T) {
	s := &Server{Config: &config.Config{AllowedOrigins: []string{"http://localhost:9002"}}}
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true })
	r := httptest.NewRequest(http.MethodOptions, "/api/auth/login", nil)
	r.Header.Set("Origin", "http://localhost:9002")
	r.Header.Set("Access-Control-Request-Method", "POST")
	w := httptest.NewRecorder()
	s.CORS(next).ServeHTTP(w, r)
	if w.Code != http.StatusNoContent {
		t.Fatalf("got status %d, want 204", w.Code)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:9002" {
		t.Fatalf("Allow-Origin = %q", got)
	}
	if w.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatal("missing Allow-Credentials")
	}
	if called {
		t.Fatal("preflight should not reach the wrapped handler")
	}
}

func TestCORSDisallowedOriginPreflight(t *testing.T) {
	s := &Server{Config: &config.Config{AllowedOrigins: []string{"http://localhost:9002"}}}
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})
	r := httptest.NewRequest(http.MethodOptions, "/api/auth/login", nil)
	r.Header.Set("Origin", "https://evil.example")
	r.Header.Set("Access-Control-Request-Method", "POST")
	w := httptest.NewRecorder()
	s.CORS(next).ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("got status %d, want 403", w.Code)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Allow-Origin should be empty, got %q", got)
	}
}

func TestCORSDisallowedOriginPOSTRejected(t *testing.T) {
	s := &Server{Config: &config.Config{AllowedOrigins: []string{"http://localhost:9002"}}}
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true })
	r := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{}`))
	r.Header.Set("Origin", "https://evil.example")
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.CORS(next).ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("got status %d, want 403", w.Code)
	}
	if called {
		t.Fatal("POST from a disallowed origin reached the handler")
	}
}

func TestCORSDisallowedOriginGETPassesThrough(t *testing.T) {
	s := &Server{Config: &config.Config{AllowedOrigins: []string{"http://localhost:9002"}}}
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})
	r := httptest.NewRequest(http.MethodGet, "/api/session/me", nil)
	r.Header.Set("Origin", "https://evil.example")
	w := httptest.NewRecorder()
	s.CORS(next).ServeHTTP(w, r)
	if !called {
		t.Fatal("GET from a disallowed origin should still reach the handler")
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Allow-Origin should be empty, got %q", got)
	}
}

func TestCORSNoOriginHeaderPassesThroughUnchanged(t *testing.T) {
	s := &Server{Config: &config.Config{AllowedOrigins: []string{"http://localhost:9002"}}}
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})
	r := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{}`))
	w := httptest.NewRecorder()
	s.CORS(next).ServeHTTP(w, r)
	if !called {
		t.Fatal("request without an Origin header should reach the handler unchanged")
	}
	if w.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200", w.Code)
	}
}

func TestMatchRecoveryKey(t *testing.T) {
	keys, _ := auth.GenerateRecoveryKeys(auth.RecoveryPurposeRecovery, 3)
	var candidates []store.RecoveryKey
	for i, k := range keys {
		h, _ := auth.HashRecoveryKey(k)
		candidates = append(candidates, store.RecoveryKey{ID: int64(i + 1), CodeHash: h})
	}
	got, ok := matchRecoveryKey(candidates, keys[2])
	if !ok || got.ID != 3 {
		t.Fatalf("got (%+v, %v), want key 3", got, ok)
	}
	if _, ok := matchRecoveryKey(candidates, "nope"); ok {
		t.Fatal("wrong key matched")
	}
}

// ---- integration tests (real Postgres via testdb) ----

type harness struct {
	t      *testing.T
	pool   *pgxpool.Pool
	srv    *Server
	routes http.Handler
}

func newHarness(t *testing.T) *harness {
	pool := testdb.New(t)
	key := []byte("0123456789abcdef0123456789abcdef")
	srv := NewServer(
		store.New(pool),
		crypto.NewLocalEncryptor(key),
		auth.NewSessionManager(key),
		auth.NewAdminSessionManager(key),
		&config.Config{TOTPIssuer: "Test Vault"},
	)
	return &harness{t: t, pool: pool, srv: srv, routes: srv.Routes()}
}

// do sends a JSON request. Each call gets a distinct client IP unless ip
// is set, so the shared credential rate limiter doesn't interfere with
// tests that aren't about it.
var ipCounter struct {
	sync.Mutex
	n int
}

func nextIP() string {
	ipCounter.Lock()
	defer ipCounter.Unlock()
	ipCounter.n++
	return fmt.Sprintf("10.0.%d.%d", ipCounter.n/250, ipCounter.n%250+1)
}

func (h *harness) do(method, path string, body any, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	h.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			h.t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	if body != nil {
		// decodeJSON rejects anything that isn't application/json.
		req.Header.Set("Content-Type", "application/json")
	}
	req.RemoteAddr = nextIP() + ":5555"
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	h.routes.ServeHTTP(rec, req)
	return rec
}

func (h *harness) adminCookie(email string) *http.Cookie {
	h.t.Helper()
	ctx := context.Background()
	hash, _ := auth.HashPassword("a long enough password")
	if err := h.srv.Store.InsertAdmin(ctx, "Test Admin", email, hash); err != nil {
		h.t.Fatal(err)
	}
	tok, err := h.srv.AdminSessions.IssueAdmin(email)
	if err != nil {
		h.t.Fatal(err)
	}
	return &http.Cookie{Name: auth.AdminSessionCookieName, Value: tok}
}

// auditReasons returns the detail.reason of every audit row with eventType.
func (h *harness) auditReasons(eventType string) []string {
	h.t.Helper()
	rows, err := h.pool.Query(context.Background(),
		`SELECT coalesce(detail->>'reason', '') FROM audit_log WHERE event_type = $1 ORDER BY id`, eventType)
	if err != nil {
		h.t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			h.t.Fatal(err)
		}
		out = append(out, s)
	}
	return out
}

func clearsCookie(rec *httptest.ResponseRecorder, name string) bool {
	for _, c := range rec.Result().Cookies() {
		if c.Name == name && c.MaxAge < 0 {
			return true
		}
	}
	return false
}

func TestDisabledAdminSessionIsRevokedImmediately(t *testing.T) {
	h := newHarness(t)
	cookie := h.adminCookie("ops@example.com")

	if rec := h.do("POST", "/api/admin/provision", map[string]int{"count": 1}, cookie); rec.Code != http.StatusCreated {
		t.Fatalf("active admin: got %d %s", rec.Code, rec.Body)
	}

	if _, err := h.pool.Exec(context.Background(), `UPDATE admins SET active = false WHERE email = 'ops@example.com'`); err != nil {
		t.Fatal(err)
	}

	rec := h.do("POST", "/api/admin/provision", map[string]int{"count": 1}, cookie)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("disabled admin with a still-valid JWT: got %d, want 401", rec.Code)
	}
	if !clearsCookie(rec, auth.AdminSessionCookieName) {
		t.Fatal("rejected admin's cookie was not cleared")
	}
	if got := h.auditReasons("admin_session_failed"); len(got) != 1 || got[0] != "inactive" {
		t.Fatalf("audit reasons %v, want [inactive]", got)
	}
}

func TestListAdminsRoleGating(t *testing.T) {
	h := newHarness(t)
	superCookie := h.adminCookie("super@example.com") // adminCookie's InsertAdmin defaults to superadmin
	regularCookie := h.adminCookie("regular@example.com")
	if _, err := h.pool.Exec(context.Background(), `UPDATE admins SET role = 'admin' WHERE email = 'regular@example.com'`); err != nil {
		t.Fatal(err)
	}

	// Superadmin sees every admin.
	rec := h.do("GET", "/api/admin/admins", nil, superCookie)
	if rec.Code != http.StatusOK {
		t.Fatalf("superadmin list: got %d %s", rec.Code, rec.Body)
	}
	var superList []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &superList); err != nil {
		t.Fatal(err)
	}
	if len(superList) != 2 {
		t.Fatalf("superadmin should see 2 admins, got %d: %s", len(superList), rec.Body)
	}

	// A regular admin sees only themselves — not the superadmin.
	rec = h.do("GET", "/api/admin/admins", nil, regularCookie)
	if rec.Code != http.StatusOK {
		t.Fatalf("regular admin list: got %d %s", rec.Code, rec.Body)
	}
	var regularList []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &regularList); err != nil {
		t.Fatal(err)
	}
	if len(regularList) != 1 {
		t.Fatalf("regular admin should see only themselves, got %d: %s", len(regularList), rec.Body)
	}
	if regularList[0]["email"] != "regular@example.com" {
		t.Fatalf("regular admin saw wrong entry: %+v", regularList[0])
	}
}

func TestDeletedAdminSessionIsRejected(t *testing.T) {
	h := newHarness(t)
	// A token for an email that has no admin row (never created, or the
	// row was removed by hand).
	tok, _ := h.srv.AdminSessions.IssueAdmin("ghost@example.com")
	rec := h.do("POST", "/api/admin/invites", map[string]string{"email": "x@example.com"},
		&http.Cookie{Name: auth.AdminSessionCookieName, Value: tok})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestDisabledAdminCannotLogIn(t *testing.T) {
	h := newHarness(t)
	h.adminCookie("off@example.com")
	if _, err := h.pool.Exec(context.Background(), `UPDATE admins SET active = false WHERE email = 'off@example.com'`); err != nil {
		t.Fatal(err)
	}

	rec := h.do("POST", "/api/admin/auth/login", map[string]string{"email": "off@example.com", "password": "a long enough password"})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
	rec = h.do("POST", "/api/admin/auth/login", map[string]string{"email": "off@example.com", "password": "wrong password!!"})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
	// Status is only recorded after a correct password.
	if got := h.auditReasons("admin_login_failed"); len(got) != 2 || got[0] != "inactive" || got[1] != "bad_password" {
		t.Fatalf("audit reasons %v, want [inactive bad_password]", got)
	}
}

func createInvite(t *testing.T, h *harness, cookie *http.Cookie, email string) string {
	t.Helper()
	rec := h.do("POST", "/api/admin/invites", map[string]string{"email": email}, cookie)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create invite: %d %s", rec.Code, rec.Body)
	}
	var resp createInviteResponse
	json.Unmarshal(rec.Body.Bytes(), &resp)
	return resp.Token
}

func TestAcceptInviteEnforcesPasswordPolicy(t *testing.T) {
	h := newHarness(t)
	token := createInvite(t, h, h.adminCookie("boss@example.com"), "new@example.com")

	rec := h.do("POST", "/api/admin/invites/accept", map[string]string{"email": "new@example.com", "token": token, "password": "short"})
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "at least 12") {
		t.Fatalf("short password: got %d %s", rec.Code, rec.Body)
	}
	// The rejected attempt must not have consumed the invite.
	rec = h.do("POST", "/api/admin/invites/accept", map[string]string{"email": "new@example.com", "token": token, "password": "a long enough password"})
	if rec.Code != http.StatusOK {
		t.Fatalf("valid password after a rejected one: got %d %s", rec.Code, rec.Body)
	}
}

func TestAcceptInviteForExistingAdminReturns409AndKeepsInvite(t *testing.T) {
	h := newHarness(t)
	cookie := h.adminCookie("boss@example.com")
	token := createInvite(t, h, cookie, "boss@example.com")

	rec := h.do("POST", "/api/admin/invites/accept", map[string]string{"email": "boss@example.com", "token": token, "password": "a long enough password"})
	if rec.Code != http.StatusConflict {
		t.Fatalf("got %d %s, want 409", rec.Code, rec.Body)
	}
	pending, _ := h.srv.Store.GetPendingInvitesByEmail(context.Background(), "boss@example.com")
	if len(pending) != 1 {
		t.Fatal("invite was consumed by a failed accept")
	}
}

func TestAcceptInviteWrongTokenIsGenericAndAudited(t *testing.T) {
	h := newHarness(t)
	createInvite(t, h, h.adminCookie("boss@example.com"), "new@example.com")
	rec := h.do("POST", "/api/admin/invites/accept", map[string]string{"email": "new@example.com", "token": "wrong", "password": "a long enough password"})
	if rec.Code != http.StatusUnauthorized || !strings.Contains(rec.Body.String(), "invalid credentials") {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	if got := h.auditReasons("admin_invite_accept_failed"); len(got) != 1 || got[0] != "no_matching_invite" {
		t.Fatalf("audit reasons %v", got)
	}
}

func TestFailedMemberLoginIsAudited(t *testing.T) {
	h := newHarness(t)
	rec := h.do("POST", "/api/auth/login", map[string]string{"kitId": "NOPE234", "code": "123456"})
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d", rec.Code)
	}
	if got := h.auditReasons("login_failed"); len(got) != 1 || got[0] != "unknown_kit_id" {
		t.Fatalf("audit reasons %v, want [unknown_kit_id]", got)
	}
}

// End to end: concurrent redemptions of the same signup key through the
// real HTTP handler — only one may start enrollment.
func TestConcurrentOnboardBeginWithSameKey(t *testing.T) {
	h := newHarness(t)
	rec := h.do("POST", "/api/admin/provision", map[string]int{"count": 1}, h.adminCookie("boss@example.com"))
	var prov struct {
		Members []provisionedMember `json:"members"`
	}
	json.Unmarshal(rec.Body.Bytes(), &prov)
	if len(prov.Members) != 1 || len(prov.Members[0].RecoveryKeys) != 4 {
		t.Fatalf("unexpected provision response %s", rec.Body)
	}
	kit, signup := prov.Members[0].KitID, prov.Members[0].RecoveryKeys[0]

	const n = 10
	codes := make([]int, n)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := range n {
		wg.Go(func() {
			<-start
			codes[i] = h.do("POST", "/api/onboard/begin", map[string]string{"kitId": kit, "recoveryKey": signup}).Code
		})
	}
	close(start)
	wg.Wait()

	ok := 0
	for _, c := range codes {
		switch c {
		case http.StatusOK:
			ok++
		case http.StatusUnauthorized:
		default:
			t.Fatalf("unexpected status %d", c)
		}
	}
	if ok != 1 {
		t.Fatalf("%d concurrent onboard/begin calls succeeded with one signup key, want 1 (codes %v)", ok, codes)
	}
}

func TestAuditWriteFailureDoesNotFailRequest(t *testing.T) {
	h := newHarness(t)
	// An IP that isn't valid inet makes the audit insert fail; the login
	// failure must still be reported normally.
	req := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"kitId":"NOPE234","code":"1"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", "not-an-ip")
	rec := httptest.NewRecorder()
	h.routes.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}
