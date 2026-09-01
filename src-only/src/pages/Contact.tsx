import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { MapPinIcon, PhoneIcon, MailIcon, ClockIcon, CheckIcon } from '../components/icons';

export default function Contact() {
  const { t } = useLanguage();

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = t('supply.required');
    if (!form.email.trim()) e.email = t('supply.required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = t('supply.invalidEmail');
    if (!form.subject.trim()) e.subject = t('supply.required');
    if (!form.message.trim()) e.message = t('supply.required');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1200));
    setSubmitting(false);
    setSubmitted(true);
  };

  const contactInfo = [
    { icon: <MapPinIcon />, label: t('contact.address'), value: t('contact.comingSoon'), link: null },
    { icon: <PhoneIcon />, label: t('contact.phoneLabel'), value: t('contact.comingSoon'), link: null },
    { icon: <MailIcon />, label: t('contact.emailLabel'), value: t('contact.comingSoon'), link: null },
    { icon: <ClockIcon />, label: t('contact.hours'), value: t('contact.hoursValue'), link: null },
  ];

  return (
    <div className="contact-page">
      <section className="about-hero">
        <div className="container">
          <h1 className="page-title">{t('contact.title')}</h1>
          <p className="page-subtitle" style={{ maxWidth: 640, margin: '0 auto' }}>
            {t('contact.subtitle')}
          </p>
        </div>
      </section>

      <div className="container" style={{ padding: '48px 0' }}>
        <div className="contact-layout">
          {/* Contact info */}
          <div className="contact-info">
            <h2 className="contact-info-title">{t('contact.info')}</h2>
            <div className="contact-info-list">
              {contactInfo.map((info, i) => (
                <div key={i} className="contact-info-item">
                  <div className="contact-info-icon">{info.icon}</div>
                  <div className="contact-info-text">
                    <span className="contact-info-label">{info.label}</span>
                    {info.link ? (
                      <a className="contact-info-value contact-info-value-link" href={info.link} target="_blank" rel="noopener noreferrer">
                        {info.value}
                      </a>
                    ) : (
                      <span className={`contact-info-value ${info.value === t('contact.comingSoon') ? 'contact-info-value-muted' : ''}`}>
                        {info.value}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="contact-info-available-note">{t('contact.comingSoonDesc')}</p>
          </div>

          {/* Contact form */}
          <div className="contact-form-wrapper">
            {submitted ? (
              <div className="contact-success">
                <div className="supply-success-icon">
                  <CheckIcon />
                </div>
                <p className="contact-success-text">{t('contact.success')}</p>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setSubmitted(false);
                    setForm({ name: '', email: '', phone: '', subject: '', message: '' });
                  }}
                >
                  {t('common.clear')}
                </button>
              </div>
            ) : (
              <>
                <h2 className="contact-form-title">{t('contact.formTitle')}</h2>
                <form onSubmit={handleSubmit} noValidate>
                  <div className="supply-form-grid">
                    <div className="form-group">
                      <label className="form-label" htmlFor="contact-name">{t('contact.name')} *</label>
                      <input
                        id="contact-name"
                        type="text"
                        className="form-input"
                        value={form.name}
                        required
                        aria-required="true"
                        onChange={e => setForm({ ...form, name: e.target.value })}
                      />
                      {errors.name && <span className="form-error">{errors.name}</span>}
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="contact-email">{t('contact.email')} *</label>
                      <input
                        id="contact-email"
                        type="email"
                        className="form-input"
                        value={form.email}
                        required
                        aria-required="true"
                        onChange={e => setForm({ ...form, email: e.target.value })}
                      />
                      {errors.email && <span className="form-error">{errors.email}</span>}
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="contact-phone">{t('contact.phone')}</label>
                      <input
                        id="contact-phone"
                        type="tel"
                        className="form-input"
                        value={form.phone}
                        onChange={e => setForm({ ...form, phone: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="contact-subject">{t('contact.subject')} *</label>
                      <input
                        id="contact-subject"
                        type="text"
                        className="form-input"
                        value={form.subject}
                        required
                        aria-required="true"
                        onChange={e => setForm({ ...form, subject: e.target.value })}
                      />
                      {errors.subject && <span className="form-error">{errors.subject}</span>}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="contact-message">{t('contact.message')} *</label>
                    <textarea
                      id="contact-message"
                      className="form-textarea"
                      value={form.message}
                      required
                      aria-required="true"
                      onChange={e => setForm({ ...form, message: e.target.value })}
                    />
                    {errors.message && <span className="form-error">{errors.message}</span>}
                  </div>
                  <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
                    {submitting ? t('contact.submitting') : t('contact.submit')}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
