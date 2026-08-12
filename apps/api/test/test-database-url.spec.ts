import { assertSafeTestDatabaseUrl } from '../prisma/test-database-url';

describe('assertSafeTestDatabaseUrl', () => {
  const safeUrl = 'postgresql://tester:secret@127.0.0.1:5432/shopee_clone_test';

  it('accepts an isolated PostgreSQL test database', () => {
    expect(assertSafeTestDatabaseUrl(safeUrl)).toBe(safeUrl);
  });

  it('rejects a missing test URL', () => {
    expect(() => assertSafeTestDatabaseUrl(undefined)).toThrow('TEST_DATABASE_URL is required');
  });

  it('rejects a non-PostgreSQL URL', () => {
    expect(() => assertSafeTestDatabaseUrl('mysql://tester:secret@localhost/app_test')).toThrow(
      'PostgreSQL protocol',
    );
  });

  it('rejects a database without the test suffix without exposing credentials', () => {
    const unsafeUrl = 'postgresql://tester:super-secret@localhost/shopee_clone';

    expect(() => assertSafeTestDatabaseUrl(unsafeUrl)).toThrow('_test');
    try {
      assertSafeTestDatabaseUrl(unsafeUrl);
    } catch (error) {
      expect(String(error)).not.toContain('super-secret');
    }
  });

  it('rejects the same target even when credentials differ', () => {
    expect(() =>
      assertSafeTestDatabaseUrl(
        safeUrl,
        'postgresql://another-user:another-secret@127.0.0.1:5432/shopee_clone_test',
      ),
    ).toThrow('distinct');
  });
});
