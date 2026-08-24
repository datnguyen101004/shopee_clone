import { installApiRequestLogger } from './lib/api-request-logger';

export function register() {
  // Server Components call the API from the Next.js server, not from DevTools.
  installApiRequestLogger();
}
