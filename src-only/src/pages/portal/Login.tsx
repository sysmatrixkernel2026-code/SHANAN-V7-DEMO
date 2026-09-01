import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';

export default function Login() {
  const { t } = useLanguage();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{email?: string; password?: string}>({});

  const validateForm = (): boolean => {
    const errors: {email?: string; password?: string} = {};
    if (!email.trim()) {
      errors.email = t('portal.errEmailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = t('portal.errEmailInvalid');
    }
    if (!password) {
      errors.password = t('portal.errPasswordRequired');
    } else if (password.length < 8) {
      errors.password = t('portal.errPasswordMinLength');
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const loggedInUser = await login(email, password);
      navigate(loggedInUser.userType === 'internal'
        ? '/admin/supply-requests'
        : loggedInUser.userType === 'supplier'
          ? '/supplier/dashboard'
          : '/portal/my-requests');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('portal.loginError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="portal-login-page">
      <div className="portal-login-card">
        <img src="/shanan-logo.png" alt="SHANAN" className="portal-login-logo" width="64" height="64" />
        <h1 className="portal-login-title">{t('portal.loginTitle')}</h1>
        <p className="portal-login-subtitle">{t('portal.loginSubtitle')}</p>
        <form onSubmit={handleSubmit} className="portal-login-form">
          <div className="form-group">
            <label className="form-label">{t('portal.email')}</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={e => { setEmail(e.target.value); setValidationErrors({}); }}
              required
              autoComplete="email"
              placeholder={t('portal.emailPlaceholder')}
            />
            {validationErrors.email && <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>{validationErrors.email}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">{t('portal.password')}</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={e => { setPassword(e.target.value); setValidationErrors({}); }}
              required
              minLength={8}
              autoComplete="current-password"
              placeholder={t('portal.passwordPlaceholder')}
            />
            {validationErrors.password && <span style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px', display: 'block' }}>{validationErrors.password}</span>}
          </div>
          {error && <div className="portal-login-error">{error}</div>}
          <button type="submit" className="btn btn-primary btn-lg portal-login-btn" disabled={submitting || !email.trim() || !password}>
            {submitting ? t('portal.loggingIn') : t('portal.login')}
          </button>
        </form>
      </div>
    </div>
  );
}
