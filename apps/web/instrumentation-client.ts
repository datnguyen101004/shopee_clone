import { installApiRequestLogger } from './lib/api-request-logger';

// Runs before React hydrates, so DevTools captures every browser API request.
installApiRequestLogger();
