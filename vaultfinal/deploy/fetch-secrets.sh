#!/usr/bin/env bash
# fetch-secrets.sh — runs as root via the systemd unit's ExecStartPre (the
# "+" prefix on that line forces root even though the service itself runs
# as the unprivileged vaultapp user). Pulls the two SecureString parameters
# out of SSM Parameter Store and writes them to a 600, vaultapp-owned env
# file — this is the ONLY place a real DATABASE_URL/SESSION_KEY ever touch
# disk on this box. Never bake these into an AMI, image layer, or
# git-tracked file (see claude.md's "Secrets" deployment note).
set -euo pipefail

ENV_FILE=/etc/vaultfinal/vaultfinal.env
REGION="$(curl -s http://169.254.169.254/latest/meta-data/placement/region)"

DATABASE_URL=$(aws ssm get-parameter --name /vaultfinal/DATABASE_URL --with-decryption --query 'Parameter.Value' --output text --region "$REGION")
SESSION_KEY=$(aws ssm get-parameter --name /vaultfinal/SESSION_KEY --with-decryption --query 'Parameter.Value' --output text --region "$REGION")

mkdir -p "$(dirname "$ENV_FILE")"
umask 077
cat > "$ENV_FILE" <<EOF
DATABASE_URL=${DATABASE_URL}
SESSION_KEY=${SESSION_KEY}
APP_ENV=production
USE_KMS=true
KMS_KEY_ID=alias/vault
PORT=8080
EOF

chown vaultapp:vaultapp "$ENV_FILE"
chmod 600 "$ENV_FILE"
