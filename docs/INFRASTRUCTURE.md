# INFRASTRUCTURE.md — BhulekhChain DevOps & Deployment

## 1. Development Environment (Docker Compose)

### Prerequisites
```bash
# Required
- Docker Desktop 4.x+ (Docker Engine 24+, Compose V2)
- Node.js 20 LTS
- Go 1.21+
- Python 3.11+
- Flutter 3.x (for mobile)

# Recommended
- VS Code with extensions: Go, ESLint, Prisma, Docker, Solidity
- Hyperledger Fabric binaries (peer, orderer, configtxgen, cryptogen)
- AlgoKit CLI
- Hardhat (npx)
```

### One-Command Setup
```bash
#!/bin/bash
# scripts/setup-dev.sh

set -e

echo "🏗️  Setting up BhulekhChain development environment..."

# 1. Install Fabric binaries and Docker images
curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh docker binary

# 2. Generate crypto material
cd blockchain/fabric/network
cryptogen generate --config=crypto-config.yaml --output=crypto-material

# 3. Generate channel artifacts
configtxgen -profile TwoOrgOrdererGenesis -channelID system-channel -outputBlock ./channel-artifacts/genesis.block
configtxgen -profile LandRegistryChannel -outputCreateChannelTx ./channel-artifacts/channel.tx -channelID land-registry-channel

# 4. Start all services
cd ../../../infrastructure
docker compose -f docker/docker-compose.dev.yaml up -d

# 5. Wait for Fabric network
echo "⏳ Waiting for Fabric network to start..."
sleep 15

# 6. Create channel and join peers
cd ../blockchain/fabric/network/scripts
./create-channel.sh
./join-channel.sh
./deploy-chaincode.sh land-registry
./deploy-chaincode.sh stamp-duty

# 7. Setup backend
cd ../../../../backend
npm install
cp .env.example .env
npx prisma migrate dev
npx prisma db seed

# 8. Setup frontend
cd ../frontend
npm install

# 9. Setup Algorand localnet
cd ../blockchain/algorand
pip install -r requirements.txt --break-system-packages
algokit localnet start

# 10. Setup Polygon (Hardhat local)
cd ../polygon
npm install

echo "✅ BhulekhChain dev environment ready!"
echo "   Backend: http://localhost:3001"
echo "   Frontend: http://localhost:3000"
echo "   Fabric Explorer: http://localhost:8080"
echo "   Algorand localnet: http://localhost:4001"
```

### docker-compose.dev.yaml Structure
```yaml
# infrastructure/docker/docker-compose.dev.yaml

services:
  # ============ FABRIC NETWORK ============
  orderer.bhulekhchain.dev:
    image: hyperledger/fabric-orderer:2.5
    environment:
      - ORDERER_GENERAL_LISTENADDRESS=0.0.0.0
      - ORDERER_GENERAL_BOOTSTRAPMETHOD=file
      - ORDERER_GENERAL_BOOTSTRAPFILE=/var/hyperledger/orderer/orderer.genesis.block
      - ORDERER_GENERAL_LOCALMSPID=OrdererMSP
      - ORDERER_GENERAL_TLS_ENABLED=true
    ports:
      - "7050:7050"
    volumes:
      - ../../blockchain/fabric/network/channel-artifacts/genesis.block:/var/hyperledger/orderer/orderer.genesis.block
      - ../../blockchain/fabric/network/crypto-material/ordererOrganizations/bhulekhchain.dev/orderers/orderer.bhulekhchain.dev/msp:/var/hyperledger/orderer/msp
      - ../../blockchain/fabric/network/crypto-material/ordererOrganizations/bhulekhchain.dev/orderers/orderer.bhulekhchain.dev/tls:/var/hyperledger/orderer/tls

  peer0.revenue.bhulekhchain.dev:
    image: hyperledger/fabric-peer:2.5
    environment:
      - CORE_PEER_ID=peer0.revenue.bhulekhchain.dev
      - CORE_PEER_ADDRESS=peer0.revenue.bhulekhchain.dev:7051
      - CORE_PEER_LOCALMSPID=RevenueOrgMSP
      - CORE_PEER_TLS_ENABLED=true
      - CORE_LEDGER_STATE_STATEDATABASE=CouchDB
      - CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS=couchdb.revenue:5984
    ports:
      - "7051:7051"
    depends_on:
      - orderer.bhulekhchain.dev
      - couchdb.revenue

  peer0.bank.bhulekhchain.dev:
    image: hyperledger/fabric-peer:2.5
    environment:
      - CORE_PEER_ID=peer0.bank.bhulekhchain.dev
      - CORE_PEER_ADDRESS=peer0.bank.bhulekhchain.dev:9051
      - CORE_PEER_LOCALMSPID=BankOrgMSP
      - CORE_LEDGER_STATE_STATEDATABASE=CouchDB
      - CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS=couchdb.bank:5984
    ports:
      - "9051:9051"
    depends_on:
      - orderer.bhulekhchain.dev
      - couchdb.bank

  couchdb.revenue:
    image: couchdb:3.3
    environment:
      - COUCHDB_USER=admin
      - COUCHDB_PASSWORD=adminpw
    ports:
      - "5984:5984"

  couchdb.bank:
    image: couchdb:3.3
    environment:
      - COUCHDB_USER=admin
      - COUCHDB_PASSWORD=adminpw
    ports:
      - "7984:5984"

  fabric-ca.revenue:
    image: hyperledger/fabric-ca:1.5
    environment:
      - FABRIC_CA_HOME=/etc/hyperledger/fabric-ca-server
      - FABRIC_CA_SERVER_CA_NAME=ca-revenue
    ports:
      - "7054:7054"

  # ============ DATA LAYER ============
  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: bhulekhchain
      POSTGRES_USER: bhulekh
      POSTGRES_PASSWORD: devpassword
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  ipfs:
    image: ipfs/kubo:latest
    ports:
      - "5001:5001"  # API
      - "8081:8080"  # Gateway
    volumes:
      - ipfsdata:/data/ipfs

  # ============ MONITORING ============
  explorer:
    image: hyperledger/explorer:latest
    environment:
      - DATABASE_HOST=explorerdb
      - DATABASE_DATABASE=fabricexplorer
      - DATABASE_USERNAME=hppoc
      - DATABASE_PASSWD=password
    ports:
      - "8080:8080"
    depends_on:
      - explorerdb
      - peer0.revenue.bhulekhchain.dev

  explorerdb:
    image: hyperledger/explorer-db:latest
    environment:
      - DATABASE_DATABASE=fabricexplorer
      - DATABASE_USERNAME=hppoc
      - DATABASE_PASSWD=password

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3002:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin

  # ============ AUTH ============
  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    command: start-dev
    ports:
      - "8180:8080"

volumes:
  pgdata:
  ipfsdata:
```

---

## 2. Production Kubernetes Architecture

```
NAMESPACE LAYOUT:
├── bhulekh-fabric          # Fabric peers, orderers, CAs
├── bhulekh-app             # Backend, frontend, workers
├── bhulekh-data            # PostgreSQL, Redis, IPFS
├── bhulekh-auth            # Keycloak, Vault
├── bhulekh-monitoring      # Prometheus, Grafana, Loki, Explorer
├── bhulekh-ingress         # Kong API Gateway, cert-manager
└── bhulekh-jobs            # CronJobs (anchoring, backup, sync)
```

### Key K8s Resources

```yaml
# k8s/backend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bhulekh-backend
  namespace: bhulekh-app
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: bhulekh-backend
  template:
    metadata:
      labels:
        app: bhulekh-backend
    spec:
      serviceAccountName: bhulekh-backend-sa
      containers:
        - name: backend
          image: registry.bhulekhchain.gov.in/backend:latest
          ports:
            - containerPort: 3001
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          env:
            - name: NODE_ENV
              value: "production"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: bhulekh-db-secrets
                  key: database-url
          livenessProbe:
            httpGet:
              path: /v1/admin/health
              port: 3001
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /v1/admin/health
              port: 3001
            initialDelaySeconds: 5
            periodSeconds: 5
          volumeMounts:
            - name: fabric-crypto
              mountPath: /crypto
              readOnly: true
      volumes:
        - name: fabric-crypto
          secret:
            secretName: fabric-user-crypto
```

```yaml
# k8s/jobs/anchoring-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: algorand-anchoring
  namespace: bhulekh-jobs
spec:
  schedule: "*/5 * * * *"  # Every 5 minutes
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: anchor-worker
              image: registry.bhulekhchain.gov.in/anchor-worker:latest
              env:
                - name: ALGORAND_NETWORK
                  value: "mainnet"
                - name: ALGORAND_APP_ID
                  valueFrom:
                    secretKeyRef:
                      name: algorand-secrets
                      key: app-id
          restartPolicy: OnFailure
      backoffLimit: 3
```

---

## 3. CI/CD Pipeline (GitHub Actions → ArgoCD)

```yaml
# .github/workflows/ci.yml
name: BhulekhChain CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  # ====== CHAINCODE TESTS ======
  chaincode-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.21'
      - name: Test land-registry chaincode
        run: |
          cd blockchain/fabric/chaincode/land-registry
          go test -v -race -coverprofile=coverage.out ./...
      - name: Lint chaincode
        run: |
          cd blockchain/fabric/chaincode/land-registry
          golangci-lint run

  # ====== BACKEND TESTS ======
  backend-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_DB: bhulekhchain_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install & test
        run: |
          cd backend
          npm ci
          npx prisma migrate deploy
          npm run test:ci
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/bhulekhchain_test
          REDIS_URL: redis://localhost:6379

  # ====== SOLIDITY TESTS ======
  polygon-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Test Polygon contracts
        run: |
          cd blockchain/polygon
          npm ci
          npx hardhat test
      - name: Slither analysis
        uses: crytic/slither-action@v0.3.0
        with:
          sarif: results.sarif
          solc-version: 0.8.20
          target: blockchain/polygon/

  # ====== ALGORAND TESTS ======
  algorand-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Test Algorand contracts
        run: |
          cd blockchain/algorand
          pip install -r requirements.txt
          pytest tests/ -v

  # ====== SECURITY SCAN ======
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: npm audit
        run: cd backend && npm audit --audit-level=high
      - name: Snyk scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  # ====== BUILD & PUSH ======
  build:
    needs: [chaincode-test, backend-test, polygon-test, algorand-test, security-scan]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build & push Docker images
        run: |
          docker build -f infrastructure/docker/Dockerfile.backend -t registry.bhulekhchain.gov.in/backend:${{ github.sha }} .
          docker build -f infrastructure/docker/Dockerfile.frontend -t registry.bhulekhchain.gov.in/frontend:${{ github.sha }} .
          docker push registry.bhulekhchain.gov.in/backend:${{ github.sha }}
          docker push registry.bhulekhchain.gov.in/frontend:${{ github.sha }}
      - name: Update ArgoCD manifest
        run: |
          # Update image tags in k8s manifests
          sed -i "s|backend:.*|backend:${{ github.sha }}|" k8s/backend/deployment.yaml
          sed -i "s|frontend:.*|frontend:${{ github.sha }}|" k8s/frontend/deployment.yaml
          git add k8s/
          git commit -m "deploy: update images to ${{ github.sha }}"
          git push
```

---

## 4. Backup Strategy

```bash
#!/bin/bash
# infrastructure/scripts/backup.sh

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/bhulekhchain/${TIMESTAMP}"
S3_BUCKET="s3://bhulekhchain-backups"

mkdir -p ${BACKUP_DIR}

# 1. PostgreSQL backup
echo "📦 Backing up PostgreSQL..."
pg_dump -h postgres -U bhulekh -F c -f ${BACKUP_DIR}/postgres.dump bhulekhchain
gpg --encrypt --recipient backup@bhulekhchain.gov.in ${BACKUP_DIR}/postgres.dump

# 2. Fabric peer snapshots
echo "📦 Snapshotting Fabric ledger..."
for PEER in peer0.revenue peer1.revenue; do
  docker exec ${PEER} peer snapshot submitrequest \
    --channelID land-registry-channel \
    --blockNumber latest \
    --peerAddress ${PEER}:7051
done

# 3. CouchDB backup
echo "📦 Backing up CouchDB..."
for DB in land-registry-channel_land-registry; do
  curl -s http://admin:adminpw@couchdb.revenue:5984/${DB}/_all_docs?include_docs=true \
    | gzip > ${BACKUP_DIR}/couchdb_${DB}.json.gz
done

# 4. Redis RDB snapshot
echo "📦 Backing up Redis..."
redis-cli -h redis BGSAVE
sleep 5
cp /data/redis/dump.rdb ${BACKUP_DIR}/redis.rdb

# 5. Vault backup
echo "📦 Backing up Vault..."
vault operator raft snapshot save ${BACKUP_DIR}/vault-snapshot.snap

# 6. Upload to S3
echo "☁️  Uploading to S3..."
aws s3 sync ${BACKUP_DIR} ${S3_BUCKET}/${TIMESTAMP}/ --sse AES256

# 7. Cleanup old backups (keep 30 days)
find /backups/bhulekhchain -type d -mtime +30 -exec rm -rf {} +

echo "✅ Backup complete: ${TIMESTAMP}"
```

---

## 5. Monitoring Dashboard

### Key Metrics to Track

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| Fabric block height | Fabric peer | Stale > 5 min |
| Fabric TPS | Fabric peer metrics | < 10 in peak hours |
| Fabric peer status | Fabric gossip | Any peer unreachable |
| API response time (p99) | Prometheus/Kong | > 2 seconds |
| API error rate | Prometheus | > 1% of requests |
| PostgreSQL connections | pg_stat | > 80% of max |
| PostgreSQL replication lag | pg_stat_replication | > 30 seconds |
| Redis memory usage | Redis INFO | > 80% of max |
| IPFS pin count | IPFS API | Disk > 80% |
| Algorand anchoring gap | Custom metric | > 15 min since last anchor |
| Algorand anchor verification | Custom metric | Any failed verification |
| Certificate expiry | cert-manager | < 14 days to expiry |
| Vault seal status | Vault API | Any sealed node |
| BullMQ failed jobs | BullMQ metrics | > 0 in dead-letter |
| Node.js memory | process metrics | > 1.5GB |
| K8s pod restarts | kube_pod_restart | > 3 in 1 hour |

### Grafana Dashboard Layout
```
Row 1: System Health
  [Fabric Network Status] [API Uptime] [Active Users] [Transactions Today]

Row 2: Blockchain Metrics  
  [Block Height Graph] [TPS Over Time] [Chaincode Invoke Latency] [Endorsement Success Rate]

Row 3: Application Performance
  [API Response Time p50/p95/p99] [Request Rate] [Error Rate] [Top Endpoints]

Row 4: Cross-Chain
  [Algorand Anchor Status] [Last Anchor Time] [Algorand Verification Status] [Polygon Gas Cost]

Row 5: Data Layer
  [PostgreSQL Connections] [Query Latency] [Redis Hit Rate] [IPFS Storage Used]
```