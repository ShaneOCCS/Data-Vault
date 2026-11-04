// Command migrate applies the SQL files in migrations/ (embedded in this
// binary) to the database at DATABASE_URL.
//
//	migrate up                  apply every pending migration, in order
//	migrate status              list migrations and whether each is applied
//	migrate baseline <version>  mark migrations up to <version> as applied
//	                            without running them (for a database that
//	                            was migrated by hand before this tool)
//
// DATABASE_URL must point at a role that can run DDL (the database owner,
// e.g. the RDS master user) — NOT vaultapp, which deliberately has no DDL
// rights. Like bootstrap-admin, this is run by hand over SSH, not by the
// server.
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5"

	"vaultfinal/internal/migrate"
	"vaultfinal/migrations"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	cmd := os.Args[1]

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("migrate: DATABASE_URL is required")
	}

	all, err := migrate.Load(migrations.FS)
	if err != nil {
		log.Fatal(err)
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		log.Fatalf("migrate: connect: %v", err)
	}
	defer conn.Close(ctx)

	runner := migrate.New(conn, all)

	switch cmd {
	case "up":
		applied, err := runner.Up(ctx)
		for _, v := range applied {
			fmt.Printf("applied  %s\n", v)
		}
		if err != nil {
			log.Fatal(err)
		}
		if len(applied) == 0 {
			fmt.Println("nothing to apply; database is up to date")
		}
	case "status":
		statuses, err := runner.Status(ctx)
		if err != nil {
			log.Fatal(err)
		}
		for _, s := range statuses {
			state := "pending"
			if s.Applied {
				state = "applied"
			}
			fmt.Printf("%-8s %s\n", state, s.Version)
		}
	case "baseline":
		if len(os.Args) != 3 {
			usage()
		}
		marked, err := runner.Baseline(ctx, os.Args[2])
		if err != nil {
			log.Fatal(err)
		}
		for _, v := range marked {
			fmt.Printf("marked   %s\n", v)
		}
		if len(marked) == 0 {
			fmt.Println("nothing to mark; already recorded")
		}
	default:
		usage()
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: migrate up | status | baseline <version>")
	os.Exit(2)
}
