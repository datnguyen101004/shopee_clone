export interface ImageDimensions {
  width: number;
  height: number;
}

/** Validate the actual binary signature and bounded image header, never trust multipart MIME. */
export function inspectReturnEvidence(
  data: Buffer,
  declaredMime: string,
): { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; dimensions: ImageDimensions } | null {
  if (data.length < 1 || data.length > 5 * 1024 * 1024) return null;
  let dimensions: ImageDimensions | null = null;
  let mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | null = null;
  if (
    data.length >= 24 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    mimeType = 'image/png';
    dimensions = { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  } else if (data.length >= 10 && data[0] === 0xff && data[1] === 0xd8) {
    for (let offset = 2; offset + 9 < data.length;) {
      if (data[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = data[offset + 1]!;
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      if (offset + 4 > data.length) return null;
      const length = data.readUInt16BE(offset + 2);
      if (length < 2 || offset + length + 2 > data.length) return null;
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        dimensions = {
          height: data.readUInt16BE(offset + 5),
          width: data.readUInt16BE(offset + 7),
        };
        mimeType = 'image/jpeg';
        break;
      }
      offset += length + 2;
    }
  } else if (
    data.length >= 30 &&
    data.subarray(0, 4).toString() === 'RIFF' &&
    data.subarray(8, 12).toString() === 'WEBP' &&
    data.subarray(12, 16).toString() === 'VP8X'
  ) {
    mimeType = 'image/webp';
    dimensions = { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
  }
  if (
    !mimeType ||
    !dimensions ||
    mimeType !== declaredMime ||
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width > 8_000 ||
    dimensions.height > 8_000
  )
    return null;
  return { mimeType, dimensions };
}
