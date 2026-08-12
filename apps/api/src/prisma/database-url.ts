export function requireDatabaseUrl(value = process.env.DATABASE_URL): string {
  if (!value) {
    throw new Error('DATABASE_URL is required to initialize persistence.');
  }

  const url = new URL(value);
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }

  return value;
}
