import postgres from 'postgres';

const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error('SUPABASE_DB_URL is required');
const sql = postgres(url, { max: 5, connect_timeout: 10, prepare: false });

export async function GET(req: Request) {
  try {
    await sql`SELECT 1 as ok`;
    return new Response(JSON.stringify({ ok: true, database: 'postgresql' }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? 'unknown' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
}
