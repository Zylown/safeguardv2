import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';


const cliDatasourceUrl = process.env.DIRECT_URL?.trim() || env('DATABASE_URL');
if (new URL(cliDatasourceUrl).port === '6543') {
  throw new Error(
    'Prisma CLI/migrations must not use Supabase Transaction Pooler (port 6543); configure DIRECT_URL with a direct or Session Pooler connection.',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Prefer direct connectivity for Prisma CLI. Session Pooler (5432) is the
    // supported IPv4 fallback; never use Supabase Transaction Pooler (6543) here.
    url: cliDatasourceUrl,
  },
});
