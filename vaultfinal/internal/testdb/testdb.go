// Package testdb gives integration tests a fresh, fully migrated Postgres
// database. Tests that use it are skipped unless VAULT_TEST_DATABASE_URL
// points at a Postgres server where that role may CREATE DATABASE and
// CREATE ROLE (a local superuser on a throwaway cluster — never a real
// deployment). Each call creates a uniquely named database and drops it
// when the test ends.
package testdb

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/url"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"vaultfinal/internal/migrate"
	"vaultfinal/migrations"
)

// EnvVar names the environment variable that enables integration tests.
const EnvVar = "VAULT_TEST_DATABASE_URL"

// URL returns the server URL, or skips the test when it isn't set.
func URL(t testing.TB) string {
	t.Helper()
	u := os.Getenv(EnvVar)
	if u == "" {
		t.Skipf("%s not set; skipping integration test", EnvVar)
	}
	return u
}

// NewEmpty creates an empty database and returns its URL.
func NewEmpty(t testing.TB) string {
	t.Helper()
	base := URL(t)
	ctx := context.Background()

	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatalf("testdb: connect: %v", err)
	}
	t.Cleanup(func() { admin.Close(context.Background()) })

	suffix := make([]byte, 6)
	if _, err := rand.Read(suffix); err != nil {
		t.Fatal(err)
	}
	name := "vault_test_" + hex.EncodeToString(suffix)
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatalf("testdb: create database: %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
	})

	u, err := url.Parse(base)
	if err != nil {
		t.Fatalf("testdb: parse url: %v", err)
	}
	u.Path = "/" + name
	return u.String()
}

// New creates a database with every migration applied and returns a pool
// connected to it.
func New(t testing.TB) *pgxpool.Pool {
	t.Helper()
	dbURL := NewEmpty(t)
	ctx := context.Background()

	all, err := migrate.Load(migrations.FS)
	if err != nil {
		t.Fatal(err)
	}
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		t.Fatalf("testdb: connect: %v", err)
	}
	defer conn.Close(ctx)
	if _, err := migrate.New(conn, all).Up(ctx); err != nil {
		t.Fatalf("testdb: migrate: %v", err)
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("testdb: pool: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}
