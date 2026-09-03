import { inspectReturnEvidence } from './return-evidence';

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('inspectReturnEvidence', () => {
  it('accepts matching PNG magic bytes and rejects spoofed MIME', () => {
    expect(inspectReturnEvidence(png1x1, 'image/png')).toEqual({
      mimeType: 'image/png',
      dimensions: { width: 1, height: 1 },
    });
    expect(inspectReturnEvidence(png1x1, 'image/jpeg')).toBeNull();
    expect(
      inspectReturnEvidence(Buffer.from('not-an-image'), 'image/png'),
    ).toBeNull();
  });

  it('rejects empty, oversized, and over-dimension payloads', () => {
    expect(inspectReturnEvidence(Buffer.alloc(0), 'image/png')).toBeNull();
    expect(
      inspectReturnEvidence(Buffer.alloc(5 * 1024 * 1024 + 1, 1), 'image/png'),
    ).toBeNull();
    const huge = Buffer.from(png1x1);
    huge.writeUInt32BE(8_001, 16);
    huge.writeUInt32BE(1, 20);
    expect(inspectReturnEvidence(huge, 'image/png')).toBeNull();
  });

  it('rejects truncated JPEG markers without trusting the declared type', () => {
    const truncatedJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x02]);
    expect(inspectReturnEvidence(truncatedJpeg, 'image/jpeg')).toBeNull();
  });
});
