import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { useSupplyRequest } from '../context/SupplyRequestContext';
import { CheckIcon, TrashIcon, RequestIcon, PrintIcon, WhatsAppIcon, MailIcon } from '../components/icons';

function buildRequestSummary(opts: {
  reference: string | null;
  requesterName: string;
  companyName: string;
  items: Array<{ productName: string; sku: string; quantity: number }>;
}): string {
  const lines: string[] = [];
  lines.push('SHANAN — Supply Request');
  if (opts.reference) lines.push(`Reference: ${opts.reference}`);
  lines.push(`Requester: ${opts.requesterName}`);
  lines.push(`Company: ${opts.companyName}`);
  lines.push('');
  lines.push('Requested Items:');
  opts.items.forEach((it, i) => {
    lines.push(`  ${i + 1}. ${it.productName}`);
    lines.push(`     SKU: ${it.sku}  |  Qty: ${it.quantity}`);
  });
  lines.push('');
  lines.push('— Sent via SHANAN Engineering Knowledge Platform');
  return lines.join('\n');
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

type Step = 'form' | 'review' | 'success';

export default function SupplyRequest() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const { items, removeItem, updateQuantity, updateNotes, clearItems } = useSupplyRequest();

  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState({
    requesterName: '',
    companyName: '',
    email: '',
    phone: '',
    country: '',
    city: '',
    message: '',
    deliveryDate: '',
    specRequirements: '',
    termsAccepted: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [lastReference, setLastReference] = useState<string | null>(null);
  const [submittedSnapshot, setSubmittedSnapshot] = useState<{
    requesterName: string;
    companyName: string;
    email: string;
    phone: string;
    country: string;
    city: string;
    message: string;
    deliveryDate: string;
    specRequirements: string;
    items: Array<{ productId: string; productName: string; sku: string; quantity: number; notes?: string; productImage?: string }>;
    createdAt: string;
  } | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.requesterName.trim()) e.requesterName = t('supply.required');
    if (!form.companyName.trim()) e.companyName = t('supply.required');
    if (!form.email.trim()) e.email = t('supply.required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = t('supply.invalidEmail');
    if (!form.phone.trim()) e.phone = t('supply.required');
    if (!form.country.trim()) e.country = t('supply.required');
    if (!form.city.trim()) e.city = t('supply.required');
    if (items.length === 0) e.items = t('supply.noItems');
    if (!form.termsAccepted) e.terms = t('supply.termsRequired');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleProceedToReview = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    setServerError(null);
    setSubmitting(true);
    try {
      if (!token) {
        navigate('/login');
        return;
      }
      const res = await fetch(`${API_URL}/api/supply-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          requesterName: form.requesterName,
          companyName: form.companyName,
          email: form.email,
          phone: form.phone,
          country: form.country,
          city: form.city,
          message: [
            form.message,
            form.specRequirements ? `Specification Requirements: ${form.specRequirements}` : '',
          ].filter(Boolean).join('\n'),
          deliveryDate: form.deliveryDate || null,
          items: items.map(it => ({
            productId: it.productId,
            productName: it.productName,
            sku: it.sku,
            quantity: it.quantity,
            notes: it.notes ?? '',
          })),
        }),
      });
      if (!res.ok) {
        setServerError(t('supply.serverError'));
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as { reference?: string; createdAt?: string };
      setSubmittedSnapshot({
        requesterName: form.requesterName,
        companyName: form.companyName,
        email: form.email,
        phone: form.phone,
        country: form.country,
        city: form.city,
        message: form.message,
        deliveryDate: form.deliveryDate,
        specRequirements: form.specRequirements,
        items: items.map(it => ({
          productId: it.productId,
          productName: it.productName,
          sku: it.sku,
          quantity: it.quantity,
          notes: it.notes,
          productImage: it.productImage,
        })),
        createdAt: data.createdAt ?? new Date().toISOString(),
      });
      setLastReference(data.reference ?? null);
      setSubmitting(false);
      setStep('success');
      clearItems();
    } catch {
      setServerError(t('supply.serverError'));
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep('form');
    setLastReference(null);
    setServerError(null);
    setSubmittedSnapshot(null);
    setForm({ requesterName: '', companyName: '', email: '', phone: '', country: '', city: '', message: '', deliveryDate: '', specRequirements: '', termsAccepted: false });
  };

  const shareSummary = submittedSnapshot
    ? buildRequestSummary({
        reference: lastReference,
        requesterName: submittedSnapshot.requesterName,
        companyName: submittedSnapshot.companyName,
        items: submittedSnapshot.items,
      })
    : '';

  const handleWhatsAppShare = () => {
    if (!shareSummary) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(shareSummary)}`, '_blank', 'noopener,noreferrer');
  };

  const handleEmailShare = () => {
    if (!shareSummary) return;
    const subject = lastReference ? `SHANAN Supply Request — ${lastReference}` : 'SHANAN Supply Request';
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shareSummary)}`;
  };

  // === SUCCESS SCREEN ===
  if (step === 'success') {
    return (
      <div className="container" style={{ padding: '64px 0' }}>
        {submittedSnapshot && (
          <div className="print-only print-doc" aria-hidden="true">
            <div className="print-doc-header">
              <img src="/shanan-logo.png" alt="SHANAN" className="print-doc-logo" />
              <div className="print-doc-title-block">
                <span className="print-doc-brand">SHANAN — Engineering Knowledge Platform</span>
                <span className="print-doc-title">{t('supply.printDocTitle')}</span>
              </div>
              {lastReference && (
                <div className="print-doc-meta">
                  <span><strong>{t('supply.referenceLabel')}:</strong> {lastReference}</span>
                  <span><strong>{t('supply.printedOn')}:</strong> {formatDate(submittedSnapshot.createdAt)}</span>
                </div>
              )}
            </div>
            <section className="print-doc-section">
              <h2>{t('supply.printRequesterInfo')}</h2>
              <dl className="print-doc-grid">
                <div><dt>{t('supply.requesterName')}</dt><dd>{submittedSnapshot.requesterName}</dd></div>
                <div><dt>{t('supply.companyName')}</dt><dd>{submittedSnapshot.companyName}</dd></div>
                <div><dt>{t('supply.email')}</dt><dd>{submittedSnapshot.email}</dd></div>
                <div><dt>{t('supply.phone')}</dt><dd>{submittedSnapshot.phone}</dd></div>
                <div><dt>{t('supply.country')}</dt><dd>{submittedSnapshot.country}</dd></div>
                <div><dt>{t('supply.city')}</dt><dd>{submittedSnapshot.city}</dd></div>
                {submittedSnapshot.deliveryDate && (
                  <div><dt>{t('supply.deliveryDate')}</dt><dd>{submittedSnapshot.deliveryDate}</dd></div>
                )}
              </dl>
            </section>
            <section className="print-doc-section">
              <h2>{t('supply.items')}</h2>
              <table className="print-doc-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('admin.colProduct')}</th>
                    <th>{t('admin.colSku')}</th>
                    <th className="num">{t('admin.colQty')}</th>
                    <th>{t('admin.colNotes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {submittedSnapshot.items.map((it, i) => (
                    <tr key={it.productId}>
                      <td>{i + 1}</td>
                      <td>{it.productName}</td>
                      <td className="mono">{it.sku}</td>
                      <td className="num">{it.quantity}</td>
                      <td>{it.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        )}

        <div className="supply-success no-print">
          <div className="supply-success-icon">
            <CheckIcon />
          </div>
          <h1 className="supply-success-title">{t('supply.success')}</h1>
          {lastReference && (
            <div className="supply-success-reference">
              <span className="supply-success-ref-label">{t('supply.referenceLabel')}</span>
              <code className="supply-success-ref-code">{lastReference}</code>
            </div>
          )}
          <p className="supply-success-desc">{t('supply.successNextSteps')}</p>
          <p className="supply-success-timeline-note">{t('supply.successTimelineNote')}</p>
          <div className="supply-success-actions">
            <button className="btn btn-primary" onClick={() => navigate('/portal/my-requests')}>
              {t('supply.successViewRequests')}
            </button>
            <button className="btn btn-outline" onClick={handleReset}>
              {t('supply.successNewRequest')}
            </button>
            <button className="btn btn-outline" onClick={() => window.print()} disabled={!submittedSnapshot}>
              <PrintIcon />
              {t('supply.print')}
            </button>
            <button className="btn btn-outline" onClick={handleWhatsAppShare} disabled={!shareSummary}>
              <WhatsAppIcon />
              {t('supply.shareWhatsapp')}
            </button>
            <button className="btn btn-outline" onClick={handleEmailShare} disabled={!shareSummary}>
              <MailIcon />
              {t('supply.shareEmail')}
            </button>
            <Link to="/catalog" className="btn btn-ghost">
              {t('supply.browseCatalog')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // === REVIEW SCREEN ===
  if (step === 'review') {
    return (
      <div className="container" style={{ padding: '40px 0 64px' }}>
        <div className="page-header">
          <h1 className="page-title">{t('supply.reviewTitle')}</h1>
          <p className="page-subtitle">{t('supply.reviewSubtitle')}</p>
        </div>

        <div className="supply-review">
          <section className="supply-review-section">
            <h2 className="supply-review-section-title">{t('supply.items')} ({items.length})</h2>
            <div className="supply-review-items">
              {items.map((item, idx) => (
                <div key={item.productId} className="supply-review-item">
                  <div className="supply-review-item-num">{idx + 1}</div>
                  <div className="supply-review-item-info">
                    {item.productImage && (
                      <img src={item.productImage} alt={item.productName} className="supply-review-item-img" loading="lazy" />
                    )}
                    <div className="supply-review-item-details">
                      <Link to={`/product/${item.productId}`} className="supply-review-item-name">
                        {item.productName}
                      </Link>
                      <span className="supply-review-item-sku">{t('product.sku')}: {item.sku}</span>
                      {(item.unit || (item.unitPrice != null)) && (
                        <span className="supply-review-item-commercial">
                          {item.unit && <span className="supply-review-item-uom">{item.unit}</span>}
                          {item.unit && (item.unitPrice != null && item.unitPrice > 0) && (
                            <span className="supply-review-item-commercial-sep">·</span>
                          )}
                          {item.unitPrice != null && item.unitPrice > 0 && (
                            <span className="supply-review-item-price">
                              {t('supply.indicativeUnitPrice')}: {item.unitPrice.toFixed(2)} {item.currency || 'JOD'}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="supply-review-item-meta">
                    <div className="supply-review-item-qty">
                      <span className="supply-review-label">{t('supply.reviewQuantity')}</span>
                      <span className="supply-review-value">{item.quantity}</span>
                    </div>
                    {item.notes && (
                      <div className="supply-review-item-notes">
                        <span className="supply-review-label">{t('supply.reviewNotes')}</span>
                        <span className="supply-review-value">{item.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {form.deliveryDate && (
            <section className="supply-review-section">
              <h2 className="supply-review-section-title">{t('supply.deliveryDate')}</h2>
              <p className="supply-review-value">{form.deliveryDate}</p>
            </section>
          )}

          {form.specRequirements && (
            <section className="supply-review-section">
              <h2 className="supply-review-section-title">{t('supply.specificationRequirements')}</h2>
              <p className="supply-review-value">{form.specRequirements}</p>
            </section>
          )}

          <section className="supply-review-section">
            <h2 className="supply-review-section-title">{t('supply.reviewContactInfo')}</h2>
            <div className="supply-review-contact-grid">
              <div className="supply-review-contact-item">
                <span className="supply-review-label">{t('supply.requesterName')}</span>
                <span className="supply-review-value">{form.requesterName}</span>
              </div>
              <div className="supply-review-contact-item">
                <span className="supply-review-label">{t('supply.companyName')}</span>
                <span className="supply-review-value">{form.companyName}</span>
              </div>
              <div className="supply-review-contact-item">
                <span className="supply-review-label">{t('supply.email')}</span>
                <span className="supply-review-value">{form.email}</span>
              </div>
              <div className="supply-review-contact-item">
                <span className="supply-review-label">{t('supply.phone')}</span>
                <span className="supply-review-value">{form.phone}</span>
              </div>
              <div className="supply-review-contact-item">
                <span className="supply-review-label">{t('supply.country')}</span>
                <span className="supply-review-value">{form.country}</span>
              </div>
              <div className="supply-review-contact-item">
                <span className="supply-review-label">{t('supply.city')}</span>
                <span className="supply-review-value">{form.city}</span>
              </div>
            </div>
            {form.message && (
              <div className="supply-review-message">
                <span className="supply-review-label">{t('supply.message')}</span>
                <p className="supply-review-value">{form.message}</p>
              </div>
            )}
          </section>

          {serverError && (
            <div className="supply-error-banner" role="alert">{serverError}</div>
          )}

          <section className="supply-section supply-terms-section">
            <div className="supply-terms-box">
              <p className="supply-terms-text">{t('supply.termsQuoteSummary')}</p>
              <p className="supply-terms-confirmed">
                <CheckIcon />
                {t('supply.termsConfirmed')}
              </p>
              <p className="supply-terms-legal-note">{t('supply.termsLegalNote')}</p>
            </div>
          </section>

          <div className="supply-review-actions">
            <button className="btn btn-outline" onClick={() => setStep('form')}>
              {t('supply.editRequest')}
            </button>
            <button className="btn btn-primary btn-lg" onClick={handleSubmit} disabled={submitting}>
              {submitting ? t('supply.submitting') : t('supply.confirmAndSubmit')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === FORM SCREEN ===
  return (
    <div className="container" style={{ padding: '40px 0 64px' }}>
      <div className="page-header">
        <h1 className="page-title">{t('supply.title')}</h1>
        <p className="page-subtitle">{t('supply.subtitle')}</p>
      </div>

      <form onSubmit={handleProceedToReview} className="supply-form">
        <section className="supply-section">
          <h2 className="supply-section-title">
            {t('supply.items')}
            <span className="supply-items-count">{items.length}</span>
          </h2>

          {items.length === 0 ? (
            <div className="supply-empty-items">
              <RequestIcon />
              <p>{t('supply.noItems')}</p>
              <Link to="/catalog" className="btn btn-secondary">{t('nav.catalog')}</Link>
            </div>
          ) : (
            <div className="supply-items-list">
              {items.map(item => (
                <div key={item.productId} className="supply-item">
                  <div className="supply-item-info">
                    {item.productImage && (
                      <img src={item.productImage} alt={item.productName} className="supply-item-image" loading="lazy" />
                    )}
                    <div className="supply-item-info-text">
                      <Link to={`/product/${item.productId}`} className="supply-item-name">
                        {item.productName}
                      </Link>
                      <span className="supply-item-sku">{t('catalog.sku')}: {item.sku}</span>
                      {(item.unit || (item.unitPrice != null)) && (
                        <span className="supply-item-commercial">
                          {item.unit && (
                            <>
                              <span className="supply-item-uom">{item.unit}</span>
                              <span className="supply-item-commercial-sep">·</span>
                            </>
                          )}
                          {item.unitPrice != null && item.unitPrice > 0 && (
                            <span className="supply-item-price">
                              {t('supply.indicativeUnitPrice')}: {item.unitPrice.toFixed(2)} {item.currency || 'JOD'}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="supply-item-controls">
                    <div className="supply-qty-control">
                      <label className="supply-qty-label">{t('supply.quantity')}</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => updateQuantity(item.productId, parseInt(e.target.value, 10) || 1)}
                        className="form-input supply-qty-input"
                      />
                    </div>
                    <div className="supply-notes-control">
                      <input
                        type="text"
                        placeholder={t('supply.requestNotes')}
                        value={item.notes ?? ''}
                        onChange={e => updateNotes(item.productId, e.target.value)}
                        className="form-input supply-notes-input"
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm supply-remove-btn"
                      onClick={() => removeItem(item.productId)}
                      aria-label={t('supply.removeItem')}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {errors.items && <span className="form-error">{errors.items}</span>}
        </section>

        <section className="supply-section">
          <h2 className="supply-section-title">{t('supply.deliveryDate')}</h2>
          <div className="supply-form-grid">
            <div className="form-group">
              <label className="form-label">
                {t('supply.deliveryDate')}
                <span className="form-label-optional">({t('supply.deliveryDateOptional')})</span>
              </label>
              <input
                type="date"
                className="form-input"
                value={form.deliveryDate}
                onChange={e => setForm({ ...form, deliveryDate: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
            <label className="form-label">{t('supply.specificationRequirements')}</label>
            <textarea
              className="form-textarea"
              placeholder={t('supply.specificationRequirementsPlaceholder')}
              value={form.specRequirements}
              onChange={e => setForm({ ...form, specRequirements: e.target.value })}
              rows={3}
            />
          </div>
        </section>

        <section className="supply-section">
          <h2 className="supply-section-title">{t('supply.contactInfo')}</h2>
          <div className="supply-form-grid">
            <div className="form-group">
              <label className="form-label">{t('supply.requesterName')} *</label>
              <input type="text" className={`form-input${errors.requesterName ? ' is-invalid' : ''}`} value={form.requesterName}
                aria-invalid={errors.requesterName ? true : undefined}
                onChange={e => setForm({ ...form, requesterName: e.target.value })} />
              {errors.requesterName && <span className="form-error">{errors.requesterName}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">{t('supply.companyName')} *</label>
              <input type="text" className={`form-input${errors.companyName ? ' is-invalid' : ''}`} value={form.companyName}
                aria-invalid={errors.companyName ? true : undefined}
                onChange={e => setForm({ ...form, companyName: e.target.value })} />
              {errors.companyName && <span className="form-error">{errors.companyName}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">{t('supply.email')} *</label>
              <input type="email" className={`form-input${errors.email ? ' is-invalid' : ''}`} value={form.email}
                aria-invalid={errors.email ? true : undefined}
                onChange={e => setForm({ ...form, email: e.target.value })} />
              {errors.email && <span className="form-error">{errors.email}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">{t('supply.phone')} *</label>
              <input type="tel" className={`form-input${errors.phone ? ' is-invalid' : ''}`} value={form.phone}
                aria-invalid={errors.phone ? true : undefined}
                onChange={e => setForm({ ...form, phone: e.target.value })} />
              {errors.phone && <span className="form-error">{errors.phone}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">{t('supply.country')} *</label>
              <input type="text" className={`form-input${errors.country ? ' is-invalid' : ''}`} value={form.country}
                aria-invalid={errors.country ? true : undefined}
                onChange={e => setForm({ ...form, country: e.target.value })} />
              {errors.country && <span className="form-error">{errors.country}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">{t('supply.city')} *</label>
              <input type="text" className={`form-input${errors.city ? ' is-invalid' : ''}`} value={form.city}
                aria-invalid={errors.city ? true : undefined}
                onChange={e => setForm({ ...form, city: e.target.value })} />
              {errors.city && <span className="form-error">{errors.city}</span>}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('supply.message')}</label>
            <textarea className="form-textarea" value={form.message}
              onChange={e => setForm({ ...form, message: e.target.value })} />
          </div>
        </section>

        <section className="supply-section supply-terms-section">
          <h2 className="supply-section-title">{t('supply.termsTitle')}</h2>
          <div className={`supply-terms-box ${errors.terms ? 'supply-terms-box-error' : ''}`}>
            <p className="supply-terms-text">{t('supply.termsQuoteSummary')}</p>
            <label className="supply-terms-check">
              <input
                type="checkbox"
                checked={form.termsAccepted}
                onChange={e => setForm({ ...form, termsAccepted: e.target.checked })}
                aria-invalid={errors.terms ? true : undefined}
              />
              <span>{t('supply.termsAcknowledge')}</span>
            </label>
            {errors.terms && <span className="form-error">{errors.terms}</span>}
            <p className="supply-terms-legal-note">{t('supply.termsLegalNote')}</p>
          </div>
        </section>

        {Object.keys(errors).length > 0 && (
          <div className="supply-error-banner">{t('supply.error')}</div>
        )}

        <div className="supply-submit-bar">
          <button type="submit" className="btn btn-primary btn-lg" disabled={items.length === 0}>
            {t('supply.confirmAndSubmit')}
          </button>
        </div>
      </form>
    </div>
  );
}
