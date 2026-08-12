import globals from 'globals';

import baseConfig from './base.mjs';

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: globals.browser,
    },
  },
];
