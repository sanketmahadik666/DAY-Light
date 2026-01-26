# Deployment Guide

## Production Deployment

### Prerequisites

- Docker & Docker Compose
- Kubernetes cluster (optional, for production)
- MongoDB Atlas account or self-hosted MongoDB
- Cloudinary account
- Domain name with DNS access

### Step 1: Infrastructure Setup

#### MongoDB

**Option A: MongoDB Atlas (Recommended)**
1. Create account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create cluster (free tier available)
3. Get connection string
4. Whitelist IP addresses

**Option B: Self-Hosted**
```bash
# Deploy MongoDB replica set
kubectl apply -f k8s/mongodb.yaml
```

#### MinIO

**Option A: MinIO Server (Self-Hosted)**
```bash
# Deploy MinIO cluster
kubectl apply -f k8s/minio.yaml
```

**Option B: MinIO Operator**
```bash
# Install MinIO Operator
kubectl apply -f https://github.com/minio/operator/releases/latest/download/minio-operator.yaml
```

#### Redis

**Option A: Redis Cloud**
1. Create account at [Redis Cloud](https://redis.com/try-free/)
2. Create database
3. Get connection string

**Option B: Self-Hosted**
```bash
# Deploy Redis
kubectl apply -f k8s/redis.yaml
```

### Step 2: Service Deployment

#### Using Docker Compose (Development/Staging)

```bash
# Copy environment file
cp services/.env.example services/.env

# Edit environment variables
nano services/.env

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f
```

#### Using Kubernetes (Production)

```bash
# Create namespace
kubectl create namespace daylight

# Create secrets
kubectl create secret generic daylight-secrets \
  --from-env-file=services/.env \
  -n daylight

# Deploy services
kubectl apply -f k8s/metadata-service.yaml
kubectl apply -f k8s/storage-service.yaml

# Check status
kubectl get pods -n daylight
```

### Step 3: Edge Deployment

#### Vercel Edge Functions

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Configure edge functions in vercel.json
```

#### Cloudflare Workers

```bash
# Install Wrangler
npm i -g wrangler

# Deploy
wrangler publish
```

### Step 4: CDN Configuration

#### Cloudflare

1. Add domain to Cloudflare
2. Configure DNS records
3. Enable CDN caching
4. Configure page rules for `/api/*`

#### Vercel

1. Connect repository
2. Configure environment variables
3. Deploy
4. CDN automatically enabled

### Step 5: Monitoring

#### Prometheus + Grafana

```bash
# Deploy Prometheus
kubectl apply -f k8s/prometheus.yaml

# Deploy Grafana
kubectl apply -f k8s/grafana.yaml

# Access Grafana
kubectl port-forward svc/grafana 3000:3000
```

#### Health Checks

All services expose `/health` endpoint:

```bash
# Metadata Service
curl http://metadata-service:3001/health

# Storage Service
curl http://storage-service:3002/health
```

### Step 6: Backup Strategy

#### MongoDB Backup

```bash
# Automated backup script
#!/bin/bash
mongodump --uri="$MONGODB_URI" --out=/backups/$(date +%Y%m%d)
```

#### MinIO Backup

```bash
# Replicate to secondary MinIO cluster
mc mirror myminio/daylight-storage backup-minio/daylight-storage
```

### Step 7: Scaling

#### Horizontal Scaling

```yaml
# k8s/metadata-service.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: metadata-service
spec:
  replicas: 3  # Scale to 3 instances
  template:
    spec:
      containers:
      - name: metadata-service
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 2Gi
```

#### Auto-Scaling

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: metadata-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: metadata-service
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## Environment-Specific Configurations

### Development

```env
NODE_ENV=development
LOG_LEVEL=debug
FALLBACK_ENABLED=true
PRIMARY_PROVIDER=minio
```

### Staging

```env
NODE_ENV=staging
LOG_LEVEL=info
FALLBACK_ENABLED=true
PRIMARY_PROVIDER=minio
```

### Production

```env
NODE_ENV=production
LOG_LEVEL=warn
FALLBACK_ENABLED=true
PRIMARY_PROVIDER=minio
CDN_ENABLED=true
```

## Security Checklist

- [ ] Enable TLS/SSL for all services
- [ ] Configure firewall rules
- [ ] Set up authentication (JWT)
- [ ] Enable rate limiting
- [ ] Configure CORS properly
- [ ] Use secrets management (Vault/AWS Secrets Manager)
- [ ] Enable audit logging
- [ ] Regular security updates
- [ ] Network policies (Kubernetes)
- [ ] Image scanning (Trivy/Clair)

## Cost Optimization

1. **MinIO**: Self-hosted, minimal cost
2. **Cloudinary**: Use only for edge delivery, optimize images
3. **MongoDB Atlas**: Use free tier for development
4. **CDN**: Cloudflare free tier or Vercel included
5. **Auto-scaling**: Scale down during low traffic

## Troubleshooting

### Service Not Starting

```bash
# Check logs
docker-compose logs metadata-service

# Check health
curl http://localhost:3001/health
```

### Storage Issues

```bash
# Check MinIO
mc admin info myminio

# Check Cloudinary
curl https://api.cloudinary.com/v1_1/{cloud_name}/resources/image
```

### Database Connection Issues

```bash
# Test MongoDB connection
mongosh "$MONGODB_URI"

# Check indexes
db.facts.getIndexes()
```
