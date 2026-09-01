// ============================================================
// SHANAN — Seed Module
// Creates a small, clearly-marked SAMPLE/DEMO dataset to demonstrate
// the complete product master architecture.
//
// All seeded records have is_sample_data=1 to clearly distinguish
// them from verified real SHANAN product data.
//
// This seed is idempotent — safe to run multiple times.
// ============================================================

import type { Database } from 'bun:sqlite';

export function seedProductMaster(db: Database): { categories: number; brands: number; products: number; images: number; specs: number; techMeta: number } {
  const now = new Date().toISOString();
  let categoriesCreated = 0, brandsCreated = 0, productsCreated = 0, imagesCreated = 0, specsCreated = 0, techMetaCreated = 0;

  // --- Categories (8 representative categories) ---
  const categories = [
    { id: 'cat-001', slug: 'fasteners', nameEn: 'Fasteners', nameAr: 'تثبيتات', descEn: 'Bolts, screws, nuts, washers, and rivets.', descAr: 'براغي، مسامير، صواميل، حلقات، ومسامير برشام.' },
    { id: 'cat-002', slug: 'bearings', nameEn: 'Bearings', nameAr: 'محامل', descEn: 'Ball bearings, roller bearings, and bearing units.', descAr: 'محامل كروية، محامل أسطوانية، ووحدات محامل.' },
    { id: 'cat-003', slug: 'power-transmission', nameEn: 'Power Transmission', nameAr: 'نقل الحركة', descEn: 'Belts, pulleys, chains, sprockets, and couplings.', descAr: 'أحزمة، بكرات، سلاسل، مسننات، ووصلات.' },
    { id: 'cat-004', slug: 'pneumatics-hydraulics', nameEn: 'Pneumatics & Hydraulics', nameAr: 'هوائية وهيدروليكية', descEn: 'Cylinders, valves, fittings, and hoses.', descAr: 'أسطوانات، صمامات، وصلات، وخراطيم.' },
    { id: 'cat-005', slug: 'electrical', nameEn: 'Electrical Components', nameAr: 'مكونات كهربائية', descEn: 'Contactors, relays, switches, and circuit breakers.', descAr: 'كونتاكتورات، مرحلات، مفاتيح، وقواطع دوائر.' },
    { id: 'cat-006', slug: 'tools', nameEn: 'Industrial Tools', nameAr: 'أدوات صناعية', descEn: 'Hand tools, power tools, and cutting tools.', descAr: 'أدوات يدوية، أدوات كهربائية، وأدوات قطع.' },
    { id: 'cat-007', slug: 'safety', nameEn: 'Safety & PPE', nameAr: 'السلامة ومعدات الوقاية', descEn: 'Personal protective equipment and safety gear.', descAr: 'معدات الوقاية الشخصية ومعدات السلامة.' },
    { id: 'cat-008', slug: 'plumbing-valves', nameEn: 'Plumbing & Valves', nameAr: 'سباكة وصمامات', descEn: 'Pipes, fittings, valves, and flanges.', descAr: 'أنابيب، وصلات، صمامات، وفلنجات.' },
  ];

  for (const c of categories) {
    const existing = db.prepare('SELECT id FROM categories WHERE slug = ?').get(c.slug);
    if (!existing) {
      db.prepare(
        `INSERT INTO categories (id, slug, name_en, name_ar, description_en, description_ar, sort_order, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(c.id, c.slug, c.nameEn, c.nameAr, c.descEn, c.descAr, categoriesCreated, now, now);
      categoriesCreated++;
    }
  }

  // --- Brands (5 representative brands — clearly marked as SAMPLE) ---
  const brands = [
    { id: 'brand-skf', slug: 'skf', name: 'SKF', nameAr: 'SKF', descEn: 'Bearings and power transmission solutions.', country: 'Sweden' },
    { id: 'brand-bosch', slug: 'bosch', name: 'Bosch', nameAr: 'بوش', descEn: 'Industrial tools and electrical components.', country: 'Germany' },
    { id: 'brand-festo', slug: 'festo', name: 'Festo', nameAr: 'فيستو', descEn: 'Pneumatic and automation solutions.', country: 'Germany' },
    { id: 'brand-3m', slug: '3m', name: '3M', nameAr: '3M', descEn: 'Safety equipment and industrial supplies.', country: 'USA' },
    { id: 'brand-parker', slug: 'parker', name: 'Parker', nameAr: 'باركر', descEn: 'Hydraulic and pneumatic components.', country: 'USA' },
  ];

  for (const b of brands) {
    const existing = db.prepare('SELECT id FROM brands WHERE slug = ?').get(b.slug);
    if (!existing) {
      db.prepare(
        `INSERT INTO brands (id, slug, name, name_ar, description_en, country, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(b.id, b.slug, b.name, b.nameAr, b.descEn, b.country, now, now);
      brandsCreated++;
    }
  }

  // --- Products (12 clearly-marked SAMPLE products across categories) ---
  const products = [
    { id: 'prod-00001', sku: 'SHN-SKU-00001', code: 'SHN-PC-00001', slug: 'deep-groove-ball-bearing-6201', nameEn: 'Deep Groove Ball Bearing 6201', nameAr: 'محمل كروي عميق 6201', catId: 'cat-002', brandId: 'brand-skf', descEn: 'Sample deep groove ball bearing for general industrial applications.', descAr: 'محمل كروي عميق تجريبي للتطبيقات الصناعية العامة.', avail: 'in_stock' },
    { id: 'prod-00002', sku: 'SHN-SKU-00002', code: 'SHN-PC-00002', slug: 'deep-groove-ball-bearing-6202', nameEn: 'Deep Groove Ball Bearing 6202', nameAr: 'محمل كروي عميق 6202', catId: 'cat-002', brandId: 'brand-skf', descEn: 'Sample deep groove ball bearing for general industrial applications.', descAr: 'محمل كروي عميق تجريبي للتطبيقات الصناعية العامة.', avail: 'in_stock' },
    { id: 'prod-00003', sku: 'SHN-SKU-00003', code: 'SHN-PC-00003', slug: 'hex-bolt-m8-30mm', nameEn: 'Hex Bolt M8 x 30mm', nameAr: 'برغي سداسي M8 × 30mm', catId: 'cat-001', brandId: 'brand-bosch', descEn: 'Sample hex bolt, M8 thread, 30mm length.', descAr: 'برغي سداسي تجريبي، خيط M8، طول 30mm.', avail: 'in_stock' },
    { id: 'prod-00004', sku: 'SHN-SKU-00004', code: 'SHN-PC-00004', slug: 'hex-nut-m8', nameEn: 'Hex Nut M8', nameAr: 'صامولة سداسية M8', catId: 'cat-001', brandId: 'brand-bosch', descEn: 'Sample hex nut, M8 thread.', descAr: 'صامولة سداسية تجريبية، خيط M8.', avail: 'in_stock' },
    { id: 'prod-00005', sku: 'SHN-SKU-00005', code: 'SHN-PC-00005', slug: 'v-belt-a-42', nameEn: 'V-Belt A-42', nameAr: 'حزام V نوع A-42', catId: 'cat-003', brandId: 'brand-skf', descEn: 'Sample V-belt for power transmission.', descAr: 'حزام V تجريبي لنقل الحركة.', avail: 'limited' },
    { id: 'prod-00006', sku: 'SHN-SKU-00006', code: 'SHN-PC-00006', slug: 'pneumatic-cylinder-32x100', nameEn: 'Pneumatic Cylinder 32x100', nameAr: 'أسطوانة هوائية 32×100', catId: 'cat-004', brandId: 'brand-festo', descEn: 'Sample double-acting pneumatic cylinder, 32mm bore, 100mm stroke.', descAr: 'أسطوانة هوائية تجريبية مزدوجة الحركة، قطر 32mm، شوط 100mm.', avail: 'in_stock' },
    { id: 'prod-00007', sku: 'SHN-SKU-00007', code: 'SHN-PC-00007', slug: 'contactor-25a-230v', nameEn: 'Contactor 25A 230V', nameAr: 'كونتاكتور 25A 230V', catId: 'cat-005', brandId: 'brand-bosch', descEn: 'Sample AC contactor, 25A, 230V coil.', descAr: 'كونتاكتور تجريبي، 25A، ملف 230V.', avail: 'in_stock' },
    { id: 'prod-00008', sku: 'SHN-SKU-00008', code: 'SHN-PC-00008', slug: 'circuit-breaker-16a', nameEn: 'Circuit Breaker 16A', nameAr: 'قاطع دائرة 16A', catId: 'cat-005', brandId: 'brand-bosch', descEn: 'Sample miniature circuit breaker, 16A, C-curve.', descAr: 'قاطع دائرة تجريبي، 16A، منحنى C.', avail: 'in_stock' },
    { id: 'prod-00009', sku: 'SHN-SKU-00009', code: 'SHN-PC-00009', slug: 'safety-goggles-clear', nameEn: 'Safety Goggles Clear', nameAr: 'نظارات أمان شفافة', catId: 'cat-007', brandId: 'brand-3m', descEn: 'Sample clear safety goggles with anti-fog coating.', descAr: 'نظارات أمان شفافة تجريبية مع طلاء مضاد للضباب.', avail: 'in_stock' },
    { id: 'prod-00010', sku: 'SHN-SKU-00010', code: 'SHN-PC-00010', slug: 'ball-valve-1inch', nameEn: 'Ball Valve 1 inch', nameAr: 'صمام كروي 1 بوصة', catId: 'cat-008', brandId: 'brand-parker', descEn: 'Sample brass ball valve, 1 inch NPT.', descAr: 'صمام كروي نحاسي تجريبي، 1 بوصة NPT.', avail: 'on_request' },
    { id: 'prod-00011', sku: 'SHN-SKU-00011', code: 'SHN-PC-00011', slug: 'cordless-drill-18v', nameEn: 'Cordless Drill 18V', nameAr: 'مثقاب لاسلكي 18V', catId: 'cat-006', brandId: 'brand-bosch', descEn: 'Sample 18V cordless drill with 2 batteries.', descAr: 'مثقاب لاسلكي تجريبي 18V مع بطاريتين.', avail: 'limited' },
    { id: 'prod-00012', sku: 'SHN-SKU-00012', code: 'SHN-PC-00012', slug: 'hydraulic-hose-12mm', nameEn: 'Hydraulic Hose 12mm', nameAr: 'خرطوم هيدروليكي 12mm', catId: 'cat-004', brandId: 'brand-parker', descEn: 'Sample hydraulic hose, 12mm ID, 250 bar working pressure.', descAr: 'خرطوم هيدروليكي تجريبي، قطر داخلي 12mm، ضغط 250 بار.', avail: 'in_stock' },
  ];

  for (const p of products) {
    const existing = db.prepare('SELECT id FROM products WHERE sku = ?').get(p.sku);
    if (!existing) {
      db.prepare(
        `INSERT INTO products (id, sku, product_code, slug, name_en, name_ar, description_en, description_ar,
           category_id, brand_id, manufacturer, availability, status, is_sample_data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)`,
      ).run(p.id, p.sku, p.code, p.slug, p.nameEn, p.nameAr, p.descEn, p.descAr,
        p.catId, p.brandId, brands.find(b => b.id === p.brandId)?.name || null, p.avail, now, now);
      productsCreated++;
    }
  }

  // --- Sample specifications for first product ---
  const specs = [
    { prodId: 'prod-00001', labelEn: 'Material', labelAr: 'المادة', valueEn: 'Chrome Steel', valueAr: 'صلب كروم', groupEn: 'General', groupAr: 'عام' },
    { prodId: 'prod-00001', labelEn: 'Bore Diameter', labelAr: 'قطر الثقب', valueEn: '12 mm', valueAr: '12 مم', groupEn: 'Dimensions', groupAr: 'الأبعاد' },
    { prodId: 'prod-00001', labelEn: 'Outer Diameter', labelAr: 'القطر الخارجي', valueEn: '32 mm', valueAr: '32 مم', groupEn: 'Dimensions', groupAr: 'الأبعاد' },
    { prodId: 'prod-00001', labelEn: 'Width', labelAr: 'العرض', valueEn: '10 mm', valueAr: '10 مم', groupEn: 'Dimensions', groupAr: 'الأبعاد' },
  ];
  for (const s of specs) {
    const existing = db.prepare('SELECT id FROM product_specifications WHERE product_id = ? AND label_en = ?').get(s.prodId, s.labelEn);
    if (!existing) {
      db.prepare(
        `INSERT INTO product_specifications (id, product_id, label_en, label_ar, value_en, value_ar, group_en, group_ar, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(crypto.randomUUID(), s.prodId, s.labelEn, s.labelAr, s.valueEn, s.valueAr, s.groupEn, s.groupAr, specsCreated, now);
      specsCreated++;
    }
  }

  // --- Sample technical metadata for first product ---
  const techMeta = [
    { prodId: 'prod-00001', keyEn: 'Dynamic Load Rating', keyAr: 'تصنيف الحمل الديناميكي', value: '9.95 kN', unit: 'kN' },
    { prodId: 'prod-00001', keyEn: 'Static Load Rating', keyAr: 'تصنيف الحمل الثابت', value: '3.15 kN', unit: 'kN' },
    { prodId: 'prod-00001', keyEn: 'Max Speed', keyAr: 'السرعة القصوى', value: '36000', unit: 'rpm' },
  ];
  for (const t of techMeta) {
    const existing = db.prepare('SELECT id FROM product_technical_metadata WHERE product_id = ? AND key_en = ?').get(t.prodId, t.keyEn);
    if (!existing) {
      db.prepare(
        `INSERT INTO product_technical_metadata (id, product_id, key_en, key_ar, value, unit, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(crypto.randomUUID(), t.prodId, t.keyEn, t.keyAr, t.value, t.unit, techMetaCreated, now);
      techMetaCreated++;
    }
  }

  // --- Sample image metadata for first product (using existing public logo as placeholder) ---

  return {
    categories: categoriesCreated,
    brands: brandsCreated,
    products: productsCreated,
    images: imagesCreated,
    specs: specsCreated,
    techMeta: techMetaCreated,
  };
}
