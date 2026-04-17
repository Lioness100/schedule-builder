# UMass Schedule Builder Reverse Proxy

Local reverse-proxy to UMass Schedule Builder API with automatically refreshing authentication.

## Configuration

Edit `.env` with your credentials:

```bash
# Required
UMASS_EMAIL=youremail@umass.edu
UMASS_PASSWORD=your_password

# Optional (shown with defaults)
PORT=3007
KEEPALIVE_INTERVAL=45000
COOKIE_PATH=.cache/cookies.json
BROWSER_DATA_DIR=.browser-data
ENABLED=true # Set to false to disable the proxy (will still serve static files and health endpoint)

# API Security (leave empty for no authentication)
# Generate: openssl rand -base64 32
API_KEY=your_secure_key_here
```

## Usage

### With Docker

```bash
# Start the service
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f

# Stop the service
docker compose down

# Rebuild after code changes
docker compose up -d --build
```

### With Bun

```bash
# Install dependencies
bun install

# Start the reverse proxy server
bun start

# Or extract cookies only
bun cookies
```

## API Usage

Once the reverse proxy server is running:

```bash
# Public endpoints (no auth required)
curl http://localhost:3007/health
curl http://localhost:3007/api/terms

# Protected endpoints (requires API key if configured)
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3007/api/terms/Spring%202026/courses
```

## Inspiration

This project was inspired by [@cougargrades/collegescheduler](https://github.com/cougargrades/collegescheduler), which provides similar functionality for the University of Houston's CollegeScheduler system.
