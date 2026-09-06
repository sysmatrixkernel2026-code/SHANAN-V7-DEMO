// ============================================================
// SHANAN — Storage Abstraction Layer
// Provides a unified interface for product image and document
// storage. Supports local filesystem (dev) and S3-compatible
// object storage (production).
//
// The provider is selected via STORAGE_PROVIDER env var:
//   - 'local' (default) — files stored on local filesystem
//   - 's3'              — S3-compatible (AWS S3, MinIO, Cloudflare R2, etc.)
//
// Image/document binaries are NEVER stored in SQLite — only
// metadata is persisted in product_images / product_documents.
// ============================================================

import { existsSync, mkdirSync, readFileSync, unlinkSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

// --- Configuration -------------------------------------------------------
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local';
const STORAGE_BASE_PATH = process.env.STORAGE_BASE_PATH || resolve(process.cwd(), 'storage');
const STORAGE_PUBLIC_URL = process.env.STORAGE_PUBLIC_URL || '';

// S3 configuration (used when STORAGE_PROVIDER='s3')
const S3_ENDPOINT = process.env.S3_ENDPOINT || '';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || '';
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || '';
const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === 'true';

// --- Types ---------------------------------------------------------------
export interface StorageUploadResult {
  storageProvider: string;
  storageKey: string;
  publicUrl: string | null;
  filename: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
}

export interface StorageProvider {
  name: string;
  save(data: Uint8Array, key: string, mimeType: string): Promise<StorageUploadResult>;
  getUrl(key: string): string | null;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

// --- Local Storage Provider (fully functional) --------------------------
class LocalStorageProvider implements StorageProvider {
  name = 'local';
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    if (!existsSync(basePath)) {
      mkdirSync(basePath, { recursive: true });
    }
  }

  async save(data: Uint8Array, key: string, mimeType: string): Promise<StorageUploadResult> {
    const fullPath = join(this.basePath, key);
    const dir = dirname(fullPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const buf = Buffer.from(data);
    await Bun.write(fullPath, buf);

    const checksum = createHash('sha256').update(buf).digest('hex');
    const filename = key.split('/').pop() || key;

    let publicUrl: string | null = null;
    if (STORAGE_PUBLIC_URL) {
      publicUrl = `${STORAGE_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
    } else {
      publicUrl = `/api/storage/${key}`;
    }

    return {
      storageProvider: this.name,
      storageKey: key,
      publicUrl,
      filename,
      mimeType,
      fileSize: buf.length,
      checksum,
    };
  }

  getUrl(key: string): string | null {
    if (STORAGE_PUBLIC_URL) {
      return `${STORAGE_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
    }
    return `/api/storage/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(join(this.basePath, key));
  }

  async delete(key: string): Promise<void> {
    const fullPath = join(this.basePath, key);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  }

  serveFile(key: string): { data: Buffer; mimeType: string } | null {
    const fullPath = join(this.basePath, key);
    if (!existsSync(fullPath)) return null;
    const data = readFileSync(fullPath);
    const ext = key.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      pdf: 'application/pdf', doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dwg: 'application/acad',
    };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    return { data, mimeType };
  }
}

// --- S3 Storage Provider (real implementation using S3 REST API) -------
// Uses Bun's native fetch() to make signed S3 requests (SigV4).
// This avoids requiring @aws-sdk/client-s3 as a dependency.
class S3StorageProvider implements StorageProvider {
  name = 's3';

  private async signRequest(method: string, key: string, body: Uint8Array | null, contentType: string): Promise<{ url: string; headers: Record<string, string> }> {
    const host = S3_FORCE_PATH_STYLE
      ? S3_ENDPOINT.replace(/^https?:\/\//, '').replace(/\/$/, '')
      : `${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`;
    const protocol = S3_ENDPOINT.startsWith('http://') ? 'http:' : 'https:';
    const urlPath = S3_FORCE_PATH_STYLE ? `/${S3_BUCKET}/${key}` : `/${key}`;
    const fullUrl = `${protocol}//${host}${urlPath}`;

    // AWS SigV4 signing
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:.]/g, '').slice(0, -1) + 'Z';
    const dateStamp = amzDate.slice(0, 8);

    // Create canonical request
    const canonicalUri = urlPath;
    const canonicalQueryString = '';
    const payloadHash = body ? createHash('sha256').update(Buffer.from(body)).digest('hex') : createHash('sha256').digest('hex');
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    // Create string to sign
    const credentialScope = `${dateStamp}/${S3_REGION}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;

    // Calculate signing key
    const kDate = await this.hmacSha256(`AWS4${S3_SECRET_KEY}`, dateStamp);
    const kRegion = await this.hmacSha256(kDate, S3_REGION);
    const kService = await this.hmacSha256(kRegion, 's3');
    const kSigning = await this.hmacSha256(kService, 'aws4_request');
    const signature = await this.hmacSha256Hex(kSigning, stringToSign);

    const authorization = `AWS4-HMAC-SHA256 Credential=${S3_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      url: fullUrl,
      headers: {
        'Host': host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'Authorization': authorization,
        ...(contentType ? { 'Content-Type': contentType } : {}),
      },
    };
  }

  private async hmacSha256(key: string | Buffer, data: string): Promise<Buffer> {
    const keyBuffer = typeof key === 'string' ? Buffer.from(key, 'utf8') : key;
    const cryptoKey = await crypto.subtle.importKey('raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, Buffer.from(data, 'utf8'));
    return Buffer.from(sig);
  }

  private async hmacSha256Hex(key: Buffer, data: string): Promise<string> {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, Buffer.from(data, 'utf8'));
    return Buffer.from(sig).toString('hex');
  }

  async save(data: Uint8Array, key: string, mimeType: string): Promise<StorageUploadResult> {
    const buf = Buffer.from(data);
    const checksum = createHash('sha256').update(buf).digest('hex');
    const filename = key.split('/').pop() || key;

    const { url, headers } = await this.signRequest('PUT', key, buf, mimeType);
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...headers, 'Content-Length': String(buf.length) },
      body: buf,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`S3 upload failed (${res.status}): ${errText}`);
    }

    const publicUrl = S3_FORCE_PATH_STYLE
      ? `${S3_ENDPOINT}/${S3_BUCKET}/${key}`
      : `${S3_PUBLIC_URL_BASE()}/${key}`;

    return {
      storageProvider: this.name,
      storageKey: key,
      publicUrl,
      filename,
      mimeType,
      fileSize: buf.length,
      checksum,
    };
  }

  getUrl(key: string): string | null {
    return S3_FORCE_PATH_STYLE
      ? `${S3_ENDPOINT}/${S3_BUCKET}/${key}`
      : `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      const { url, headers } = await this.signRequest('HEAD', key, null, '');
      const res = await fetch(url, { method: 'HEAD', headers });
      return res.ok;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const { url, headers } = await this.signRequest('DELETE', key, null, '');
      await fetch(url, { method: 'DELETE', headers });
    } catch {
      // Silently ignore — object may already be deleted
    }
  }
}

function S3_PUBLIC_URL_BASE(): string {
  if (STORAGE_PUBLIC_URL) return STORAGE_PUBLIC_URL.replace(/\/$/, '');
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`;
}

// --- Provider selection --------------------------------------------------
let _provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (_provider) return _provider;

  switch (STORAGE_PROVIDER) {
    case 's3':
      if (S3_BUCKET && S3_ACCESS_KEY && S3_SECRET_KEY) {
        _provider = new S3StorageProvider();
        console.log(`[shanan-storage] S3 provider activated: bucket=${S3_BUCKET}, region=${S3_REGION}`);
      } else {
        console.warn('[shanan-storage] S3 provider requested but S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY not set. Falling back to local.');
        _provider = new LocalStorageProvider(STORAGE_BASE_PATH);
      }
      break;
    case 'azure':
    case 'gcs':
      console.warn(`[shanan-storage] Provider '${STORAGE_PROVIDER}' not yet implemented. Falling back to local.`);
      _provider = new LocalStorageProvider(STORAGE_BASE_PATH);
      break;
    case 'local':
    default:
      _provider = new LocalStorageProvider(STORAGE_BASE_PATH);
      break;
  }

  console.log(`[shanan-storage] Storage provider: ${_provider.name} (base: ${STORAGE_BASE_PATH})`);
  return _provider;
}

// --- Helper: expose the resolved storage base path (for path-containment checks) ---
export function getStorageBasePath(): string {
  return STORAGE_BASE_PATH;
}

// --- Helper: generate a storage key for a product image ------------------
export function generateImageStorageKey(productId: string, filename: string, index: number = 0): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
  const paddedIndex = String(index).padStart(3, '0');
  // Sanitize filename to prevent path traversal
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 50);
  return `products/${productId}/${paddedIndex}-${Date.now()}-${safeName}`;
}

// --- Helper: generate a storage key for a product document --------------
export function generateDocumentStorageKey(productId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 50);
  return `documents/${productId}/${Date.now()}-${safeName}`;
}

// --- Validate storage key (prevent path traversal) ----------------------
export function isValidStorageKey(key: string): boolean {
  // Reject keys containing .. or starting with /
  if (key.includes('..') || key.startsWith('/')) return false;
  // Only allow alphanumeric, dash, underscore, slash, dot
  return /^[a-zA-Z0-9._\-\/]+$/.test(key);
}

// --- Export config info for health/debug --------------------------------
export function getStorageConfig() {
  return {
    provider: STORAGE_PROVIDER,
    basePath: STORAGE_BASE_PATH,
    publicUrl: STORAGE_PUBLIC_URL || null,
    s3Configured: !!(S3_BUCKET && S3_ACCESS_KEY && S3_SECRET_KEY),
    s3Bucket: S3_BUCKET || null,
    s3Region: S3_REGION || null,
  };
}
