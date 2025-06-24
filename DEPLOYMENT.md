# Deployment Guide

## GitHub Repository Setup

1. Create a new repository on GitHub:
   ```bash
   gh repo create opencall --public --source=. --remote=origin
   ```

2. Push the code:
   ```bash
   git remote add origin https://github.com/ardaerturk/opencall.git
   git branch -M main
   git push -u origin main
   ```

3. Configure repository settings:
   - Enable GitHub Actions
   - Enable Dependabot security updates
   - Set up branch protection for `main`
   - Enable issues and discussions

## Local Development

```bash
# Clone the repository
git clone https://github.com/ardaerturk/opencall.git
cd opencall

# Install dependencies
pnpm install

# Start development
docker-compose up -d
pnpm dev
```

## Production Deployment

### Using Docker

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

### Manual Deployment

1. Build all packages:
   ```bash
   pnpm build
   ```

2. Deploy client to CDN (Vercel, Netlify, etc.)
3. Deploy server to cloud provider
4. Set up TURN servers
5. Configure IPFS nodes

## Environment Variables

Required environment variables for production:

```env
# Server
NODE_ENV=production
PORT=4000

# WebRTC
MEDIASOUP_ANNOUNCED_IP=<your-public-ip>
TURN_SERVER_URL=<your-turn-server>

# SKALE (when ready)
SKALE_ENDPOINT=<your-skale-endpoint>
SKALE_PRIVATE_KEY=<your-private-key>
```

## Monitoring

- Health check: `GET /health`
- Metrics: Prometheus endpoint at `/metrics`
- Logs: Structured JSON logging with pino