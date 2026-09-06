import { sql } from './postgres';

export default async function handler(req: Request) {
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'content-type': 'application/json' } });
  try {
    await sql`SELECT 1 as ok`;
    return new Response(JSON.stringify({ ok: true, database: 'postgresql' }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? 'unknown' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
}
