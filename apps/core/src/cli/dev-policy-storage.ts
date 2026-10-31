import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface FixtureStorage { bucket: string; ensure(key: string, body: Buffer, checksum: string): Promise<boolean> }

export function localFixtureStorage(): FixtureStorage & { close(): void } {
  const bucket = process.env.STORAGE_BUCKET ?? 'life-insurance-documents';
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Invalid local fixture bucket.');
  const s3 = new S3Client({ endpoint: 'http://minio:9000', region: process.env.STORAGE_REGION ?? 'ap-southeast-1',
    forcePathStyle: true, maxAttempts: 1, credentials: {
      accessKeyId: readFileSync('/credentials/storage-writer/access-key', 'utf8').trim(),
      secretAccessKey: readFileSync('/credentials/storage-writer/secret-key', 'utf8').trim(),
    } });
  function status(error: unknown) {
    return error && typeof error === 'object' && '$metadata' in error ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode : undefined;
  }
  async function verify(key: string, checksum: string) {
    try {
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(10000) });
      if (object.ContentType !== 'application/pdf' || !object.Body) throw new Error('Conflicting fixture object.');
      const bytes = await object.Body.transformToByteArray();
      if (createHash('sha256').update(bytes).digest('hex') !== checksum) throw new Error('Conflicting fixture object.');
      return true;
    } catch (error) { if (status(error) === 404) return false; throw error; }
  }
  return { bucket, close: () => s3.destroy(), async ensure(key, body, checksum) {
    if (!key.startsWith('dev-fixtures/policies-v1/') || !body.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Invalid fixture object.');
    if (await verify(key, checksum)) return false;
    try {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, IfNoneMatch: '*',
        ContentType: 'application/pdf', CacheControl: 'private, no-store', Metadata: { sha256: checksum, fixture: 'policies-v1' } }),
      { abortSignal: AbortSignal.timeout(10000) });
    } catch (error) { if (status(error) !== 412) throw error; }
    if (!await verify(key, checksum)) throw new Error('Fixture upload verification failed.');
    return true;
  } };
}
