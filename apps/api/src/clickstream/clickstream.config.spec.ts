import { loadClickstreamConfig } from './clickstream.config';

const keys = [
  'CLICKSTREAM_CAPTURE_ENABLED',
  'CLICKSTREAM_DISPATCH_ENABLED',
  'CLICKSTREAM_PSEUDONYM_SECRET',
  'CLICKSTREAM_PSEUDONYM_KEY_ID',
  'CLICKSTREAM_SAMPLING_JSON',
];

describe('clickstream configuration', () => {
  const saved = new Map<string, string | undefined>();
  beforeEach(() => {
    for (const key of keys) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  });
  afterEach(() => {
    for (const key of keys) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('keeps capture and dispatch disabled by default', () => {
    expect(loadClickstreamConfig()).toMatchObject({ captureEnabled: false, dispatchEnabled: false });
  });

  it('requires a real pseudonym key id when capture is enabled', () => {
    process.env.CLICKSTREAM_CAPTURE_ENABLED = 'true';
    process.env.CLICKSTREAM_PSEUDONYM_SECRET = 'secret';
    expect(() => loadClickstreamConfig()).toThrow(/identity settings/);
    process.env.CLICKSTREAM_PSEUDONYM_KEY_ID = 'clickstream-key-2026';
    expect(loadClickstreamConfig().pseudonymKeyId).toBe('clickstream-key-2026');
  });

  it('accepts only exact event or surface:event sampling keys', () => {
    process.env.CLICKSTREAM_SAMPLING_JSON = JSON.stringify({ 'search:product_clicked': 0.5 });
    expect(loadClickstreamConfig().sampling).toEqual({ 'search:product_clicked': 0.5 });
    process.env.CLICKSTREAM_SAMPLING_JSON = JSON.stringify({ 'search:product_clicked_extra': 0.5 });
    expect(() => loadClickstreamConfig()).toThrow(/unsupported sampling key/);
  });
});
