import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/** Prisma 7 CLI datasource configuration; process.env remains outside domain. */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/nest_plantilla',
  },
});
