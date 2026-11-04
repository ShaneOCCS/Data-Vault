# Deploying Medical Vault to AWS

This guide updates the backend running on your AWS server to the new version, then tests it.

- **No domain or HTTPS setup is needed.** You reach the deployed API from your own computer through a **secure SSH tunnel**. That covers the test script, Postman and curl.
- **Connecting a frontend** needs a backend change (CORS) first. It isn't part of this deployment; see *Connecting a frontend* near the end.

**Time needed:** about 30 minutes the first time, mostly waiting.

---

## How it works

- **You run everything from your own computer**, in **Git Bash**. The scripts connect to the AWS server for you. You never have to type commands on the server.
- There are **6 steps, one script each**. Run them in order.
- **Each script checks its own work.** It prints `[ok]` for every step that worked. If something is wrong, it stops with a red `[x]` and a message saying what to do.
- **You can safely rerun a script** after fixing a problem.
- **Passwords are typed when asked and never saved.** Your typing is hidden while you enter them.

| Step | Script | What it does | Changes anything? |
|---|---|---|---|
| 0 | `00-check.sh` | Checks your settings, tools, code and access to the server | No |
| 1 | `01-backup.sh` | Backs up the database and the current server program | Only adds backups |
| 2 | `02-migrate.sh` | Updates the database structure | Yes: database |
| 3 | `03-deploy.sh` | Installs the new server program and restarts it | Yes: server |
| 4 | `04-verify.sh` | Checks the new version on the server | No |
| 5 | `05-smoke-test.sh` | Tests every feature, through the tunnel | Adds test data |
| — | `tunnel.sh` | Lets your computer use the deployed API | No |
| — | `rollback.sh` | Puts the old version back if needed | Yes: server |

---

## Before you start (one time only)

### 1. Install the tools on your computer

- **Git for Windows**, which includes Git Bash: https://git-scm.com
- **Go**, version 1.25 or newer: https://go.dev/dl
- **Python 3**: https://www.python.org/downloads. The scripts use it for small calculations.

All commands in this guide are typed into **Git Bash**, not PowerShell or CMD.

### 2. Get the code

```bash
git clone https://github.com/ShaneOCCS/Data-Vault.git
cd Data-Vault
git checkout phinees
cd vaultfinal
```

Run every script from this `vaultfinal` folder, the one that contains `go.mod`.

### 3. Fill in your settings

```bash
cp deploy/deploy.env.example deploy/deploy.env
```

Open `deploy/deploy.env` in a text editor and fill it in:

| Setting | What to put | Where to find it |
|---|---|---|
| `EC2_HOST` | Your server's public IP address | AWS console → EC2 → Instances → your instance → *Public IPv4 address* |
| `SSH_USER` | `ec2-user` (leave as is) | |
| `SSH_KEY` | Path to your `.pem` key file, e.g. `~/Downloads/vault-key.pem` | The key you downloaded when the server was created |
| `ADMIN_EMAIL` | The email you log in to the admin side with | |
| `DB_OWNER` | *(optional)* The database's **master username** | AWS console → RDS → your database → **Configuration** tab → *Master username* |
| `RDS_INSTANCE_ID` | *(optional)* Your database's name in RDS | AWS console → RDS → **Databases** (the *DB identifier* column) |

Don't commit `deploy.env` to git. It describes your server.

**If the server is stopped and started again**, AWS may give it a new public IP. Update `EC2_HOST` when that happens. An **Elastic IP** (EC2 → Elastic IPs) keeps the address fixed.

### 4. Have these passwords ready (you'll be asked for them)

- **Your admin password**, used by step 5.
- **The database master password**, used by step 2. This is the password chosen when the RDS database was created.

If nobody knows it, you can set a new one: AWS console → RDS → your database → **Modify** → *Master password*. This doesn't affect the app, which uses its own database account.

---

## Step 0: Check everything

```bash
./deploy/scripts/00-check.sh
```

**What it does:** checks your settings file, the tools on your computer, that the code builds and its tests pass, and that it can log in to the server. It also checks **how the current app is run on the server**, so the deployment replaces the right thing.

**You should see:** a list of `[ok]` lines ending with `All checks passed`.

**If it stops:**

| Message | Fix |
|---|---|
| `SSH key not found` | Fix `SSH_KEY` in `deploy.env`. |
| `SSH failed` | Check `EC2_HOST`. Also check that the server's **security group** allows **port 22 from your IP**: EC2 → your instance → **Security** tab → security group → **Edit inbound rules**. Your home IP may have changed since you last connected. |
| `Build or tests failed` | You're probably on the wrong branch. Run `git checkout phinees`. |
| `The medical-vault service does NOT run /opt/vaultfinal/server` | The app was set up differently the first time. See below. |
| `Port 8080 is used by something other than /opt/vaultfinal/server` | An old copy was started by hand and is still running. See below. |

### "I copied the project to the server before"

**That's fine.** The service runs one program file, `/opt/vaultfinal/server`. The deployment replaces only that file, so an old project folder in your home directory is simply ignored. Nothing in it is used, changed or deleted.

Step 0 checks three things for you:

1. **The `medical-vault` service runs `/opt/vaultfinal/server`.** If it runs something else, for example a program inside your copied folder, deploying would update a file nobody uses. The script stops before that can happen.
2. **Nothing else is using port 8080.** For example, a copy started by hand with `go run` in an SSH session that was left running. The new version couldn't start while the port is taken. To find and stop such a process, SSH in and run:
   ```bash
   sudo ss -ltnp 'sport = :8080'    # shows the program and its pid
   sudo kill <pid>
   ```
3. **Whether an old copy of the project exists.** If it does, the script just tells you where it is.

   **If that copy contains a `.env` file**, it may hold real passwords or keys. Delete that file once the new version works.

---

## Step 1: Back up

```bash
./deploy/scripts/01-backup.sh
```

**What it does:**

1. **Database snapshot.** If you filled in `RDS_INSTANCE_ID` and have the AWS CLI set up, the snapshot is taken automatically. Otherwise the script tells you exactly where to click in the AWS console and waits for you to confirm.
2. **Copy of the current server program.** Saved on the server as `server.prev`, so `rollback.sh` can bring it back in seconds.

**You should see:** `Backups done`.

Don't skip this step. Step 3 refuses to run without the backup.

---

## Step 2: Update the database

```bash
./deploy/scripts/02-migrate.sh
```

**What it does:** the new version adds one small rule to the database: admins must have a valid role. This script applies it. It runs the update **on the server**, because the database only accepts connections from inside AWS.

**It will ask you:**

1. **"Database owner user name"**, unless you set `DB_OWNER`. Enter the RDS master username.
2. **"Password"**: the master password. Your typing is hidden.
3. **"Is this the existing database that already has the app's tables?"** Answer **`y`**. Your database was originally set up by hand, so the script records the old setup as done instead of redoing it.

   You'll only see this question the first time.

**You should see:** a list where every line says `applied`, then `All migrations applied`.

**If it stops:**

| Message | Fix |
|---|---|
| `Could not read migration status. Wrong user name or password?` | Check the master username and password. Nothing was changed. |
| `must be owner of table` | That user doesn't own the tables. Use the master user. |
| `A migration failed and was rolled back` | Nothing was half-changed. Send the message above it to whoever maintains the code. |

---

## Step 3: Install the new version

```bash
./deploy/scripts/03-deploy.sh
```

**What it does:**
1. builds the new server program on your computer (all the code becomes one program file);
2. copies it to the server;
3. swaps it in for the old one at `/opt/vaultfinal/server`;
4. restarts the service.

The API is down for a few seconds during the restart.

Nothing else on the server is changed. The settings, secrets, service setup and any old project copy all stay as they are.

**You should see:** `listening on :8080 (env=production, kms=true)` and `New version deployed`.

**If it stops** with `The service did not start properly`, put the old version back right away:
```bash
./deploy/scripts/rollback.sh
```
Then send the log lines the script printed to whoever maintains the code.

---

## Step 4: Check it on the server

```bash
./deploy/scripts/04-verify.sh
```

**What it does:**
- checks that the service is running and has no errors in its log;
- makes two deliberately wrong login attempts from inside the server, and checks that the API refuses them;
- checks that those attempts were recorded in the audit log, which is new in this version;
- checks that the app's port 8080 is **not** reachable from the internet.

**You should see:** `Verification done`.

**About the port 8080 warning:** if you see `Port 8080 answered from the internet`, remove port 8080 from the security group's inbound rules. Keep **22 (SSH) open to your IP only**. The app is reached through the SSH tunnel instead.

---

## Step 5: Test everything

```bash
./deploy/scripts/05-smoke-test.sh
```

**What it does:**
1. Opens a **secure SSH tunnel** to the server (see the next section) and closes it again at the end.
2. Uses the API exactly like the frontend will, and prints **PASS** or **FAIL** for each of 28 checks:
   - **Admin:** logs in, refuses a batch of more than 1000 members, creates a test member with 4 keys.
   - **Member:** onboarding with an authenticator code, signup key can't be reused, login, session check.
   - **Records:** uploads a CSV, the member lists it and opens it.
   - **Recovery:** sets up a new authenticator with a recovery key.
   - **New protections:**
     - a short password is refused when accepting an invite, and the invite still works afterwards;
     - a disabled admin is locked out **immediately**, even with a session that's still valid.
   - **Audit log:** every one of those actions was recorded.

**It will ask** for your admin password (hidden) and for confirmation before creating test data.

**You should see:** `All 28 checks passed`.

**Test data it leaves behind:**
- **One test member** with one record. Its KIT ID is printed at the end.
- **One disabled test admin**, `smoke-…@example.invalid`.

The app can't delete data, by design, so these stay in the database. They're clearly marked as test data and are harmless.

The test pauses a few seconds between login-type calls on purpose. The API limits how fast one computer can try logins.

**This is the end of the deployment.** The new version is live on AWS and tested.

---

## Using the deployed API from your computer: the tunnel

### Why a tunnel?

Two rules in the backend stop you from just opening `http://<server-ip>:8080`:
- **Port 8080 is closed to the internet**, on purpose. The app should only be reached through a trusted path.
- **Login cookies are "secure cookies".** Browsers only keep them on `https://` addresses or on `localhost`.

An SSH tunnel solves both. It makes the app on the server appear at **`http://localhost:18080`** on your computer. The traffic travels inside your SSH connection, so it's encrypted, and because the address is `localhost`, logins work.

### Open it

```bash
./deploy/scripts/tunnel.sh
```

You'll see `The API is available at: http://localhost:18080/api`.

- **Leave that Git Bash window open** while you work. Press **Ctrl+C** to close the tunnel.
- **While it's open**, anything on your computer can use the real deployed API at that address: a browser, Postman, curl, or a frontend dev server.
- **Quick check:** open `http://localhost:18080/api/session/me` in a browser. It should show `{"error":"invalid credentials"}`, which means the API is answering, and you're simply not logged in.
- **If port 18080 is taken** on your computer: `TUNNEL_PORT=18081 ./deploy/scripts/tunnel.sh`.

The tunnel only works for people who have the server's SSH key. Letting others reach the API needs a public HTTPS address, which isn't set up yet.

---

## Connecting a frontend

**This needs a backend change first.** The backend doesn't allow browser requests from other addresses yet (it has no **CORS** support), so a frontend running at, say, `http://localhost:3000` can't call it.

The full guide is in **[`CORS.md`](../CORS.md)**: what to decide, what to change in the backend, what the frontend must send, and how to test it.

**In short, when it's time:**
1. **Find out the frontend's address(es):** where it runs during development, and where it will be deployed.
2. **Add CORS to the backend** for exactly those addresses (CORS.md, section 3).
3. **For development**, that's all. Run `tunnel.sh` and point the frontend at `http://localhost:18080`. Login cookies work because both sides are on `localhost`.
4. **For a deployed frontend**, the API needs HTTPS, plus the cookie and CSRF changes in CORS.md, sections 4–5.
5. **In the frontend**, every API call must send cookies: `credentials: 'include'` with fetch, `withCredentials: true` with axios.

Until then, use the smoke test, Postman or curl through the tunnel to try the API.

---

## Something went wrong? Roll back

```bash
./deploy/scripts/rollback.sh
```
This puts the previous server program back, using the copy from step 1, and restarts it. It takes seconds.

You normally **don't** need to undo the database change, because the old version works with it. If someone does tell you to undo it:
```bash
./deploy/scripts/rollback.sh --undo-migration
```

**If the database itself is damaged** (very unlikely): restore the snapshot from step 1. In the AWS console, go to RDS → **Snapshots** → your snapshot → **Actions → Restore snapshot**. This creates a new database, so it needs someone comfortable with AWS.

---

## Words used in this guide

| Term | Meaning |
|---|---|
| **EC2 instance** | The virtual server on AWS that runs the backend. |
| **RDS** | The AWS-managed PostgreSQL database. |
| **Security group** | AWS's firewall for the server: which ports are open, and to whom. |
| **SSH tunnel** | A private, encrypted connection that makes a port on the server appear on your own computer. |
| **Migration** | A versioned change to the database structure. |
| **Baseline** | Telling the migration tool "these older changes were already made by hand; don't run them again". |
| **Smoke test** | A quick run through every main feature to check nothing is broken. |
| **Elastic IP** | A fixed public IP address for the server, so it doesn't change when the server restarts. |
| **CORS** | The browser rule that decides whether a web page on one address may call an API on another. See `CORS.md`. |

---

## Checklist

- [ ] Tools installed; code on the `phinees` branch
- [ ] `deploy/deploy.env` filled in
- [ ] Step 0 `00-check.sh`: all checks passed
- [ ] Step 1 `01-backup.sh`: snapshot **Available**, `server.prev` saved
- [ ] Step 2 `02-migrate.sh`: all migrations applied
- [ ] Step 3 `03-deploy.sh`: new version running
- [ ] Step 4 `04-verify.sh`: passed; port 8080 closed to the internet
- [ ] Step 5 `05-smoke-test.sh`: all 28 checks passed
- [ ] `tunnel.sh` works: `http://localhost:18080/api/session/me` answers
- [ ] *When the frontend is ready:* follow `CORS.md`

> The older `deploy/deploy.sh` still works. `03-deploy.sh` replaces it, and also requires the backup and checks that the new version started.
