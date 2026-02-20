# BhulekhChain - National Blockchain Property Register

A hybrid multi-chain national land registry platform for India, combining Hyperledger Fabric (core government records), Algorand (public verification), and Polygon (tokenization).

## Architecture

| Chain | Role |
|-------|------|
| **Hyperledger Fabric 2.5+** | Core government registry - all land records, transfers, mutations |
| **Algorand** | Public verification layer - state proofs, title verification ASAs |
| **Polygon PoS** | Tokenization - ERC-721 title deed NFTs, ERC-1155 fractional ownership |

## Prerequisites

- Docker Desktop 4.x+ (Docker Engine 24+, Compose V2)
- Node.js 20 LTS
- Go 1.21+
- Python 3.11+
- Hyperledger Fabric binaries

## Quick Start

```bash
# One-command setup
bash infrastructure/scripts/setup-dev.sh

# Or manually:

# Start infrastructure
cd infrastructure && docker compose -f docker/docker-compose.dev.yaml up -d

# Start backend
cd backend && npm install && npm run dev

# Start frontend
cd frontend && npm install && npm run dev
```

## Project Structure

```
bhulekh-chain/
├── blockchain/
│   ├── fabric/          # Hyperledger Fabric chaincode (Go)
│   ├── algorand/        # Algorand smart contracts (Python)
│   └── polygon/         # Polygon smart contracts (Solidity)
├── backend/             # Node.js + Express + TypeScript API
├── frontend/            # Next.js 14 web portal
├── infrastructure/      # Docker, K8s, Terraform configs
├── tests/               # Integration & E2E tests
└── docs/                # Architecture & API documentation
```

## Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `http://localhost:3001` | Backend API |
| `http://localhost:3000` | Frontend Portal |
| `http://localhost:8080` | Fabric Explorer |
| `http://localhost:9090` | Prometheus |
| `http://localhost:3002` | Grafana |

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API Specification](docs/API_SPEC.md)
- [Data Models](docs/DATA_MODELS.md)
- [Smart Contracts](docs/SMART_CONTRACTS.md)
- [Security](docs/SECURITY.md)
- [Infrastructure](docs/INFRASTRUCTURE.md)
- [Development Guide](docs/DEVELOPMENT_GUIDE.md)

## License

Apache 2.0 - see [LICENSE](LICENSE)
