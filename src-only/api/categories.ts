import { sql } from './postgres';

export default async function handler(req: Request) {
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'content-type': 'application/json' } });
  try {
    const rows = await sql`
      SELECT c.id, c.slug, c.name_en, c.name_ar, c.description_en, c.description_ar,
             c.parent_id, c.image_url, c.sort_order,
             (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS product_count
        FROM categories c
       WHERE c.is_active = 1
       ORDER BY c.sort_order ASC, c.name_en ASC`;

    const catImages = await sql`
      SELECT p.category_id, COALESCE(pi.public_url, pi.storage_key) AS img_url
        FROM product_images pi
        JOIN products p ON pi.product_id = p.id
       WHERE pi.is_primary = 1 AND p.status = 'active'
       GROUP BY p.category_id`;

    const imgMap: Record<string, string> = {};
    for (const row of catImages) imgMap[(row as any).category_id] = (row as any).img_url;

    const result = rows.map((r: any) => ({
      id: r.id, slug: r.slug,
      name: { en: r.name_en, ar: r.name_ar || r.name_en },
      description: { en: r.description_en || '', ar: r.description_ar || '' },
      parentId: r.parent_id,
      image: r.image_url || imgMap[r.id] || null,
      productCount: Number(r.product_count),
    }));

    return new Response(JSON.stringify({ categories: result, count: result.length }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err: any) {
    console.error('[api/categories] failed:', err?.message);
    return new Response(JSON.stringify({ error: 'Could not retrieve categories.' }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}
