#!/usr/bin/env bash
# deploy.sh — build the Linux binary locally and ship it to the EC2 box.
# RDS isn't reachable from your laptop by design (claude.md), and neither
# is the app's own port — this script only ever touches the box over SSH.
#
# SSH_USER is your own admin login. On Amazon Linux 2023 (this box) that's
# "ec2-user"; on Ubuntu it'd be "ubuntu". It is NOT vaultapp — vaultapp is a
# dedicated no-login service account that only owns/runs the process; we sudo
# into place and chown to it, matching the systemd unit's User=.
#
# Usage: SSH_USER=ec2-user ./deploy/deploy.sh <ec2-host-or-elastic-ip>
set -euo pipefail

HOST="${1:?usage: deploy.sh <ec2-host>}"
SSH_USER="${SSH_USER:-ec2-user}"

echo "building linux/amd64 binary..."
GOOS=linux GOARCH=amd64 go build -o /tmp/vaultfinal-server ./cmd/server

echo "shipping to $HOST..."
scp /tmp/vaultfinal-server "${SSH_USER}@${HOST}:/tmp/server"

echo "installing and restarting..."
ssh "${SSH_USER}@${HOST}" '
  sudo install -o vaultapp -g vaultapp -m 755 /tmp/server /opt/vaultfinal/server &&
  sudo systemctl restart medical-vault &&
  sudo systemctl status medical-vault --no-pager
'
