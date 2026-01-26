# DAY-LIGHT Microservices Architecture

## Overview

Enterprise-grade microservices architecture designed for edge computing scenarios with MinIO object storage, MongoDB metadata, and Cloudinary fallback.

## Architecture Principles

1. **Resilience**: Automatic fallback between storage providers
2. **Scalability**: Horizontal scaling of services
3. **Edge-First**: CDN and edge function support
4. **Cost Optimization**: MinIO for primary storage, Cloudinary for edge delivery
5. **Data Integrity**: MongoDB for transactional metadata, object storage for assets

## Service Details

### Metadata Service

**Technology**: Node.js + Express + MongoDB + Mongoose

**Endpoints**:
- `GET /api/facts?date=YYYY-MM-DD` - Get facts for date
- `GET /api/facts/:id` - Get single fact
- `POST /api/facts` - Create fact
- `PUT /api/facts/:id` - Update fact
- `DELETE /api/facts/:id` - Delete fact
- `GET /api/facts/search?q=query` - Search facts
- `GET /api/slides?date=YYYY-MM-DD` - Get slides for date
- `POST /api/slides` - Create slide

**Database Indexes**:
- `date` + `category` (compound)
- `date` + `year` (compound)
- `title` + `description` (text search)
- `factId` + `renderVersion` (for slides)

### Storage Service

**Technology**: Node.js + Express + MinIO SDK + Cloudinary SDK

**Endpoints**:
- `POST /api/upload` - Upload file
- `GET /api/files/:key` - Get file URL
- `DELETE /api/files/:key` - Delete file
- `GET /api/files/:key/exists` - Check file existence
- `POST /api/files/:key/thumbnail` - Generate thumbnail

**Storage Strategy**:
1. Try MinIO (primary)
2. Fallback to Cloudinary if MinIO fails
3. Store references in MongoDB for redundancy

### Image Service

**Technology**: Node.js + Express + Sharp (image processing)

**Endpoints**:
- `POST /api/transform` - Transform image
- `GET /api/optimize?url=...&width=...&height=...` - Optimize image
- `POST /api/generate-thumbnail` - Generate thumbnail

## Data Flow

### Creating a Slide

1. **Client** → **Metadata Service**: Create fact document
2. **Metadata Service** → **MongoDB**: Store fact metadata
3. **Client** → **Storage Service**: Upload image
4. **Storage Service** → **MinIO**: Upload image (primary)
5. **Storage Service** → **Cloudinary**: Upload image (fallback, async)
6. **Storage Service** → **Metadata Service**: Update fact with storage refs
7. **Metadata Service** → **MongoDB**: Update fact document

### Retrieving a Slide

1. **Client** → **Metadata Service**: Get fact by ID
2. **Metadata Service** → **MongoDB**: Query fact
3. **Metadata Service** → **Client**: Return fact with storage refs
4. **Client** → **Storage Service**: Get file URL
5. **Storage Service** → **MinIO/Cloudinary**: Generate presigned URL
6. **Storage Service** → **Client**: Return URL

### Edge Computing Flow

1. **Edge Function** (Vercel/Cloudflare) receives request
2. Check **Redis** cache at edge
3. If miss, query **Metadata Service** (with edge caching)
4. Get file URL from **Storage Service**
5. Serve from **CDN** (Cloudflare/Vercel) if available
6. Fallback to **Cloudinary** for edge delivery
7. Cache result in **Redis** at edge

## Storage Schema

### MinIO Bucket Structure

```
daylight-storage/
├── facts/
│   └── {date}/
│       └── {factId}/
│           ├── original.{ext}
│           ├── thumbnail-400x300.{ext}
│           ├── thumbnail-800x600.{ext}
│           └── metadata.json
├── slides/
│   └── {date}/
│       └── {slideId}/
│           ├── slide.json
│           └── assets/
└── cache/
    └── {hash}/
```

### MongoDB Collections

**facts**:
- Indexed by: `date`, `category`, `id`, `searchText`
- Contains: Fact metadata, storage references

**slides**:
- Indexed by: `slideId`, `factId`, `date`
- Contains: Slide composition, asset references

**storage_refs**:
- Indexed by: `objectKey`, `factId`, `slideId`
- Contains: MinIO and Cloudinary references

## Deployment

### Local Development

```bash
docker-compose up -d
```

### Production

1. **MongoDB**: Managed MongoDB Atlas or self-hosted
2. **MinIO**: Self-hosted cluster or MinIO Server
3. **Cloudinary**: Cloudinary account
4. **Redis**: Redis Cloud or self-hosted
5. **Services**: Deploy to Kubernetes, Docker Swarm, or serverless

### Edge Deployment

- **Vercel Edge Functions**: For Next.js integration
- **Cloudflare Workers**: For edge routing
- **CDN**: Cloudflare or Vercel CDN

## Monitoring

- **Health Checks**: `/health` endpoint on all services
- **Metrics**: Prometheus metrics
- **Logging**: Structured logging (Winston/Pino)
- **Tracing**: OpenTelemetry for distributed tracing

## Security

- **Authentication**: JWT tokens for service-to-service
- **Authorization**: Role-based access control
- **Encryption**: TLS for all connections
- **Secrets**: Environment variables or secret management (Vault)

## Cost Optimization

1. **MinIO**: Self-hosted, minimal cost
2. **Cloudinary**: Pay-per-use, only for edge delivery
3. **MongoDB**: Atlas free tier for development
4. **CDN**: Cloudflare free tier or Vercel included CDN
