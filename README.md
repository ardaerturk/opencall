# Decentralized Meeting Platform

Open source, peer-to-peer video conferencing with end-to-end encryption and no infrastructure costs.

## Features

- End-to-end encrypted group video calls using MLS protocol
- P2P connections for small meetings (≤3 participants)
- Automatic scaling to SFU for larger groups
- Zero-knowledge authentication with SRP
- Decentralized file sharing via IPFS
- No account required - instant meetings
- Runs on SKALE blockchain with no transaction fees

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite, PWA
- **Backend**: Node.js, Fastify, mediasoup
- **P2P Network**: libp2p, WebRTC
- **Blockchain**: SKALE Network, Solidity
- **Encryption**: MLS Protocol, WebCrypto API
- **Storage**: IPFS for decentralized file sharing

## Getting Started

### Requirements

- Node.js 18+
- pnpm 8+
- Docker and Docker Compose
- Rust (for WebAssembly compilation)

### Installation

```bash
git clone https://github.com/ardaerturk/decentralized-meeting-platform.git
cd decentralized-meeting-platform
```

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env

# Start services
docker-compose up -d

# Run development servers
pnpm dev
```

Access the application at http://localhost:3000

## Architecture

- **Frontend**: React PWA with TypeScript
- **Communication**: WebRTC with automatic P2P/SFU switching
- **Encryption**: MLS protocol (compiled to WebAssembly)
- **Networking**: libp2p for peer discovery
- **Storage**: IPFS for decentralized file sharing
- **Blockchain**: SKALE Network for zero-fee operations

## Project Structure

```
decentralized-meeting-platform/
├── packages/
│   ├── core/          # Shared types, utilities, crypto primitives
│   ├── client/        # React PWA frontend
│   ├── server/        # Node.js coordination services
│   ├── contracts/     # SKALE smart contracts
│   └── protocol/      # libp2p protocols and MLS implementation
├── docker/            # Docker configurations
├── docs/              # Documentation
└── scripts/           # Build and deployment scripts
```

## Security Features

- **Military-Grade Encryption**: AES-256-GCM, ECDH P-384, SHA-384
- **Zero-Knowledge Proofs**: SRP protocol for authentication
- **MLS Protocol**: Forward secrecy and post-compromise security
- **No Central Authority**: Fully decentralized architecture
- **Client-Side Encryption**: All encryption happens in the browser

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- TypeScript with strict mode enabled
- ESLint + Prettier for formatting
- Conventional commits
- 80%+ test coverage required

## Testing

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Test coverage
pnpm test:coverage
```

## Development

### Running Specific Services

```bash
# Client only
pnpm --filter @dmp/client dev

# Server only
pnpm --filter @dmp/server dev

# Build all packages
pnpm build
```

### Building for Production

```bash
# Build all packages
pnpm build

# Run production build
docker-compose -f docker-compose.prod.yml up
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Security

For security issues, please email security@[domain] instead of using the issue tracker.

See [SECURITY.md](SECURITY.md) for details.

## Support

- [Issues](https://github.com/ardaerturk/decentralized-meeting-platform/issues)
- [Discussions](https://github.com/ardaerturk/decentralized-meeting-platform/discussions)