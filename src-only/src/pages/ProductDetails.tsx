import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { fetchProductById, getCategoryById } from '../data/catalog';
import { trackEvent, ActivityEvents } from '../data/activity';
import type { Locale, Product } from '../types';
import { LoadingState, EmptyState } from '../components/LoadingEmptyStates';
import { useSupplyRequest } from '../context/SupplyRequestContext';
import { ArrowIcon, DownloadIcon, RequestIcon, SearchEmptyIcon, PrintIcon } from '../components/icons';

// Format the product's existing `createdAt` date in a locale-aware way.
// Uses Arabic locale formatting for ar, English locale formatting for en.
// Falls back to the raw ISO string if Intl is unavailable.
function formatListedDate(iso: string, locale: Locale): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const intlLocale = locale === 'ar' ? 'ar-EG' : 'en-US';
    return new Intl.DateTimeFormat(intlLocale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return iso;
  }
}

export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const { addItem } = useSupplyRequest();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchProductById(id)
      .then(p => {
        setProduct(p);
        setActiveImageIdx(0);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="container" style={{ padding: '40px 0' }}>
        <LoadingState type="detail" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container" style={{ padding: '40px 0' }}>
        <EmptyState
          title={t('catalog.noResults')}
          description={t('catalog.noResultsDesc')}
          icon={<SearchEmptyIcon />}
          action={<Link to="/catalog" className="btn btn-primary">{t('product.backToCatalog')}</Link>}
        />
      </div>
    );
  }

  const category = getCategoryById(product.categoryId) ?? (product.category ? { ...product.category, id: product.categoryId, slug: product.category.slug || '' } : undefined);
  const brand = product.brand ? { id: product.brandId, name: product.brand.name, slug: product.brand.slug || '' } : undefined;

  const availabilityBadge = {
    in_stock: { class: 'badge-success', label: t('catalog.avail.in_stock') },
    limited: { class: 'badge-warning', label: t('catalog.avail.limited') },
    out_of_stock: { class: 'badge-error', label: t('catalog.avail.out_of_stock') },
    on_request: { class: 'badge-info', label: t('catalog.avail.on_request') },
  }[product.availability];

  const handleAddToSupply = () => {
    addItem({
      productId: product.id,
      productName: product.name[locale],
      sku: product.sku,
      quantity: 1,
      productImage: product.images?.[0]?.url,
      categoryId: product.categoryId,
      brandId: product.brandId || undefined,
      unit: product.productInfo?.unit ?? undefined,
      unitPrice: product.sellPrice ?? undefined,
      currency: product.currency ?? undefined,
    });
    navigate('/supply-request');
  };

  const fileTypeLabels: Record<string, string> = {
    pdf: 'PDF', doc: 'DOC', docx: 'DOCX', xls: 'XLS', xlsx: 'XLSX', dwg: 'DWG', other: 'FILE',
  };

  const hasSpecs = product.specifications.length > 0;
  const hasMetadata = product.technicalMetadata.length > 0;
  const hasDocuments = product.documents.length > 0;
  const imageUrl = product.images?.[0]?.url ?? product.primaryImage ?? null;

  return (
    <div className="product-detail-page">
      {/* ===== PRINT-ONLY DOCUMENT ===== */}
      <div className="print-doc" aria-hidden="true">
        {/* HEADER */}
        <header className="print-doc-header">
          <img src="/shanan-logo.png" alt="SHANAN" className="print-doc-logo" />
          <div className="print-doc-title-block">
            <span className="print-doc-brand">SHANAN — Engineering Knowledge Platform</span>
            <span className="print-doc-title">{t('product.print.documentTitle')}</span>
          </div>
          <div className="print-doc-meta">
            <span>{t('product.printedOn')}: {formatListedDate(new Date().toISOString(), locale)}</span>
          </div>
        </header>

        {/* PRODUCT SUMMARY */}
        <section className="print-doc-section">
          <div className="print-doc-product-row">
            {imageUrl && (
              <div className="print-doc-image-wrap">
                <img src={imageUrl} alt={product.name[locale]} className="print-doc-image" />
              </div>
            )}
            <div className="print-doc-product-info">
              <h1 className="print-doc-product-name">{product.name[locale]}</h1>
              <div className="print-doc-meta-grid">
                <div className="print-doc-meta-item">
                  <dt>{t('product.print.productReference')}</dt>
                  <dd>{product.sku}</dd>
                </div>
                {brand && (
                  <div className="print-doc-meta-item">
                    <dt>{t('product.brand')}</dt>
                    <dd>{brand.name}</dd>
                  </div>
                )}
                {category && (
                  <div className="print-doc-meta-item">
                    <dt>{t('product.category')}</dt>
                    <dd>{category.name[locale]}</dd>
                  </div>
                )}
                {product.productInfo?.subCategory && (
                  <div className="print-doc-meta-item">
                    <dt>{t('product.subCategory')}</dt>
                    <dd>{product.productInfo.subCategory}</dd>
                  </div>
                )}
                <div className="print-doc-meta-item">
                  <dt>{t('product.print.availability')}</dt>
                  <dd>{availabilityBadge.label}</dd>
                </div>
                <div className="print-doc-meta-item">
                  <dt>{t('product.price')}</dt>
                  <dd className="print-doc-price">
                    {product.sellPrice != null && product.sellPrice > 0
                      ? <>{product.sellPrice.toFixed(2)} <span className="print-doc-currency">{product.currency || 'JOD'}</span></>
                      : <span className="print-doc-on-request">{t('product.priceOnRequest')}</span>
                    }
                  </dd>
                </div>
                {product.productInfo?.barcode && (
                  <div className="print-doc-meta-item">
                    <dt>{t('product.barcode')}</dt>
                    <dd>{product.productInfo.barcode}</dd>
                  </div>
                )}
                {product.productInfo?.unit && (
                  <div className="print-doc-meta-item">
                    <dt>{t('product.unitInfo')}</dt>
                    <dd>{product.productInfo.unit}</dd>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* TECHNICAL SPECIFICATIONS */}
        <section className="print-doc-section">
          <h2 className="print-doc-section-title">{t('product.print.specifications')}</h2>
          {hasSpecs || hasMetadata ? (
            <table className="print-doc-table">
              <thead>
                <tr>
                  <th>{locale === 'ar' ? 'الم Specification' : 'Specification'}</th>
                  <th>{locale === 'ar' ? 'القيمة' : 'Value'}</th>
                </tr>
              </thead>
              <tbody>
                {product.specifications.map(spec => (
                  <tr key={spec.id}>
                    <td>{spec.label[locale]}</td>
                    <td>{spec.value[locale]}</td>
                  </tr>
                ))}
                {product.technicalMetadata.map((meta, idx) => (
                  <tr key={`meta-${idx}`}>
                    <td>{meta.key[locale]}</td>
                    <td>{meta.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="print-doc-message">{t('product.print.noSpecsMessage')}</div>
          )}
        </section>

        {/* TDS / DOCUMENTS */}
        <section className="print-doc-section">
          <h2 className="print-doc-section-title">{t('product.print.tdsTitle')}</h2>
          {hasDocuments ? (
            <table className="print-doc-table">
              <thead>
                <tr>
                  <th>{locale === 'ar' ? 'العنوان' : 'Title'}</th>
                  <th>{locale === 'ar' ? 'النوع' : 'Type'}</th>
                  <th>{locale === 'ar' ? 'الحجم' : 'Size'}</th>
                </tr>
              </thead>
              <tbody>
                {product.documents.map(doc => (
                  <tr key={doc.id}>
                    <td>{doc.title[locale]}</td>
                    <td>{(doc.fileType || '').toUpperCase()}</td>
                    <td>{doc.fileSize || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="print-doc-message">{t('product.print.noDocumentsMessage')}</div>
          )}
        </section>

        {/* FOOTER */}
        <footer className="print-doc-footer">
          <div className="print-doc-footer-left">
            <img src="/shanan-logo.png" alt="SHANAN" className="print-doc-footer-logo" />
            <span>SHANAN</span>
          </div>
          <div className="print-doc-footer-center">
            <span>{product.sku}</span>
          </div>
          <div className="print-doc-footer-right">
            <span>{formatListedDate(new Date().toISOString(), locale)}</span>
          </div>
        </footer>
      </div>
      {/* ===== END PRINT-ONLY DOCUMENT ===== */}

      <div className="container">
        {/* Breadcrumb */}
        <nav className="breadcrumb">
          <Link to="/">{t('nav.home')}</Link>
          <span className="breadcrumb-sep">/</span>
          <Link to="/catalog">{t('nav.catalog')}</Link>
          {category && (
            <>
              <span className="breadcrumb-sep">/</span>
              <Link to={`/catalog?category=${category.id}`}>{category.name[locale]}</Link>
            </>
          )}
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{product.name[locale]}</span>
        </nav>

        <Link to="/catalog" className="btn btn-ghost btn-sm" style={{ marginBottom: 24 }}>
          <ArrowIcon />
          {t('product.backToCatalog')}
        </Link>

        <div className="product-detail-layout">
          {/* Image Gallery */}
          <div className="product-detail-gallery">
            <div className="product-detail-main-image">
              {(product.images?.length || 0) > 0 ? (
                <img src={product.images?.[activeImageIdx]?.url} alt={product.images?.[activeImageIdx]?.alt ?? product.name[locale]} />
              ) : (
                <div className={`product-detail-image-placeholder placeholder-${category?.slug ?? 'default'}`}>
                  <ProductDetailGlyph slug={category?.slug ?? ''} />
                  <div className="product-detail-image-meta">
                    <span className="product-detail-image-cat">{category ? category.name[locale] : ''}</span>
                    <span className="product-detail-image-sku">{product.sku}</span>
                    <span className="product-detail-image-tag">{t('product.noImage')}</span>
                  </div>
                </div>
              )}
            </div>
            {(product.images?.length || 0) > 1 && (
              <div className="product-detail-thumbnails">
                {product.images?.map((img, idx) => (
                  <button
                    key={img.id}
                    className={`product-detail-thumbnail ${idx === activeImageIdx ? 'product-detail-thumbnail-active' : ''}`}
                    onClick={() => setActiveImageIdx(idx)}
                  >
                    <img src={img.url} alt={img.alt ?? ''} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info Panel */}
          <div className="product-detail-info">
            <div className="product-detail-info-header">
              {category && <span className="product-detail-category">{category.name[locale]}</span>}
              <h1 className="product-detail-name">{product.name[locale]}</h1>
              <span className={`badge ${availabilityBadge.class}`}>{availabilityBadge.label}</span>
            </div>

            <div className="product-detail-meta-grid">
              <div className="product-detail-meta-item">
                <span className="product-detail-meta-label">{t('product.sku')}</span>
                <span className="product-detail-meta-value">{product.sku}</span>
              </div>
              {brand && (
                <div className="product-detail-meta-item">
                  <span className="product-detail-meta-label">{t('product.brand')}</span>
                  <span className="product-detail-meta-value">
                    <Link to={`/catalog?brand=${brand.id}`}>{brand.name}</Link>
                  </span>
                </div>
              )}
              {product.manufacturer && (
                <div className="product-detail-meta-item">
                  <span className="product-detail-meta-label">{t('product.manufacturer')}</span>
                  <span className="product-detail-meta-value">{product.manufacturer}</span>
                </div>
              )}
              {product.createdAt && (
                <div className="product-detail-meta-item">
                  <span className="product-detail-meta-label">{t('product.listedOn')}</span>
                  <span className="product-detail-meta-value">{formatListedDate(product.createdAt, locale)}</span>
                </div>
              )}
            </div>

            <div className="product-detail-pricing-section">
              <div className="product-detail-pricing-data">
                <span className="product-detail-pricing-label">{t('product.unitPrice')}</span>
                {product.sellPrice != null && product.sellPrice > 0 ? (
                  <span className="product-detail-pricing-value">
                    {product.sellPrice.toFixed(2)} <span className="product-detail-currency">{product.currency || 'JOD'}</span>
                    {product.productInfo?.unit && (
                      <span className="product-detail-price-unit">
                        <span className="product-detail-price-unit-sep">/</span>{product.productInfo.unit}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="product-detail-pricing-on-request">{t('product.priceOnRequest')}</span>
                )}
              </div>
              <p className="product-detail-pricing-note">{t('product.indicativeNote')}</p>
            </div>

            {product.description && (
              <div className="product-detail-section">
                <h2 className="product-detail-section-title">{t('product.description')}</h2>
                <p className="product-detail-description">{product.description[locale]}</p>
              </div>
            )}

            {/* Product Information — real data from productInfo */}
            {product.productInfo && (product.productInfo.barcode || product.productInfo.unit || product.productInfo.subCategory) && (
              <div className="product-detail-section">
                <h2 className="product-detail-section-title">{t('product.productInfo')}</h2>
                <div className="spec-table">
                  {product.productInfo.barcode && (
                    <div className="spec-row">
                      <span className="spec-label">{t('product.barcode')}</span>
                      <span className="spec-value">{product.productInfo.barcode}</span>
                    </div>
                  )}
                  {product.productInfo.unit && (
                    <div className="spec-row">
                      <span className="spec-label">{t('product.unitInfo')}</span>
                      <span className="spec-value">{product.productInfo.unit}</span>
                    </div>
                  )}
                  {product.productInfo.subCategory && (
                    <div className="spec-row">
                      <span className="spec-label">{t('product.subCategory')}</span>
                      <span className="spec-value">{product.productInfo.subCategory}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="product-detail-actions">
              <button className="btn btn-primary btn-lg product-detail-quote-btn" onClick={handleAddToSupply}>
                <RequestIcon />
                {t('supply.requestSupply')}
              </button>
              <button className="btn btn-outline btn-lg" onClick={() => window.print()}>
                <PrintIcon />
                {t('product.print')}
              </button>
            </div>

            <div className="product-detail-shanan-trust">
              <div className="product-detail-shanan-logo-wrap">
                <img src="/shanan-logo.png" alt="SHANAN" className="product-detail-shanan-logo" />
              </div>
              <div className="product-detail-shanan-info">
                <span className="product-detail-shanan-name">SHANAN</span>
                <span className="product-detail-shanan-tagline">{locale === 'ar' ? 'منصة التوريد الصناعية' : 'Industrial Supply Platform'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Specifications */}
        <section className="product-detail-section-full">
          <h2 className="product-detail-section-title">{t('product.specifications')}</h2>
          {product.specifications.length > 0 ? (
            <div className="spec-table">
              {product.specifications.map(spec => (
                <div key={spec.id} className="spec-row">
                  <span className="spec-label">{spec.label[locale]}</span>
                  <span className="spec-value">{spec.value[locale]}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="product-detail-empty">{t('product.noSpecs')}</p>
          )}
        </section>

        {/* Technical Metadata */}
        <section className="product-detail-section-full">
          <h2 className="product-detail-section-title">{t('product.technicalMetadata')}</h2>
          {product.technicalMetadata.length > 0 ? (
            <div className="spec-table">
              {product.technicalMetadata.map((meta, idx) => (
                <div key={idx} className="spec-row">
                  <span className="spec-label">{meta.key[locale]}</span>
                  <span className="spec-value">{meta.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="product-detail-empty">{t('product.noMetadata')}</p>
          )}
        </section>

        {/* Documents */}
        <section className="product-detail-section-full">
          <h2 className="product-detail-section-title">{t('product.documents')}</h2>
          {product.documents.length > 0 ? (
            <div className="documents-grid">
              {product.documents.map(doc => (
                <a key={doc.id} href={doc.url} className="document-card" target="_blank" rel="noopener noreferrer">
                  <div className="document-icon">{fileTypeLabels[doc.fileType] ?? 'FILE'}</div>
                  <div className="document-info">
                    <span className="document-title">{doc.title[locale]}</span>
                    {doc.fileSize && <span className="document-size">{doc.fileSize}</span>}
                  </div>
                  <DownloadIcon />
                </a>
              ))}
            </div>
          ) : (
            <p className="product-detail-empty">{t('product.noDocuments')}</p>
          )}
        </section>
      </div>
    </div>
  );
}

function ImagePlaceholderIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.5-3.5L7 22" />
    </svg>
  );
}

// Larger version of the ProductCard glyph, themed per category,
// for the product detail gallery's main image area.
function ProductDetailGlyph({ slug }: { slug: string }) {
  const glyphBySlug: Record<string, JSX.Element> = {
    fasteners: (
      <svg viewBox="0 0 48 48" width="96" height="96" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="18" r="8" /><path d="M16 18h16M24 10v16M20 26l-4 12M28 26l4 12M18 32h12" />
      </svg>
    ),
    bearings: (
      <svg viewBox="0 0 48 48" width="96" height="96" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="24" r="16" /><circle cx="24" cy="24" r="6" />
        <circle cx="24" cy="8" r="2" /><circle cx="24" cy="40" r="2" /><circle cx="8" cy="24" r="2" /><circle cx="40" cy="24" r="2" />
        <circle cx="12" cy="12" r="2" /><circle cx="36" cy="36" r="2" /><circle cx="36" cy="12" r="2" /><circle cx="12" cy="36" r="2" />
      </svg>
    ),
    'power-transmission': (
      <svg viewBox="0 0 48 48" width="96" height="96" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="24" r="8" /><circle cx="36" cy="24" r="6" /><path d="M20 24h10" />
      </svg>
    ),
    'pneumatics-hydraulics': (
      <svg viewBox="0 0 48 48" width="96" height="96" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="14" y="8" width="20" height="32" rx="2" /><path d="M14 18h20M14 30h20M24 18v12" /><circle cx="24" cy="24" r="3" />
      </svg>
    ),
    electrical: (
      <svg viewBox="0 0 48 48" width="96" height="96" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M28 4 12 26h10l-4 18L36 22H26l2-18Z" />
      </svg>
    ),
    tools: (
      <svg viewBox="0 0 48 48" width="96" height="96" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 6 12 24l4 4L34 10Z" /><path d="M16 28 8 36l4 4 8-8" /><circle cx="34" cy="14" r="2" />
      </svg>
    ),
    safety: (
      <svg viewBox="0 0 48 48" width="96" height="96" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 4 8 12v12c0 10 7 18 16 20 9-2 16-10 16-20V12L24 4Z" /><path d="M18 24l4 4 8-8" />
      </svg>
    ),
    'plumbing-valves': (
      <svg viewBox="0 0 48 48" width="96" height="96" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="20" r="8" /><path d="M24 28v8M20 36h8M16 20H6M32 20h10" />
      </svg>
    ),
  };
  return <div className="product-detail-image-glyph">{glyphBySlug[slug] ?? <ImagePlaceholderIcon />}</div>;
}
