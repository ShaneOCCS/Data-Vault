// Command bootstrap-admin creates the very first admin account by writing
// directly to the database — no HTTP server involved. This is why
// invariant #9 ("no HTTP endpoint that creates an admin account from a
// shared secret") holds structurally: this is the ONLY way to create the
// first admin, it's meant to be run once, over SSH, directly against the
// database. Every admin after this one is created through
// POST /api/admin/invites -> POST /api/admin/invites/accept instead.
package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"vaultfinal/internal/auth"
	"vaultfinal/internal/store"
)

func main() {
	email := flag.String("email", "", "email address for the first admin account")
	password := flag.String("password", "", "password for the first admin account (omit to be prompted)")
	flag.Parse()

	if *email == "" {
		log.Fatal("bootstrap-admin: --email is required")
	}

	if *password == "" {
		p, err := promptPassword()
		if err != nil {
			log.Fatalf("bootstrap-admin: %v", err)
		}
		*password = p
	}
	// Same policy AcceptInvite enforces — one definition in package auth.
	if err := auth.ValidateAdminPassword(*password); err != nil {
		log.Fatalf("bootstrap-admin: %v", err)
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("bootstrap-admin: DATABASE_URL is required")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("bootstrap-admin: connect: %v", err)
	}
	defer pool.Close()

	passwordHash, err := auth.HashPassword(*password)
	if err != nil {
		log.Fatalf("bootstrap-admin: hash password: %v", err)
	}

	st := store.New(pool)
	if err := st.InsertAdmin(ctx, *email, passwordHash); err != nil {
		log.Fatalf("bootstrap-admin: insert admin: %v", err)
	}

	fmt.Printf("admin account created: %s\n", *email)
}

// promptPassword reads a password from stdin when --password isn't passed
// as a flag. It does NOT disable terminal echo (that would need an extra
// dependency this project's tech stack deliberately doesn't include — see
// claude.md's "no third-party ... every dependency is something you'd have
// to vet" rationale) — run this over an SSH session you trust, per this
// command's own doc comment above.
func promptPassword() (string, error) {
	fmt.Print("password: ")
	reader := bufio.NewReader(os.Stdin)
	line, err := reader.ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return "", err
	}
	return strings.TrimSpace(line), nil
}
