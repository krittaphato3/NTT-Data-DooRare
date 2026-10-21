import type pg from 'pg';
import { pool } from './client.js';

/** Anything that can run a query: the pool, or a client inside a transaction. */
export type Db = pg.Pool | pg.PoolClient;

/**
 * Runs `fn` in one transaction (COMMIT on return, ROLLBACK on throw). Stock moves, audit rows and the
 * business change they belong to must share the same client so they commit or roll back together.
 */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // the original error is the useful one
    }
    throw error;
  } finally {
    client.release();
  }
}
