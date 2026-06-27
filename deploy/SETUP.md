# narratorlog — Self-Host Setup

> **Just want to try it locally?** Skip this entire guide and run one command from
> the repo root: `docker compose -f deploy/docker-compose.quickstart.yml up --build`,
> then open http://localhost:3000. The steps below are for a real production
> deployment behind nginx with TLS.

## Prerequisites

- Docker and Docker Compose
- A domain name pointed at your server
- GitHub OAuth App credentials

## 1. Clone the repo

```bash
git clone https://github.com/qShipyard/narratorlog.git
cd narratorlog
```

## 2. Configure environment

```bash
cp deploy/.env.example .env
```

Edit `.env` and fill in every value. Generate secrets with:

```bash
openssl rand -hex 32   # use twice — once for APP_SECRET, once for ENCRYPTION_KEY
```

## 3. Create a GitHub OAuth App

Go to: https://github.com/settings/developers → New OAuth App

- Homepage URL: `https://your-domain.com`
- Callback URL: `https://your-domain.com/auth/github/callback`

Copy the Client ID and Client Secret into `.env`.

## 4. Run migrations

This runs the bundled `migrate` service (golang-migrate) against the `postgres`
service, applying every migration in `apps/api/internal/db/migrations`. It reads
`DATABASE_URL` from your `.env`, so make sure that points at the `postgres` host
(e.g. `postgresql://narratorlog:...@postgres:5432/narratorlog?sslmode=disable`).

```bash
docker compose -f deploy/docker-compose.yml run --rm migrate
```

## 5. Start

```bash
docker compose -f deploy/docker-compose.yml up -d
```

## 6. Verify

```bash
curl https://your-domain.com/health
# {"status":"ok","version":"0.1.0"}
```

## Updates

```bash
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d
```