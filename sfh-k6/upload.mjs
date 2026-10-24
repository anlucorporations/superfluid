// Sube los resúmenes de k6 a GCS (evidencia).
import { Storage } from '@google-cloud/storage';
import fs from 'node:fs/promises';

const bucket = (process.env.GCS_BUCKET ?? '').trim();
const prefix = (process.env.GCS_PREFIX ?? 'k6').trim();
if (!bucket) process.exit(0);
const storage = new Storage();
for (const file of ['/tmp/k6-nas-summary.json', '/tmp/k6-gateway-summary.json']) {
  const body = await fs.readFile(file, 'utf8').catch(() => null);
  if (!body) continue;
  const destination = `${prefix}/${file.split('/').pop()}`;
  await storage.bucket(bucket).file(destination).save(body, { resumable: false });
  console.log(`uploaded gs://${bucket}/${destination}`);
}
