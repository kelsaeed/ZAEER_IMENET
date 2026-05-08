'use client';

/** Module-level cache of tables that have already responded with a
 *  "doesn't exist" error in this session. Used to short-circuit
 *  repeated fetches against tables the project hasn't migrated yet
 *  (e.g. an installation that ran 0001 but never applied 0006).
 *
 *  The first failure still surfaces a 404 in the network panel —
 *  Supabase's fetch wrapper logs that itself and we can't suppress
 *  it — but every subsequent call short-circuits before going to
 *  the network, so the console doesn't fill up and the UI doesn't
 *  pay round-trip latency on every render. */
const missing = new Set<string>();

/** True if a previous query against this table reported it as missing. */
export function isTableMissing(table: string): boolean {
  return missing.has(table);
}

/** Inspect a Supabase error and remember the table name if the error
 *  matches a "table doesn't exist" code. Returns true when a missing
 *  marker was set so callers can branch on it.
 *
 *  Codes:
 *    PGRST205 — PostgREST: relation not in schema cache
 *    42P01    — PostgreSQL: undefined_table
 *    PGRST002 — PostgREST: schema cache loading or missing */
export function markTableMissing(
  table: string,
  err: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!err) return false;
  if (err.code === 'PGRST205' || err.code === '42P01' || err.code === 'PGRST002') {
    missing.add(table);
    return true;
  }
  // Some PostgREST builds report a 404 without a code, but the message
  // mentions the table name and "does not exist".
  if (typeof err.message === 'string' && /does not exist|not found in/i.test(err.message)) {
    missing.add(table);
    return true;
  }
  return false;
}
