#!/usr/bin/env bash
# fetch-secrets.sh — runs as root via the systemd unit's ExecStartPre (the
# "+" prefix on that line forces root even though the service itself runs
# as the unprivileged vaultapp user). Pulls the two SecureString parameters
# out of SSM Parameter Store and writes them to a 600, vaultapp-owned env
# file -- this is the ONLY place a real DATABASE_URL/SESSION_KEY ever touch
# disk on this box. Never bake these into an AMI, image layer, or
# git-tracked file (see claude.md's "Secrets" deployment note).
#
# Uses IMDSv2 (token-based instance metadata) -- this instance enforces
# IMDSv2, so an unauthenticated GET to the metadata service returns 401 and
# silently yields an empty region, which breaks every "aws ssm ..." call
# below with "Invalid endpoint: https://ssm..amazonaws.com".
set -euo pipefail
ENV_FILE=/etc/vaultfinal/vaultfinal.env
IMDS_TOKEN="$(curl -sS -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 300")"
REGION="$(curl -sS -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/placement/region)"
DATABASE_URL=$(aws ssm get-parameter --name /vaultfinal/DATABASE_URL --with-decryption --query 'Parameter.Value' --output text --region "$REGION")
SESSION_KEY=$(aws ssm get-parameter --name /vaultfinal/SESSION_KEY --with-decryption --query 'Parameter.Value' --output text --region "$REGION")
mkdir -p "$(dirname "$ENV_FILE")"
umask 077
cat > "$ENV_FILE" <<INNER
DATABASE_URL=${DATABASE_URL}
SESSION_KEY=${SESSION_KEY}
APP_ENV=production
USE_KMS=true
KMS_KEY_ID=alias/vault
AWS_REGION=${REGION}
PORT=8080
CORS_ALLOWED_ORIGINS=http://localhost:9002
INNER
chown vaultapp:vaultapp "$ENV_FILE"
chmod 600 "$ENV_FILE"
