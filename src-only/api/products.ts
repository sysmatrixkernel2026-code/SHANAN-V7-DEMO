import { sql } from './postgres';

export default async function handler(req: Request) {
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'content-type': 'application/json' } });

  try {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '24', 10)));
    const search = url.searchParams.get('search')?.trim() || '';
    const categoryId = url.searchParams.get('categoryId');
    const brandId = url.searchParams.get('brandId');
    const availability = url.searchParams.get('availability');
    const sortBy = url.searchParams.get('sortBy') || 'name_asc';

    const conditions: string[] = ["p.status = 'active'", "p.is_sample_data = 0"];
    const params: any[] = [];

    if (search) {
      conditions.push("(p.name_en ILIKE ${search} OR p.name_ar ILIKE ${search} OR p.sku ILIKE ${search} OR p.product_code ILIKE ${search} OR p.manufacturer ILIKE ${search})");
      params.push(`%${search}%`);
    }
    if (categoryId) {
      conditions.push('p.category_id = ${categoryId}');
      params.push(categoryId);
    }
    if (brandId) {
      if (brandId === 'brand-dyllu') {
        conditions.push("p.name_en ILIKE '%DYLLU%'");
      } else {
        conditions.push('p.brand_id = ${brandId}');
        params.push(brandId);
        if (brandId === 'brand-hans') {
          conditions.push("p.name_en NOT LIKE 'Hansطقم%'");
        }
      }
    }
    if (availability) {
      conditions.push('p.availability = ${availability}');
      params.push(availability);
    }

    const where = conditions.join(' AND ');

    let orderBy = 'p.name_en ASC';
    switch (sortBy) {
      case 'name_desc': orderBy = 'p.name_en DESC'; break;
      case 'sku_asc': orderBy = 'p.sku ASC'; break;
      case 'sku_desc': orderBy = 'p.sku DESC'; break;
      case 'newest': orderBy = 'p.created_at DESC'; break;
    }

    const offset = (page - 1) * pageSize;

    const countResult = await sql.unsafe(
      `SELECT COUNT(*) as n FROM products p WHERE ${where}`,
      params,
    );
    const total = Number(countResult[0]?.n ?? 0);
    const totalPages = Math.ceil(total / pageSize) || 1;

    const rows = await sql.unsafe(
      `SELECT p.id, p.sku, p.product_code, p.slug, p.name_en, p.name_ar,
              p.description_en, p.description_ar, p.category_id, p.brand_id,
              p.manufacturer, p.availability, p.is_sample_data, p.created_at,
              c.name_en AS category_name_en, c.name_ar AS category_name_ar,
              b.name AS brand_name,
              (SELECT pi.public_url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) AS primary_image_url
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN brands b ON p.brand_id = b.id
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${pageSize} OFFSET ${offset}`,
      params,
    );

    const items = rows.map((r: any) => ({
      id: r.id,
      sku: r.sku,
      slug: r.slug,
      name: { en: r.name_en, ar: r.name_ar || r.name_en },
      description: { en: r.description_en || '', ar: r.description_ar || '' },
      categoryId: r.category_id,
      brandId: r.brand_id,
      manufacturer: r.manufacturer || null,
      availability: r.availability,
      isSampleData: r.is_sample_data === 1,
      primaryImage: r.primary_image_url,
      categoryName: r.category_name_en ? { en: r.category_name_en, ar: r.category_name_ar || r.category_name_en } : null,
      brandName: r.brand_name || null,
      sellPrice: null,
      currency: 'JOD',
      createdAt: r.created_at,
    }));

    return new Response(
      JSON.stringify({ items, total, page, pageSize, totalPages }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('[api/products] failed:', err?.message);
    return new Response(
      JSON.stringify({ error: 'Could not retrieve products.' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }
}
