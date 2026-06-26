# narratorlog — Self-Host Setup

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

```bash
docker compose -f deploy/docker-compose.yml run --rm \
  -e DATABASE_URL=$DATABASE_URL \
  api sh -c "migrate -path /migrations -database $DATABASE_URL up"
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