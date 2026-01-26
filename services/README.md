# DAY-LIGHT Microservices Architecture

Enterprise-grade microservices architecture for storing and serving fact slides with MinIO object storage, MongoDB metadata, and Cloudinary fallback for edge computing scenarios.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Edge Gateway (Next.js)                    │
│              (CDN / Edge Functions / Vercel)                │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │               │
┌───────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
│  Metadata    │ │  Storage   │ │  Image     │
│  Service     │ │  Service   │ │  Service   │
│  (MongoDB)   │ │  (MinIO)   │ │  (Cloudinary│
│              │ │            │ │   Fallback) │
└──────────────┘ └────────────┘ └────────────┘
```

## Services

### 1. Metadata Service (`metadata-service/`)
- **Purpose**: Store and retrieve fact/slide metadata
- **Database**: MongoDB
- **Port**: 3001
- **Responsibilities**:
  - Fact CRUD operations
  - Slide metadata management
  - Search and filtering
  - Date range queries
  - Category indexing

### 2. Storage Service (`storage-service/`)
- **Purpose**: Object storage for images and assets
- **Primary**: MinIO
- **Fallback**: Cloudinary
- **Port**: 3002
- **Responsibilities**:
  - Image upload/retrieval
  - Thumbnail generation
  - CDN integration
  - Storage quota management
  - Automatic fallback to Cloudinary

### 3. Image Service (`image-service/`)
- **Purpose**: Image processing and optimization
- **Port**: 3003
- **Responsibilities**:
  - Image transformation
  - Format conversion
  - Optimization
  - Edge delivery

## Storage Strategy

### MinIO Bucket Structure
```
daylight-storage/
├── facts/
│   ├── {date}/
│   │   ├── {factId}/
│   │   │   ├── original.jpg
│   │   │   ├── thumbnail-400x300.jpg
│   │   │   ├── thumbnail-800x600.jpg
│   │   │   └── metadata.json
│   │   └── gallery/
│   │       └── {imageId}.jpg
├── slides/
│   ├── {date}/
│   │   └── {slideId}/
│   │       ├── slide.json
│   │       └── assets/
│   └── exports/
└── cache/
    └── {hash}/
```

### MongoDB Collections

1. **facts**: Core fact documents
2. **slides**: Slide compositions
3. **images**: Image metadata references
4. **storage_refs**: MinIO/Cloudinary object references

## Fallback Strategy

1. **Primary**: MinIO (self-hosted, cost-effective)
2. **Fallback**: Cloudinary (when MinIO unavailable or for edge delivery)
3. **Cache**: CDN layer (Cloudflare/Vercel Edge)

## Edge Computing Support

- **Edge Functions**: Vercel Edge Functions for metadata queries
- **CDN**: Cloudflare/Vercel CDN for static assets
- **Edge Caching**: Redis at edge locations
- **Geographic Distribution**: Multi-region MinIO setup
