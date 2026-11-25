// Package migrate applies the numbered SQL files in migrations/ to a
// database, recording each one in a schema_migrations table so every file
// runs exactly once, in order.
//
// This is schema tooling, not application code: it's used only by
// cmd/migrate and the integration tests, never by cmd/server, and it must
// connect as a role allowed to run DDL (the database owner), not as
// vaultapp. Invariant #7 ("SQL lives only in internal/store") is about the
// application's queries; the migration bookkeeping SQL below is the one
// deliberate exception.
package migrate

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"regexp"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

// advisoryLockKey is an arbitrary constant. Every runner takes this
// session-level advisory lock before touching schema_migrations, so two
// people (or two deploys) running migrations at once are serialized
// instead of both applying the same file.
const advisoryLockKey = 0x7661756c74 // "vault"

// fileNamePattern is the required migration filename shape: a 4-digit
// sequence number, an underscore and a name. Anything else in the
// directory is rejected rather than silently skipped.
var fileNamePattern = regexp.MustCompile(`^(\d{4})_[a-z0-9_]+\.sql$`)

// Migration is one SQL file. Version is the filename without ".sql"
// (e.g. "0001_init"), which is what schema_migrations records.
type Migration struct {
	Version string
	SQL     string
}

// Status is one migration and whether it has been applied.
type Status struct {
	Version string
	Applied bool
}

// Load reads every migration from fsys (the embedded migrations.FS in
// production), sorted by version. It errors on badly named files and on
// duplicate sequence numbers, which would make the order ambiguous.
func Load(fsys fs.FS) ([]Migration, error) {
	entries, err := fs.ReadDir(fsys, ".")
	if err != nil {
		return nil, fmt.Errorf("migrate: read migrations: %w", err)
	}
	seen := map[string]string{}
	var out []Migration
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		m := fileNamePattern.FindStringSubmatch(e.Name())
		if m == nil {
			return nil, fmt.Errorf("migrate: %q is not named NNNN_name.sql", e.Name())
		}
		if prev, dup := seen[m[1]]; dup {
			return nil, fmt.Errorf("migrate: %q and %q share sequence number %s", prev, e.Name(), m[1])
		}
		seen[m[1]] = e.Name()
		body, err := fs.ReadFile(fsys, e.Name())
		if err != nil {
			return nil, fmt.Errorf("migrate: read %s: %w", e.Name(), err)
		}
		out = append(out, Migration{Version: strings.TrimSuffix(e.Name(), ".sql"), SQL: string(body)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Version < out[j].Version })
	return out, nil
}

// Runner applies migrations over one dedicated connection (advisory locks
// are per-session, so a pool would not do).
type Runner struct {
	conn       *pgx.Conn
	migrations []Migration
}

// New builds a Runner. conn should belong to the database owner.
func New(conn *pgx.Conn, migrations []Migration) *Runner {
	return &Runner{conn: conn, migrations: migrations}
}

// withLock creates the bookkeeping table if needed and runs fn while
// holding the advisory lock.
func (r *Runner) withLock(ctx context.Context, fn func() error) error {
	if _, err := r.conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, advisoryLockKey); err != nil {
		return fmt.Errorf("migrate: acquire lock: %w", err)
	}
	defer r.conn.Exec(context.WithoutCancel(ctx), `SELECT pg_advisory_unlock($1)`, advisoryLockKey)

	if _, err := r.conn.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    text        PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)
	`); err != nil {
		return fmt.Errorf("migrate: create schema_migrations: %w", err)
	}
	return fn()
}

func (r *Runner) applied(ctx context.Context) (map[string]bool, error) {
	rows, err := r.conn.Query(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return nil, fmt.Errorf("migrate: read schema_migrations: %w", err)
	}
	versions, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return nil, fmt.Errorf("migrate: read schema_migrations: %w", err)
	}
	out := make(map[string]bool, len(versions))
	for _, v := range versions {
		out[v] = true
	}
	return out, nil
}

// Up applies every pending migration in order, each in its own
// transaction together with its schema_migrations row, so a failing file
// leaves no partial schema change and is retried on the next run. It
// returns the versions it applied.
func (r *Runner) Up(ctx context.Context) ([]string, error) {
	var appliedNow []string
	err := r.withLock(ctx, func() error {
		done, err := r.applied(ctx)
		if err != nil {
			return err
		}
		for _, m := range r.migrations {
			if done[m.Version] {
				continue
			}
			if err := r.apply(ctx, m); err != nil {
				if len(done) == 0 {
					return fmt.Errorf("%w (if this database was migrated by hand before this tool existed, run `migrate baseline <last-applied-version>` first)", err)
				}
				return err
			}
			appliedNow = append(appliedNow, m.Version)
		}
		return nil
	})
	return appliedNow, err
}

func (r *Runner) apply(ctx context.Context, m Migration) error {
	tx, err := r.conn.Begin(ctx)
	if err != nil {
		return fmt.Errorf("migrate: %s: begin: %w", m.Version, err)
	}
	defer tx.Rollback(ctx)

	// No arguments, so pgx sends this over the simple protocol, which
	// accepts a multi-statement file as-is.
	if _, err := tx.Exec(ctx, m.SQL); err != nil {
		return fmt.Errorf("migrate: %s: %w", m.Version, err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, m.Version); err != nil {
		return fmt.Errorf("migrate: %s: record: %w", m.Version, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("migrate: %s: commit: %w", m.Version, err)
	}
	return nil
}

// ErrUnknownVersion is returned by Baseline for a version that doesn't
// match any migration file.
var ErrUnknownVersion = errors.New("migrate: unknown migration version")

// Baseline records every migration up to and including version as applied
// WITHOUT running it. It exists for databases whose schema was applied by
// hand (with psql) before this runner existed: baseline them to the last
// file that was run manually, then `up` applies only what's newer.
func (r *Runner) Baseline(ctx context.Context, version string) ([]string, error) {
	idx := -1
	for i, m := range r.migrations {
		if m.Version == version {
			idx = i
		}
	}
	if idx == -1 {
		return nil, fmt.Errorf("%w: %q", ErrUnknownVersion, version)
	}
	var marked []string
	err := r.withLock(ctx, func() error {
		for _, m := range r.migrations[:idx+1] {
			tag, err := r.conn.Exec(ctx, `
				INSERT INTO schema_migrations (version) VALUES ($1)
				ON CONFLICT (version) DO NOTHING
			`, m.Version)
			if err != nil {
				return fmt.Errorf("migrate: baseline %s: %w", m.Version, err)
			}
			if tag.RowsAffected() == 1 {
				marked = append(marked, m.Version)
			}
		}
		return nil
	})
	return marked, err
}

// Status lists every known migration and whether it has been applied.
func (r *Runner) Status(ctx context.Context) ([]Status, error) {
	var out []Status
	err := r.withLock(ctx, func() error {
		done, err := r.applied(ctx)
		if err != nil {
			return err
		}
		for _, m := range r.migrations {
			out = append(out, Status{Version: m.Version, Applied: done[m.Version]})
		}
		return nil
	})
	return out, err
}
