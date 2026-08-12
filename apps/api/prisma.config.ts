import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const placeholderDatabaseUrl =
  'postgresql://placeholder:placeholder@127.0.0.1:5432/shopee_clone?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? placeholderDatabaseUrl,
  },
});
