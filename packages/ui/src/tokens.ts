export const designTokens = {
  color: {
    brand: [
      '--sc-color-brand-50',
      '--sc-color-brand-100',
      '--sc-color-brand-500',
      '--sc-color-brand-600',
      '--sc-color-brand-700',
    ],
    text: ['--sc-color-text', '--sc-color-text-muted', '--sc-color-text-inverse'],
    surface: [
      '--sc-color-canvas',
      '--sc-color-surface',
      '--sc-color-surface-subtle',
      '--sc-color-surface-raised',
    ],
    feedback: ['--sc-color-success', '--sc-color-warning', '--sc-color-danger', '--sc-color-info'],
  },
  typography: [
    '--sc-font-sans',
    '--sc-font-size-xs',
    '--sc-font-size-sm',
    '--sc-font-size-md',
    '--sc-font-size-lg',
    '--sc-font-size-xl',
    '--sc-font-size-2xl',
  ],
  spacing: [
    '--sc-space-1',
    '--sc-space-2',
    '--sc-space-3',
    '--sc-space-4',
    '--sc-space-5',
    '--sc-space-6',
    '--sc-space-8',
    '--sc-space-10',
    '--sc-space-12',
  ],
  radius: ['--sc-radius-sm', '--sc-radius-md', '--sc-radius-lg', '--sc-radius-pill'],
  elevation: ['--sc-shadow-sm', '--sc-shadow-md', '--sc-shadow-lg'],
  sizing: ['--sc-target-min', '--sc-container-max'],
  layering: ['--sc-z-sticky', '--sc-z-overlay', '--sc-z-toast'],
  motion: ['--sc-duration-fast', '--sc-duration-normal', '--sc-ease-standard'],
} as const;

export const referenceViewports = {
  mobile: { width: 360, height: 800 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
} as const;

export const layoutBreakpoints = {
  compact: 480,
  tablet: 768,
  wide: 1200,
} as const;
