import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(__filename);

describe('Lambda artifact', () => {
  it('loads the configured handler without workspace/runtime dependencies', () => {
    const artifact = require('../dist/handler.js') as { handler?: unknown };
    expect(typeof artifact.handler).toBe('function');
  });
});
