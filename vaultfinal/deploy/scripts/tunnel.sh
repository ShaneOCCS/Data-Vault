#!/usr/bin/env bash
# tunnel.sh — use the deployed API from this computer (there is no HTTPS yet).
#
# Opens an SSH tunnel so the app on the AWS instance is reachable at
#     http://localhost:18080/api
# for as long as this window stays open. Use it to point your Next.js dev
# server (or Postman, curl, a browser) at the real deployment.
# Press Ctrl+C to close it.
#
# Use a different local port with:  TUNNEL_PORT=18081 ./deploy/scripts/tunnel.sh
source "$(dirname "$0")/lib.sh"
load_config

step "Opening a tunnel to the API on $EC2_HOST"
trap close_tunnel EXIT
open_tunnel
ok "The API is available at: ${BOLD}http://localhost:$TUNNEL_PORT/api${RESET}"
info "Keep this window open while you use it. Press Ctrl+C to close the tunnel."
wait "$TUNNEL_PID" || true
