import { sql } from '../postgres';

export default async function handler(req: Request) {
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'content-type': 'application/json' } });

  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const idOrSlug = decodeURIComponent(segments[segments.length - 1]);
    if (!idOrSlug) return new Response(JSON.stringify({ error: 'Product ID is required' }), { status: 400, headers: { 'content-type': 'application/json' } });

    const productRows = await sql.unsafe(
      `SELECT p.*, c.name_en AS category_name_en, c.name_ar AS category_name_ar, c.slug AS category_slug,
              b.name AS brand_name, b.slug AS brand_slug
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN brands b ON p.brand_id = b.id
        WHERE p.id = $1 OR p.slug = $2 OR p.sku = $3
        LIMIT 1`,
      [idOrSlug, idOrSlug, idOrSlug],
    );

    const p = productRows[0] as any;
    if (!p) return new Response(JSON.stringify({ error: 'Product not found' }), { status: 404, headers: { 'content-type': 'application/json' } });

    const images = await sql`SELECT * FROM product_images WHERE product_id = ${p.id} ORDER BY is_primary DESC, sort_order ASC`;
    const imageResult = images.map((img: any) => ({
      id: img.id,
      url: img.public_url || img.storage_key,
      alt: { en: img.alt_en || '', ar: img.alt_ar || '' },
      isPrimary: img.is_primary === 1,
      sortOrder: img.sort_order,
    }));

    const specs = await sql`SELECT * FROM product_specifications WHERE product_id = ${p.id} ORDER BY sort_order ASC`;
    const specResult = specs.map((s: any) => ({
      id: s.id,
      label: { en: s.label_en, ar: s.label_ar || s.label_en },
      value: { en: s.value_en, ar: s.value_ar || s.value_en },
      group: s.group_en ? { en: s.group_en, ar: s.group_ar || s.group_en } : undefined,
    }));

    const techMeta = await sql`SELECT * FROM product_technical_metadata WHERE product_id = ${p.id} ORDER BY sort_order ASC`;
    const techMetaResult = techMeta.map((t: any) => ({
      id: t.id,
      key: { en: t.key_en, ar: t.key_ar || t.key_en },
      value: t.value,
      unit: t.unit || undefined,
    }));

    const docs = await sql`SELECT * FROM product_documents WHERE product_id = ${p.id} ORDER BY sort_order ASC`;
    const docResult = docs.map((d: any) => ({
      id: d.id,
      title: { en: d.title_en, ar: d.title_ar || d.title_en },
      url: d.public_url || d.storage_key,
      fileType: d.file_type,
      fileSize: d.file_size,
    }));

    let meta: any = null;
    try { meta = p.metadata_json ? JSON.parse(p.metadata_json) : null; } catch { meta = null; }
    const safeBarcode = meta?.barcode && String(meta.barcode).trim() !== 'nan' ? String(meta.barcode).trim() : null;
    const safeUnit = meta?.unit && String(meta.unit).trim() !== 'nan' ? String(meta.unit).trim() : null;
    const safeSubCategory = meta?.subCategory && String(meta.subCategory).trim() !== 'nan' ? String(meta.subCategory).trim() : null;

    return new Response(
      JSON.stringify({
        product: {
          id: p.id, sku: p.sku, slug: p.slug,
          name: { en: p.name_en, ar: p.name_ar || p.name_en },
          description: { en: p.description_en || '', ar: p.description_ar || '' },
          categoryId: p.category_id, brandId: p.brand_id,
          manufacturer: p.manufacturer || null,
          availability: p.availability,
          isSampleData: p.is_sample_data === 1,
          images: imageResult,
          specifications: specResult,
          technicalMetadata: techMetaResult,
          documents: docResult,
          category: p.category_name_en ? { name: { en: p.category_name_en, ar: p.category_name_ar || p.category_name_en }, slug: p.category_slug } : null,
          brand: p.brand_name ? { name: p.brand_name, slug: p.brand_slug } : null,
          sellPrice: null,
          currency: 'JOD',
          productInfo: { barcode: safeBarcode, unit: safeUnit, subCategory: safeSubCategory },
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('[api/products/:id] failed:', err?.message);
    return new Response(
      JSON.stringify({ error: 'Could not retrieve product.' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }
}
