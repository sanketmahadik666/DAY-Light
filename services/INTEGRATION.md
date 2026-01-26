# Integration Guide

## Integrating Microservices with Next.js App

### 1. Environment Variables

Add to `.env.local`:

```env
# Metadata Service
METADATA_SERVICE_URL=http://localhost:3001

# Storage Service
STORAGE_SERVICE_URL=http://localhost:3002

# MinIO (if connecting directly)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=daylight-storage

# Cloudinary (fallback)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### 2. Create API Client

Create `lib/services/metadata-client.ts`:

```typescript
const METADATA_SERVICE_URL = process.env.METADATA_SERVICE_URL || 'http://localhost:3001';

export async function getFacts(date: string, category?: string) {
  const params = new URLSearchParams({ date });
  if (category) params.set('category', category);
  
  const response = await fetch(`${METADATA_SERVICE_URL}/api/facts?${params}`);
  const data = await response.json();
  
  return data.success ? data.data : [];
}

export async function createFact(fact: any) {
  const response = await fetch(`${METADATA_SERVICE_URL}/api/facts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fact),
  });
  
  const data = await response.json();
  return data.success ? data.data : null;
}
```

Create `lib/services/storage-client.ts`:

```typescript
const STORAGE_SERVICE_URL = process.env.STORAGE_SERVICE_URL || 'http://localhost:3002';

export async function uploadFile(
  file: File,
  factId: string,
  date: string
): Promise<{ url: string; thumbnailUrl?: string; key: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('factId', factId);
  formData.append('date', date);
  formData.append('type', 'image');

  const response = await fetch(`${STORAGE_SERVICE_URL}/api/upload`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!data.success) throw new Error(data.error);

  return data.data;
}

export async function getFileUrl(key: string): Promise<string> {
  const response = await fetch(`${STORAGE_SERVICE_URL}/api/files/${key}`);
  const data = await response.json();
  
  return data.success ? data.data.url : '';
}
```

### 3. Update useFacts Hook

Modify `hooks/useFacts.ts` to use metadata service:

```typescript
import { getFacts } from '@/lib/services/metadata-client';

export function useFacts(date: string, category?: string) {
  // ... existing code ...
  
  const loadFacts = useCallback(async () => {
    // Try metadata service first
    try {
      const facts = await getFacts(date, category);
      if (facts.length > 0) {
        setFactsState(facts);
        setLoading(false);
        return;
      }
    } catch (error) {
      console.warn('Metadata service failed, falling back to API');
    }
    
    // Fallback to existing API logic
    // ... rest of existing code ...
  }, [date, category]);
}
```

### 4. Update Image Upload

Modify image upload logic to use storage service:

```typescript
import { uploadFile } from '@/lib/services/storage-client';

async function uploadImageForFact(fact: Fact, imageFile: File) {
  const result = await uploadFile(imageFile, fact.id, fact.date);
  
  // Update fact with storage reference
  await updateFact(fact.id, {
    imageStorageRef: {
      provider: 'minio',
      key: result.key,
      url: result.url,
      thumbnailUrl: result.thumbnailUrl,
    },
  });
}
```

### 5. Edge Function Integration

Create `app/api/edge/facts/route.ts` for edge computing:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date');
  
  if (!date) {
    return NextResponse.json({ error: 'Date required' }, { status: 400 });
  }

  // Check edge cache (Redis at edge)
  const cacheKey = `facts:${date}`;
  // ... Redis lookup ...

  // Fetch from metadata service
  const response = await fetch(
    `${process.env.METADATA_SERVICE_URL}/api/facts?date=${date}`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.SERVICE_TOKEN}`,
      },
    }
  );

  const data = await response.json();
  
  // Cache at edge
  // ... Redis set ...

  return NextResponse.json(data);
}
```

## Deployment Checklist

- [ ] Set up MongoDB (Atlas or self-hosted)
- [ ] Deploy MinIO cluster
- [ ] Configure Cloudinary account
- [ ] Set up Redis for edge caching
- [ ] Deploy metadata service
- [ ] Deploy storage service
- [ ] Configure environment variables
- [ ] Set up health checks
- [ ] Configure CDN (Cloudflare/Vercel)
- [ ] Set up monitoring (Prometheus/Grafana)
- [ ] Configure logging (ELK/CloudWatch)
- [ ] Set up backup strategy

## Testing

### Local Testing

```bash
# Start services
docker-compose up -d

# Test metadata service
curl http://localhost:3001/api/facts?date=2024-01-15

# Test storage service
curl -X POST http://localhost:3002/api/upload \
  -F "file=@test-image.jpg" \
  -F "factId=test-123" \
  -F "date=2024-01-15"
```

### Integration Testing

```bash
# Run integration tests
npm run test:integration

# Test fallback mechanism
# Stop MinIO: docker-compose stop minio
# Upload should fallback to Cloudinary
```
