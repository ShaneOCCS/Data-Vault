# Data Vault

Data Vault is a secure web portal where people can view their health records
anonymously. Each account is tied to a Kit ID instead of a name, and record
contents are encrypted before they reach the database.

Capstone project for ENG4001/ENG4003 at Algonquin College.

## How it works

1. An administrator generates Kit IDs and one-time keys, then hands them to
   participants.
2. An administrator uploads each participant's records as a CSV file named
   `<KitID>.csv`.
3. The participant signs up with their Kit ID and signup key, then links an
   authenticator app such as Google or Microsoft Authenticator.
4. On later visits, they sign in with their Kit ID and a six-digit code. If they
   lose their device, they can use a recovery key to link a new one.
5. They can view their records and charts, and export their data as CSV or PDF.

## Features

**Participants**
- Sign in without a password, name, or email address
- Recover access with single-use recovery keys
- View a health summary, comparison chart, and BMI history
- Export records as CSV or PDF

**Administrators**
- Sign in with an email address and password
- Create Kit IDs and top up recovery keys
- Generate and scan Kit ID barcodes
- Upload CSV records for a Kit ID
- Invite and manage other administrators

**Security**
- AES-256-GCM encryption for records and authenticator secrets
- AWS KMS envelope encryption in production, with a separate data key for each
  encrypted item
- Hashed recovery keys, invite tokens, and admin passwords
- Rate limiting on routes that check a secret
- Audit logs for credential checks, admin actions, and record views
- A startup check that blocks the development encryption key in production

## Tech stack

| Area | Technology |
| --- | --- |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui, ApexCharts |
| Backend | Go 1.25 with the standard `net/http` router |
| Database | PostgreSQL |
| Infrastructure | AWS EC2, RDS, KMS, and Systems Manager Parameter Store, plus nginx |

## Project structure

```text
.
├── src/
│   ├── app/              # Pages
│   ├── components/       # Auth, admin, health, site, and UI components
│   ├── hooks/
│   └── lib/              # API clients, health calculations, and exports
└── vaultfinal/           # Go backend
    ├── cmd/              # server, migrate, and bootstrap-admin
    ├── internal/         # Auth, crypto, handlers, ingestion, and storage
    ├── migrations/       # SQL migrations
    └── deploy/           # AWS deployment files and scripts
```

## Running locally

You'll need Node.js 20+, Go 1.25+, PostgreSQL, and Git Bash on Windows. Run the
commands below from Git Bash.

### 1. Create the database

```bash
psql -U postgres -c "CREATE DATABASE vaultfinal;"
cd vaultfinal
DATABASE_URL="postgres://postgres:YOUR_PASSWORD@localhost:5432/vaultfinal" go run ./cmd/migrate up
psql -U postgres -c "ALTER ROLE vaultapp WITH PASSWORD 'changeme';"
```

Migrations must run as the database owner. The server connects as `vaultapp`,
which has fewer permissions.

### 2. Configure the backend

```bash
cp .env.example .env
openssl rand -base64 32
openssl rand -base64 32
```

Use the two generated values for `SESSION_KEY` and `LOCAL_ENCRYPTION_KEY` in
`.env`. The local encryption key is only for development and test data.

### 3. Create the first administrator and start the backend

The server doesn't load `.env` by itself, so load it into your shell first:

```bash
set -a; source .env; set +a
go run ./cmd/bootstrap-admin --email you@example.com --name "Your Name"
go run ./cmd/server
```

The API runs on `http://localhost:8080`.

### 4. Start the frontend

In a second terminal, from the repo root:

```bash
npm install
cp .env.example .env.local
```

Set the backend address in `.env.local`:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```

Then start the frontend:

```bash
npm run dev
```

Open <http://localhost:9002>. Use `localhost` rather than `127.0.0.1` so sign-in
isn't blocked by CORS.

## Testing

**Frontend**

```bash
npm run lint
npm run typecheck
npm run build
```

**Backend**

```bash
cd vaultfinal
go test ./...
```

Database tests are skipped unless `VAULT_TEST_DATABASE_URL` is set. Point it at a
throwaway PostgreSQL server where the role can create databases and roles, never
at a real deployment.

## Deployment

The backend is designed to run on one EC2 instance behind nginx, using RDS and
AWS KMS. Secrets are loaded from Parameter Store when the service starts. See
[`vaultfinal/deploy/deploy.md`](vaultfinal/deploy/deploy.md) for the deployment
steps.

Never commit a real `.env` file.

## Further documentation

- [`vaultfinal/FEATURES.md`](vaultfinal/FEATURES.md): backend behaviour and API
  details
- [`vaultfinal/deploy/deploy.md`](vaultfinal/deploy/deploy.md): deployment guide

## Team

- Shane O'Connell (team lead)
- Joshua Macpherson
- Phinees Abel-Letshu
- Khusmitkumar Patel
- Vishva Gajera
