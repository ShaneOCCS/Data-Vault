package migrate_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/jackc/pgx/v5"

	"vaultfinal/internal/migrate"
	"vaultfinal/internal/testdb"
	"vaultfinal/migrations"
)

func TestLoadSortsAndValidates(t *testing.T) {
	fsys := fstest.MapFS{
		"0002_b.sql":    {Data: []byte("SELECT 2;")},
		"0001_a.sql":    {Data: []byte("SELECT 1;")},
		"migrations.go": {Data: []byte("package migrations")},
	}
	got, err := migrate.Load(fsys)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Version != "0001_a" || got[1].Version != "0002_b" {
		t.Fatalf("got %+v", got)
	}
}

func TestLoadRejectsBadNames(t *testing.T) {
	for name, fsys := range map[string]fstest.MapFS{
		"no number":       {"init.sql": {}},
		"duplicate seq":   {"0001_a.sql": {}, "0001_b.sql": {}},
		"uppercase name":  {"0001_Init.sql": {}},
		"3-digit version": {"001_init.sql": {}},
	} {
		if _, err := migrate.Load(fsys); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

// The real embedded migrations must always load.
func TestEmbeddedMigrationsLoad(t *testing.T) {
	all, err := migrate.Load(migrations.FS)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) < 5 || all[0].Version != "0001_init" {
		t.Fatalf("unexpected migrations: %d, first %q", len(all), all[0].Version)
	}
}

func connect(t *testing.T, url string) *pgx.Conn {
	t.Helper()
	conn, err := pgx.Connect(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close(context.Background()) })
	return conn
}

func TestUpAppliesAllThenIsIdempotent(t *testing.T) {
	conn := connect(t, testdb.NewEmpty(t))
	ctx := context.Background()
	all, _ := migrate.Load(migrations.FS)
	r := migrate.New(conn, all)

	applied, err := r.Up(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(applied) != len(all) {
		t.Fatalf("applied %d of %d", len(applied), len(all))
	}
	again, err := r.Up(ctx)
	if err != nil || len(again) != 0 {
		t.Fatalf("second Up: applied %v, err %v", again, err)
	}
	statuses, err := r.Status(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range statuses {
		if !s.Applied {
			t.Fatalf("%s not applied", s.Version)
		}
	}
}

// A database migrated by hand (as every existing deployment was) has the
// tables but no schema_migrations rows. Up must refuse rather than
// half-apply, and baseline + Up must then apply only the newer files.
func TestBaselineForHandMigratedDatabase(t *testing.T) {
	conn := connect(t, testdb.NewEmpty(t))
	ctx := context.Background()
	all, _ := migrate.Load(migrations.FS)

	for _, m := range all {
		if m.Version > "0004_admin_invites" {
			break
		}
		if _, err := conn.Exec(ctx, m.SQL); err != nil {
			t.Fatalf("hand-applying %s: %v", m.Version, err)
		}
	}

	r := migrate.New(conn, all)
	if _, err := r.Up(ctx); err == nil || !strings.Contains(err.Error(), "baseline") {
		t.Fatalf("Up on an unbaselined hand-migrated DB: got %v, want an error mentioning baseline", err)
	}

	marked, err := r.Baseline(ctx, "0004_admin_invites")
	if err != nil {
		t.Fatal(err)
	}
	if len(marked) != 4 {
		t.Fatalf("marked %v, want 4 versions", marked)
	}
	applied, err := r.Up(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(applied) == 0 || applied[0] != "0005_admin_role_check" {
		t.Fatalf("applied %v, want to start at 0005", applied)
	}
}

func TestBaselineUnknownVersion(t *testing.T) {
	conn := connect(t, testdb.NewEmpty(t))
	all, _ := migrate.Load(migrations.FS)
	_, err := migrate.New(conn, all).Baseline(context.Background(), "9999_nope")
	if !errors.Is(err, migrate.ErrUnknownVersion) {
		t.Fatalf("got %v, want ErrUnknownVersion", err)
	}
}

// A failing file must leave neither its partial changes nor a
// schema_migrations row behind.
func TestFailedMigrationRollsBack(t *testing.T) {
	conn := connect(t, testdb.NewEmpty(t))
	ctx := context.Background()
	ms := []migrate.Migration{
		{Version: "0001_ok", SQL: "CREATE TABLE t1 (id int);"},
		{Version: "0002_bad", SQL: "CREATE TABLE t2 (id int); SELECT * FROM no_such_table;"},
	}
	r := migrate.New(conn, ms)
	applied, err := r.Up(ctx)
	if err == nil {
		t.Fatal("expected 0002_bad to fail")
	}
	if len(applied) != 1 || applied[0] != "0001_ok" {
		t.Fatalf("applied %v, want only 0001_ok", applied)
	}
	var exists bool
	if err := conn.QueryRow(ctx, `SELECT to_regclass('t2') IS NOT NULL`).Scan(&exists); err != nil {
		t.Fatal(err)
	}
	if exists {
		t.Fatal("t2 from the failed migration was left behind")
	}
	statuses, _ := r.Status(ctx)
	if statuses[1].Applied {
		t.Fatal("failed migration recorded as applied")
	}
}
