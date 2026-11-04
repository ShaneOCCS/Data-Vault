# Data Vault Frontend

Next.js frontend for Data Vault, a portal where members view records linked to their KIT ID and admins provision KIT IDs and upload records. It talks to the Go backend in `vaultfinal`.

## Prerequisites

Node.js 20 or later, and access to a running backend. Local development normally reaches the backend through an SSH tunnel on port 18080.

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create your local settings. `NEXT_PUBLIC_API_BASE_URL` is the backend's address:
   ```bash
   cp .env.example .env.local
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:9002](http://localhost:9002). Use `localhost`, not `127.0.0.1`, because the backend's CORS setting only allows `http://localhost:9002`.

The dev server only listens on this computer. It can't be reached from other devices on your network.

## Scripts

- `npm run dev`: starts the development server on port 9002.
- `npm run build`: creates a production build. Type errors and lint errors fail the build.
- `npm run start`: starts the production server.
- `npm run lint`: runs ESLint.
- `npm run typecheck`: runs the TypeScript compiler.

## Code layout

- `src/app`: pages (landing, member login, registration and dashboard, plus the admin pages).
- `src/components/auth`: member login, recovery and registration flows.
- `src/components/admin`: admin dashboard sections and tools.
- `src/components/ui`: shared UI components.
- `src/lib`: API clients. All backend calls go through `apiFetch` in `api.ts`.
