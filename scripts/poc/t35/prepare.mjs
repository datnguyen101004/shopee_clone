import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';

const output = resolve(process.env.POC_MANIFEST || './t35-poc-run.json');
const fixture = process.env.FIXTURE_PATH || './scripts/poc/t35/fixtures.local.json';
const manifest = {
  runId: randomUUID(),
  createdAt: new Date().toISOString(),
  fixturePath: resolve(fixture),
  topology: {
    api: process.env.BASE_URL || 'http://127.0.0.1:3001/api/v1',
    controlPlane:
      process.env.CONTROL_PLANE_URL || process.env.BASE_URL || 'http://127.0.0.1:3001/api/v1',
    localstack: process.env.ADMISSION_SQS_ENDPOINT || 'http://127.0.0.1:4566',
    redis: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  },
  scenarios: [
    'A01',
    'A02',
    'A03',
    'A05',
    'A06',
    'A07',
    'A08',
    'A09',
    'A10',
    'Q01',
    'Q02',
    'Q03',
    'Q04',
    'Q05',
    'Q06',
    'Q07',
    'Q08',
    'R01',
    'R02',
    'R03',
    'R04',
    'R05',
  ],
  status: 'NOT_RUN',
};

await readFile(fixture, 'utf8');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(manifest, null, 2));
