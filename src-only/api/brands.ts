import postgres from 'postgres';

const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error('SUPABASE_DB_URL is required');
const sql = postgres(url, { max: 5, connect_timeout: 10, prepare: false, ssl: { ca: process.env.SUPABASE_SSL_CA, rejectUnauthorized: true } });

export async function GET(req: Request) {
  try {
    const rows = await sql`
      SELECT b.id, b.slug, b.name, b.name_ar, b.logo_url, b.description_en, b.description_ar,
             (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id AND p.status = 'active' AND p.is_sample_data = 0) AS product_count
        FROM brands b
       WHERE b.is_active = 1
       ORDER BY b.name ASC`;

    const result = rows
      .map((r: any) => ({
        id: r.id, slug: r.slug,
        name: r.name,
        description: { en: r.description_en || '', ar: r.description_ar || '' },
        logo: r.logo_url || null,
        productCount: Number(r.product_count),
      }))
      .filter((b: any) => b.productCount > 0);

    return new Response(JSON.stringify({ brands: result, count: result.length }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err: any) {
    console.error('[api/brands] failed:', err?.message);
    return new Response(JSON.stringify({ error: 'Could not retrieve brands.' }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}
