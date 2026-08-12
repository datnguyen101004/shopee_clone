function parsePostgreSqlUrl(value: string, variableName: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL.`);
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`${variableName} must use the PostgreSQL protocol.`);
  }

  return url;
}

function connectionTarget(url: URL): string {
  const port = url.port || '5432';
  return `${url.hostname.toLowerCase()}:${port}${url.pathname}`;
}

export function assertSafeTestDatabaseUrl(
  testDatabaseUrl = process.env.TEST_DATABASE_URL,
  developmentDatabaseUrl = process.env.DATABASE_URL,
): string {
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for destructive database verification.');
  }

  const testUrl = parsePostgreSqlUrl(testDatabaseUrl, 'TEST_DATABASE_URL');
  const databaseName = decodeURIComponent(testUrl.pathname.replace(/^\//, ''));

  if (!databaseName.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL database name must end with _test.');
  }

  if (developmentDatabaseUrl) {
    const developmentUrl = parsePostgreSqlUrl(developmentDatabaseUrl, 'DATABASE_URL');
    if (connectionTarget(testUrl) === connectionTarget(developmentUrl)) {
      throw new Error('TEST_DATABASE_URL must target a database distinct from DATABASE_URL.');
    }
  }

  return testDatabaseUrl;
}
