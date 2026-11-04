# Data Vault

Data Vault is an anonymous health-metrics portal. Participants submit health
data against a Kit ID rather than a name, so records can be stored and analyzed
without holding identifying information.

Capstone project ENG4001/ENG4003, Algonquin College.

## Backend (`vaultfinal`)

The server is written in Go and backed by PostgreSQL. Authentication uses a Kit
ID paired with a TOTP authenticator app (Google or Microsoft Authenticator)
instead of a password — a participant never has to register an email address or
remember a credential, which keeps the account anonymous and removes password
reset as an attack surface.

Record contents are encrypted server-side using AWS KMS envelope encryption:
each record gets its own data encryption key, wrapped by a KMS master key, with
AES-256-GCM as the record cipher.

## Frontend

Next.js frontend for Data Vault. Members can view records linked to their KIT
ID, and admins can provision KIT IDs and upload records. The frontend talks to
the Go backend in `vaultfinal`.

### Prerequisites

Node.js 20 or later, and access to a running backend. Local development
normally reaches the backend through an SSH tunnel on port 18080.

### Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create local settings. `NEXT_PUBLIC_API_BASE_URL` is the backend address:
   ```bash
   cp .env.example .env.local
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:9002](http://localhost:9002). Use `localhost`, not
   `127.0.0.1`, because the backend CORS setting only allows
   `http://localhost:9002`.

The dev server only listens on this computer and cannot be reached from other
devices on your network.

### Frontend scripts

- `npm run dev`: starts the development server on port 9002.
- `npm run build`: creates a production build. Type and lint errors fail it.
- `npm run start`: starts the production server.
- `npm run lint`: runs ESLint.
- `npm run typecheck`: runs the TypeScript compiler.

### Frontend code layout

- `src/app`: pages (landing, member login, registration/dashboard, admin pages).
- `src/components/auth`: member login, recovery, and registration flows.
- `src/components/admin`: admin dashboard sections and tools.
- `src/components/ui`: shared UI components.
- `src/lib`: API clients. All backend calls go through `apiFetch` in `api.ts`.
