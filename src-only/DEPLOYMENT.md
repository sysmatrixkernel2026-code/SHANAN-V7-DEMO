# SHANAN Platform — Production Deployment Guide

## Architecture Overview

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Frontend        │     │   API Server     │     │   Database        │
│   React + Vite   │────▶│   Bun + SQLite    │────▶│   SQLite / PG    │
│   (static build) │     │   (port 3001)     │     │                   │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │   Object Storage   │
                         │   (local / S3)     │
                         │   Product images   │
                         └──────────────────┘
```

## Prerequisites

- **Bun** >= 1.0 (runtime for the API server)
  - Install: https://bun.sh/docs/installation
- **Node.js** >= 18 (for building the frontend)
  - Install: https://nodejs.org/

## Development Setup

1. **Clone/extract the project:**
   ```
   project/
   ├── api/
   ├── src/
   ├── db/
   │   └── schema.sql
   ├── package.json
   └── .env
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env if needed
   ```

3. **Install dependencies:**
   ```bash
   bun install
   ```

4. **Start the API server (Terminal 1):**
   ```bash
   bun run api/server.ts
   ```
   - Runs on port 3001
   - Auto-seeds demo product data on first start
   - Health check: http://localhost:3001/api/health

5. **Start the frontend dev server (Terminal 2):**
   ```bash
   bun run dev
   ```
   - Runs on port 3000
   - Open http://localhost:3000

## Production Deployment

### 1. Build the Frontend

```bash
cd project
bun run build
```

This produces a `dist/` folder with static HTML/CSS/JS files.
Deploy these to any static file server (nginx, Cloudflare Pages, S3+CloudFront, Vercel, etc.).

Set `VITE_API_URL` in your `.env` before building:
```bash
VITE_API_URL=https://api.your-domain.com bun run build
```

### 2. Deploy the API Server

```bash
# On the production server:
cd /opt/shanan
bun install --production
bun run api/server.ts
```

Use a process manager (PM2, systemd, Docker) to keep the server running:

```bash
# Using PM2
pm2 start "bun run api/server.ts" --name shanan-api

# Using systemd (see systemd unit file below)
```

### 3. Configure Storage

**Local storage (default):**
- Files stored in `./storage/` (or `STORAGE_BASE_PATH`)
- Served via `/api/storage/:key` endpoint

**S3-compatible storage (production):**
```env
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_BUCKET=your-shanan-bucket
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_FORCE_PATH_STYLE=false
STORAGE_PUBLIC_URL=https://cdn.your-domain.com
```

### 4. Configure CORS

Set `EXTRA_CORS_ORIGINS` in `.env`:
```env
EXTRA_CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com
```

### 5. Database

**SQLite (default — works for small to medium deployments):**
- Database file at `DATABASE_URL` path
- Auto-created from `db/schema.sql` on first start
- WAL mode enabled for concurrent reads
- Backup: copy the `.db` file when server is stopped

**PostgreSQL (for large-scale production — future):**
- The schema uses SQLite-compatible SQL that can be adapted to PostgreSQL
- Contact the team for PostgreSQL migration support

## Bulk Data Import

### Import Products (JSON manifest)

```bash
# Create a JSON manifest file:
cat > products.json << 'EOF'
{
  "items": [
    {
      "sku": "SHN-SKU-00001",
      "productCode": "SHN-PC-00001",
      "nameEn": "Deep Groove Ball Bearing 6201",
      "nameAr": "محمل كروي عميق 6201",
      "categoryId": "cat-002",
      "brandId": "brand-skf",
      "availability": "in_stock",
      "manufacturer": "SKF"
    }
  ]
}
EOF

# Import via API (requires internal auth token):
curl -X POST http://localhost:3001/api/admin/import/products \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @products.json
```

### Import Images (JSON manifest — for 16,000+ images)

```json
{
  "items": [
    {
      "productId": "SHN-SKU-00001",
      "storageKey": "products/prod-00001/001.jpg",
      "publicUrl": "https://cdn.your-domain.com/products/prod-00001/001.jpg",
      "filename": "001.jpg",
      "mimeType": "image/jpeg",
      "fileSize": 245678,
      "width": 800,
      "height": 600,
      "isPrimary": true,
      "sortOrder": 0,
      "altEn": "Front view",
      "altAr": "عرض أمامي"
    }
  ]
}
```

Import:
```bash
curl -X POST http://localhost:3001/api/admin/import/images \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @images.json
```

### Import Response Format

```json
{
  "jobId": "uuid",
  "status": "completed",
  "total": 1000,
  "created": 950,
  "updated": 0,
  "skipped": 30,
  "failed": 20,
  "errors": ["Row 5: product not found", "Row 12: missing required field"]
}
```

## Health Check

```bash
curl http://localhost:3001/api/health
```

Response:
```json
{
  "ok": true,
  "service": "shanan-supply-api",
  "version": "1.0.0",
  "storage": {
    "provider": "local",
    "basePath": "./storage",
    "publicUrl": null,
    "s3Configured": false
  },
  "database": "/path/to/custom.db"
}
```

## Systemd Service File (Linux)

```ini
[Unit]
Description=SHANAN API Server
After=network.target

[Service]
Type=simple
User=shanan
WorkingDirectory=/opt/shanan
EnvironmentFile=/opt/shanan/.env
ExecStart=/usr/bin/bun run api/server.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Docker (optional)

```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production
COPY . .
EXPOSE 3001
CMD ["bun", "run", "api/server.ts"]
```
