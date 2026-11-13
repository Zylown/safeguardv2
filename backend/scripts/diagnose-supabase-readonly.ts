import { resolve } from 'node:path';
import { Client } from 'pg';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL;
async function main(): Promise<void> {
  if (!connectionString) {
    console.error('Diagnostic failed: DATABASE_URL is not configured in backend/.env.');
    process.exitCode = 1;
    return;
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');

    const sanityCheck = await client.query<{ result: number }>(
      'SELECT 1 AS result',
    );
    const counts = await client.query<{
      safeguard_user: string;
      safeguard_account: string;
      safeguard_internal_users: string;
    }>(`
      SELECT
        (SELECT count(*)::text FROM safeguard."user") AS safeguard_user,
        (SELECT count(*)::text FROM safeguard.account) AS safeguard_account,
        (SELECT count(*)::text FROM safeguard.internal_users) AS safeguard_internal_users
    `);

    await client.query('ROLLBACK');
    console.log(
      JSON.stringify({
        select1: sanityCheck.rows[0]?.result,
        rowCounts: counts.rows[0],
      }),
    );
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors; report the original read-only diagnostic error.
    }

    const err = error as NodeJS.ErrnoException;
    const code = typeof err.code === 'string' ? err.code : 'UNKNOWN';
    const message = (err.message || 'Unknown database error')
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[connection URL redacted]')
      .replace(/password\s*[=:]\s*[^\s,;]+/gi, 'password=[redacted]');
    console.error(`Diagnostic failed (${code}): ${message}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
