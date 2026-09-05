import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { getCategoryById } from '../data/catalog';
import { useSupplyRequest } from '../context/SupplyRequestContext';
import { RequestIcon } from './icons';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { t, locale } = useLanguage();
  const { addItem } = useSupplyRequest();
  const category = getCategoryById(product.categoryId) ?? (product.category ? { name: product.category.name, id: product.categoryId } : undefined);
  const brandName = product.brandName ?? product.brand?.name ?? null;

  const rawImageUrl = product.primaryImage || product.images?.[0]?.url || null;
  const imageUrl = rawImageUrl ? (/^https?:\/\//i.test(rawImageUrl) ? rawImageUrl : (import.meta.env.VITE_API_URL || '') + (rawImageUrl.startsWith('/') ? rawImageUrl : '/' + rawImageUrl)) : null;
  const [imgError, setImgError] = useState(false);
  const showImage = imageUrl && !imgError;

  const hasPrice = product.sellPrice != null && product.sellPrice > 0;
  const formattedPrice = hasPrice ? product.sellPrice!.toFixed(2) : null;

  const availabilityBadge = {
    in_stock: { class: 'badge-success', label: t('catalog.avail.in_stock') },
    limited: { class: 'badge-warning', label: t('catalog.avail.limited') },
    out_of_stock: { class: 'badge-error', label: t('catalog.avail.out_of_stock') },
    on_request: { class: 'badge-info', label: t('catalog.avail.on_request') },
  }[product.availability];

  const handleAddToSupply = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem({
      productId: product.id,
      productName: product.name[locale],
      sku: product.sku,
      quantity: 1,
      productImage: imageUrl || undefined,
      categoryId: product.categoryId,
      brandId: product.brandId || undefined,
    });
  };

  return (
    <article className="product-card">
      <Link to={`/product/${product.id}`} className="product-card-link">
        <div className="product-card-image">
          {showImage ? (
            <img
              className="product-card-photo"
              src={imageUrl}
              alt={product.name[locale]}
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className={`product-card-image-placeholder placeholder-${product.categoryId}`}>
              <ProductImageGlyph categoryId={product.categoryId} />
              <div className="product-card-image-meta">
                <span className="product-card-image-sku">{product.sku}</span>
              </div>
            </div>
          )}
          <span className={`product-card-badge badge ${availabilityBadge.class}`}>
            {availabilityBadge.label}
          </span>
          {brandName && (
            <span className="product-card-brand-badge">{brandName}</span>
          )}
        </div>
      </Link>

      <div className="product-card-body">
        {category && (
          <span className="product-card-category">{category.name[locale]}</span>
        )}

        <Link to={`/product/${product.id}`} className="product-card-name-link">
          <h3 className="product-card-name">{product.name[locale]}</h3>
        </Link>

        <div className="product-card-meta-row">
          <span className="product-card-sku">{product.sku}</span>
        </div>

        <div className="product-card-pricing">
          {formattedPrice ? (
            <div className="product-card-price-block">
              <span className="product-card-price">{formattedPrice}</span>
              <span className="product-card-currency">{product.currency || 'JOD'}</span>
            </div>
          ) : (
            <span className="product-card-price-on-request">
              {t('catalog.priceOnRequest')}
            </span>
          )}
        </div>

        <div className="product-card-actions">
          <Link to={`/product/${product.id}`} className="btn btn-outline btn-sm product-card-btn">
            {t('catalog.details')}
          </Link>
          <button
            className="btn btn-primary btn-sm product-card-btn product-card-supply-btn"
            onClick={handleAddToSupply}
          >
            <RequestIcon />
            {t('supply.requestSupply')}
          </button>
        </div>
      </div>
    </article>
  );
}

function ProductImageGlyph({ categoryId }: { categoryId: string }) {
  const glyphBySlug: Record<string, JSX.Element> = {
    fasteners: (
      <svg viewBox="0 0 48 48" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="18" r="8" />
        <path d="M16 18h16M24 10v16M20 26l-4 12M28 26l4 12M18 32h12" />
      </svg>
    ),
    bearings: (
      <svg viewBox="0 0 48 48" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="24" r="16" />
        <circle cx="24" cy="24" r="6" />
        <circle cx="24" cy="8" r="2" /><circle cx="24" cy="40" r="2" />
        <circle cx="8" cy="24" r="2" /><circle cx="40" cy="24" r="2" />
        <circle cx="12" cy="12" r="2" /><circle cx="36" cy="36" r="2" />
        <circle cx="36" cy="12" r="2" /><circle cx="12" cy="36" r="2" />
      </svg>
    ),
    'power-transmission': (
      <svg viewBox="0 0 48 48" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="24" r="8" /><circle cx="36" cy="24" r="6" />
        <path d="M20 24h10" /><path d="M12 16l4-4M12 32l4 4M36 18l-3-3M36 30l-3 3" />
      </svg>
    ),
    'pneumatics-hydraulics': (
      <svg viewBox="0 0 48 48" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="14" y="8" width="20" height="32" rx="2" />
        <path d="M14 18h20M14 30h20M24 18v12" /><circle cx="24" cy="24" r="3" />
      </svg>
    ),
    electrical: (
      <svg viewBox="0 0 48 48" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M28 4 12 26h10l-4 18L36 22H26l2-18Z" />
      </svg>
    ),
    tools: (
      <svg viewBox="0 0 48 48" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 6 12 24l4 4L34 10Z" /><path d="M16 28 8 36l4 4 8-8" /><circle cx="34" cy="14" r="2" />
      </svg>
    ),
    safety: (
      <svg viewBox="0 0 48 48" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 4 8 12v12c0 10 7 18 16 20 9-2 16-10 16-20V12L24 4Z" /><path d="M18 24l4 4 8-8" />
      </svg>
    ),
    'plumbing-valves': (
      <svg viewBox="0 0 48 48" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="20" r="8" /><path d="M24 28v8M20 36h8M16 20H6M32 20h10" />
      </svg>
    ),
  };
  return (
    <div className="product-card-image-glyph">
      {glyphBySlug[categoryId] ?? <ImagePlaceholderIcon />}
    </div>
  );
}

function ImagePlaceholderIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.5-3.5L7 22" />
    </svg>
  );
}
