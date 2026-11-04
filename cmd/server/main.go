// Command server is the Medical Vault HTTP API. It composes every
// dependency (config, database pool, encryptor, session managers) once at
// startup and hands them to handlers.Server — nothing below this file
// constructs its own database connection or reads an environment variable
// directly, which is what makes config.Load()'s validation the single
// source of truth for "is this deployment configured safely."
package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/kms"
	"github.com/jackc/pgx/v5/pgxpool"

	"vaultfinal/internal/auth"
	"vaultfinal/internal/config"
	"vaultfinal/internal/crypto"
	"vaultfinal/internal/handlers"
	"vaultfinal/internal/store"
)

func main() {
	// A context that's canceled on SIGINT/SIGTERM lets us drain in-flight
	// requests before exiting instead of dropping connections mid-response
	// on every deploy/restart.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load()
	if err != nil {
		// Fail loud, fail at startup — see config.Load's doc comment.
		log.Fatalf("config: %v", err)
	}

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("database: ping failed: %v", err)
	}

	encryptor, err := buildEncryptor(ctx, cfg)
	if err != nil {
		log.Fatalf("crypto: %v", err)
	}

	st := store.New(pool)
	sessions := auth.NewSessionManager(cfg.SessionKey)
	adminSessions := auth.NewAdminSessionManager(cfg.SessionKey)
	srv := handlers.NewServer(st, encryptor, sessions, adminSessions, cfg)

	httpServer := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      srv.Routes(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second, // generous enough for a CSV ingest response, still bounded
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("listening on :%s (env=%s, kms=%v)", cfg.Port, cfg.AppEnv, cfg.UseKMS)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}

// buildEncryptor selects LocalEncryptor or KMSEncryptor based on
// cfg.UseKMS. config.Load() has already refused to start if UseKMS is
// false in production (invariant #8), so by the time we get here the
// choice is always safe for the environment we're actually running in.
func buildEncryptor(ctx context.Context, cfg *config.Config) (crypto.Encryptor, error) {
	if !cfg.UseKMS {
		return crypto.NewLocalEncryptor(cfg.LocalEncryptionKey), nil
	}
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, err
	}
	kmsClient := kms.NewFromConfig(awsCfg)
	return crypto.NewKMSEncryptor(kmsClient, cfg.KMSKeyID), nil
}
