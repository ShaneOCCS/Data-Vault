// Package migrations embeds the numbered SQL schema files in this
// directory so cmd/migrate carries them inside its binary — deploying the
// runner deploys exactly the migrations it was built with.
package migrations

import "embed"

// FS holds every NNNN_name.sql file in this directory.
//
//go:embed *.sql
var FS embed.FS
