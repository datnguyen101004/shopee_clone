import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { designTokens, layoutBreakpoints, referenceViewports } from '../src/tokens';

describe('design tokens', () => {
  it('publishes every documented CSS custom property', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
    const flatten = (value: unknown): string[] => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value.flatMap(flatten);
      if (value && typeof value === 'object') return Object.values(value).flatMap(flatten);
      return [];
    };
    const names = flatten(designTokens);
    for (const name of names) expect(css).toContain(`${name}:`);
  });

  it('keeps the UI package independent from applications and backend frameworks', () => {
    const sourceFiles = [
      'button.tsx',
      'dialog.tsx',
      'display.tsx',
      'forms.tsx',
      'index.ts',
      'layout.tsx',
      'skeleton.tsx',
      'states.tsx',
      'toast.tsx',
    ];
    const source = sourceFiles
      .map((file) => readFileSync(resolve(process.cwd(), 'src', file), 'utf8'))
      .join('\n');
    expect(source).not.toMatch(
      /from ['"](?:next|@nestjs|@prisma|@shopee-clone\/(?:api|contracts|web))/,
    );
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      exports: Record<string, string>;
    };
    expect(manifest.exports['.']).toBe('./src/index.ts');
    expect(manifest.exports['./styles.css']).toBe('./src/styles.css');
  });

  it('keeps the documented responsive boundaries stable', () => {
    expect(layoutBreakpoints).toEqual({ compact: 480, tablet: 768, wide: 1200 });
    expect(referenceViewports).toEqual({
      mobile: { width: 360, height: 800 },
      tablet: { width: 768, height: 1024 },
      desktop: { width: 1440, height: 900 },
    });
  });
});
