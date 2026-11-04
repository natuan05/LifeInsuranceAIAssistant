import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { readFileSync } from 'node:fs';

@Injectable()
export class PolicyStorageService {
  async access(version: { storageBucket: string; storageObjectKey: string }, filename: string, intent: 'view' | 'download') {
    const bucket = process.env.STORAGE_BUCKET ?? 'life-insurance-documents';
    if (version.storageBucket !== bucket || !version.storageObjectKey || version.storageObjectKey.startsWith('/')
      || version.storageObjectKey.includes('://') || [...version.storageObjectKey].some(char => char.charCodeAt(0) < 32)) throw new NotFoundException();
    try {
      const credentials = {
        accessKeyId: readFileSync(process.env.STORAGE_ACCESS_KEY_FILE ?? '/credentials/storage-reader/access-key', 'utf8').trim(),
        secretAccessKey: readFileSync(process.env.STORAGE_SECRET_KEY_FILE ?? '/credentials/storage-reader/secret-key', 'utf8').trim(),
      };
      const region = process.env.STORAGE_REGION ?? 'ap-southeast-1';
      const endpoint = process.env.STORAGE_INTERNAL_ENDPOINT ?? 'http://minio:9000';
      const publicEndpoint = process.env.STORAGE_PUBLIC_ENDPOINT ?? 'http://localhost:9000';
      for (const value of [endpoint, publicEndpoint]) {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid storage endpoint');
      }
      const ttl = Number(process.env.STORAGE_URL_TTL_SECONDS ?? '900');
      if (!Number.isInteger(ttl) || ttl < 60 || ttl > 3600) throw new Error('Invalid storage TTL');
      const internal = new S3Client({ region, endpoint, credentials, forcePathStyle: true, maxAttempts: 1 });
      const signer = new S3Client({ region, endpoint: publicEndpoint, credentials, forcePathStyle: true });
      try {
        const file = await internal.send(new HeadObjectCommand({ Bucket: bucket, Key: version.storageObjectKey }), { abortSignal: AbortSignal.timeout(5000) });
        if (file.ContentType?.split(';')[0] !== 'application/pdf' || !file.ContentLength) throw new NotFoundException();
        const disposition = `${intent === 'view' ? 'inline' : 'attachment'}; filename="${filename}"`;
        const url = await getSignedUrl(signer, new GetObjectCommand({ Bucket: bucket, Key: version.storageObjectKey,
          ResponseContentType: 'application/pdf', ResponseContentDisposition: disposition, ResponseCacheControl: 'private, no-store' }), { expiresIn: ttl });
        return { url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
      } finally { internal.destroy(); signer.destroy(); }
    } catch (error) {
      if (error instanceof NotFoundException || (error && typeof error === 'object' && '$metadata' in error
        && (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404)) throw new NotFoundException();
      // Never expose SDK errors: they can include object paths, credentials or signed URLs.
      throw new ServiceUnavailableException();
    }
  }
}
