package store_test

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"vaultfinal/internal/store"
	"vaultfinal/internal/testdb"
)

// raceN is how many goroutines fight over one single-use credential.
const raceN = 20

// race runs fn concurrently raceN times, released at the same moment, and
// returns how many calls returned nil and the non-nil errors.
func race(fn func() error) (successes int, errs []error) {
	var (
		wg    sync.WaitGroup
		mu    sync.Mutex
		start = make(chan struct{})
	)
	for range raceN {
		wg.Go(func() {
			<-start
			err := fn()
			mu.Lock()
			defer mu.Unlock()
			if err == nil {
				successes++
			} else {
				errs = append(errs, err)
			}
		})
	}
	close(start)
	wg.Wait()
	return successes, errs
}

func TestRecoveryKeyCanOnlyBeClaimedOnceUnderConcurrency(t *testing.T) {
	pool := testdb.New(t)
	st := store.New(pool)
	ctx := context.Background()

	if err := st.InsertMember(ctx, "AB3CD7K"); err != nil {
		t.Fatal(err)
	}
	if err := st.InsertRecoveryKeys(ctx, "AB3CD7K", "recovery", []string{"hash"}); err != nil {
		t.Fatal(err)
	}
	keys, err := st.GetUnusedRecoveryKeys(ctx, "AB3CD7K", "recovery")
	if err != nil || len(keys) != 1 {
		t.Fatalf("keys %v, err %v", keys, err)
	}

	ok, errs := race(func() error { return st.MarkRecoveryKeyUsed(ctx, keys[0].ID) })
	if ok != 1 {
		t.Fatalf("%d concurrent claims succeeded, want exactly 1", ok)
	}
	for _, e := range errs {
		if !errors.Is(e, store.ErrAlreadyUsed) {
			t.Fatalf("losing claim returned %v, want ErrAlreadyUsed", e)
		}
	}
	if left, _ := st.GetUnusedRecoveryKeys(ctx, "AB3CD7K", "recovery"); len(left) != 0 {
		t.Fatal("key still listed as unused")
	}
}

func insertInvite(t *testing.T, st *store.Store, email string, expires time.Time) int64 {
	t.Helper()
	ctx := context.Background()
	if err := st.InsertAdminInvite(ctx, email, "tokenhash", "boss@example.com", expires); err != nil {
		t.Fatal(err)
	}
	invites, err := st.GetPendingInvitesByEmail(ctx, email)
	if err != nil {
		t.Fatal(err)
	}
	if len(invites) == 0 {
		return 0
	}
	return invites[len(invites)-1].ID
}

func TestAcceptInviteCreatesAdmin(t *testing.T) {
	st := store.New(testdb.New(t))
	ctx := context.Background()
	id := insertInvite(t, st, "new@example.com", time.Now().Add(time.Hour))

	if err := st.AcceptInviteAndCreateAdmin(ctx, id, "new@example.com", "pwhash"); err != nil {
		t.Fatal(err)
	}
	admin, err := st.GetAdminByEmail(ctx, "new@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if !admin.Active || admin.Role != "superadmin" {
		t.Fatalf("unexpected admin %+v", admin)
	}
	if pending, _ := st.GetPendingInvitesByEmail(ctx, "new@example.com"); len(pending) != 0 {
		t.Fatal("invite still pending after acceptance")
	}
}

// The original bug: the invite was spent before the insert, so a failed
// insert burned it. Now the claim is rolled back with the insert.
func TestAcceptInviteForExistingAdminLeavesInviteUnspent(t *testing.T) {
	st := store.New(testdb.New(t))
	ctx := context.Background()
	if err := st.InsertAdmin(ctx, "dup@example.com", "pwhash"); err != nil {
		t.Fatal(err)
	}
	id := insertInvite(t, st, "dup@example.com", time.Now().Add(time.Hour))

	err := st.AcceptInviteAndCreateAdmin(ctx, id, "dup@example.com", "pwhash2")
	if !errors.Is(err, store.ErrDuplicateAdminEmail) {
		t.Fatalf("got %v, want ErrDuplicateAdminEmail", err)
	}
	pending, err := st.GetPendingInvitesByEmail(ctx, "dup@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 1 {
		t.Fatal("invite was consumed by a failed accept")
	}
}

func TestAcceptInviteOnlyOnceUnderConcurrency(t *testing.T) {
	st := store.New(testdb.New(t))
	ctx := context.Background()
	id := insertInvite(t, st, "race@example.com", time.Now().Add(time.Hour))

	ok, errs := race(func() error {
		return st.AcceptInviteAndCreateAdmin(ctx, id, "race@example.com", "pwhash")
	})
	if ok != 1 {
		t.Fatalf("%d concurrent accepts succeeded, want exactly 1", ok)
	}
	for _, e := range errs {
		// A loser either sees the invite already claimed, or (if it
		// claimed before the winner committed and then blocked on the
		// unique email) the duplicate — never a raw error.
		if !errors.Is(e, store.ErrAlreadyUsed) && !errors.Is(e, store.ErrDuplicateAdminEmail) {
			t.Fatalf("losing accept returned %v", e)
		}
	}
}

func TestAcceptExpiredInviteFails(t *testing.T) {
	pool := testdb.New(t)
	st := store.New(pool)
	ctx := context.Background()
	id := insertInvite(t, st, "late@example.com", time.Now().Add(time.Hour))
	// Expire it after it was looked up, as if the clock ran out between
	// the token check and the claim.
	if _, err := pool.Exec(ctx, `UPDATE admin_invites SET expires_at = now() - interval '1 second' WHERE id = $1`, id); err != nil {
		t.Fatal(err)
	}
	if err := st.AcceptInviteAndCreateAdmin(ctx, id, "late@example.com", "pwhash"); !errors.Is(err, store.ErrAlreadyUsed) {
		t.Fatalf("got %v, want ErrAlreadyUsed", err)
	}
	if _, err := st.GetAdminByEmail(ctx, "late@example.com"); !errors.Is(err, store.ErrNotFound) {
		t.Fatal("admin created from an expired invite")
	}
}

func TestInsertAdminDuplicate(t *testing.T) {
	st := store.New(testdb.New(t))
	ctx := context.Background()
	if err := st.InsertAdmin(ctx, "a@example.com", "h"); err != nil {
		t.Fatal(err)
	}
	if err := st.InsertAdmin(ctx, "a@example.com", "h"); !errors.Is(err, store.ErrDuplicateAdminEmail) {
		t.Fatalf("got %v, want ErrDuplicateAdminEmail", err)
	}
}

func TestLogAuditTruncatesLongPrincipal(t *testing.T) {
	pool := testdb.New(t)
	st := store.New(pool)
	ctx := context.Background()
	long := strings.Repeat("é", 200)
	if err := st.LogAudit(ctx, long, "login_failed", "192.0.2.1", map[string]any{"reason": "unknown_kit_id"}, nil); err != nil {
		t.Fatalf("audit write with an over-long principal failed: %v", err)
	}
	var got string
	if err := pool.QueryRow(ctx, `SELECT principal FROM audit_log WHERE event_type = 'login_failed'`).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != strings.Repeat("é", 64) {
		t.Fatalf("stored principal has %d characters, want 64", len([]rune(got)))
	}
}

func TestAdminRoleConstraint(t *testing.T) {
	pool := testdb.New(t)
	_, err := pool.Exec(context.Background(), `INSERT INTO admins (email, password_hash, role) VALUES ('x@example.com', 'h', 'viewer')`)
	if err == nil {
		t.Fatal("admin with an unknown role was inserted")
	}
}
