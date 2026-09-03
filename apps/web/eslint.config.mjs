import reactConfig from '@shopee-clone/config/eslint/react';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const config = [
  ...reactConfig,
  ...nextVitals,
  ...nextTypeScript,
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
];

export default config;
