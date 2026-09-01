import { useLanguage } from '../i18n/LanguageContext';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, total, pageSize, onPageChange }: PaginationProps) {
  const { t, locale } = useLanguage();
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(page, totalPages);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="catalog-pagination-wrap">
      <div className="catalog-pagination-info">
        <span className="catalog-pagination-range">
          {locale === 'ar'
            ? `${start}–${end} ${t('catalog.of')} ${total.toLocaleString()} ${t('catalog.results')}`
            : `${start}–${end} ${t('catalog.of')} ${total.toLocaleString()} ${t('catalog.results')}`
          }
        </span>
      </div>
      <nav className="pagination" aria-label="Pagination">
        <button
          className="pagination-btn"
          onClick={() => { onPageChange(page - 1); scrollToTop(); }}
          disabled={page <= 1}
        >
          {locale === 'ar' ? '→' : '←'} {t('catalog.prev')}
        </button>
        {pages.map((p, idx) =>
          p === '...' ? (
            <span key={`ellipsis-${idx}`} className="pagination-ellipsis">…</span>
          ) : (
            <button
              key={p}
              className={`pagination-btn ${p === page ? 'pagination-btn-active' : ''}`}
              onClick={() => { onPageChange(p); scrollToTop(); }}
            >
              {p}
            </button>
          )
        )}
        <button
          className="pagination-btn"
          onClick={() => { onPageChange(page + 1); scrollToTop(); }}
          disabled={page >= totalPages}
        >
          {t('catalog.next')} {locale === 'ar' ? '←' : '→'}
        </button>
      </nav>
    </div>
  );
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getPageNumbers(current: number, total: number): (number | '...')[] {
  const result: (number | '...')[] = [];
  const delta = 2;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      result.push(i);
    } else if (result[result.length - 1] !== '...') {
      result.push('...');
    }
  }
  return result;
}
