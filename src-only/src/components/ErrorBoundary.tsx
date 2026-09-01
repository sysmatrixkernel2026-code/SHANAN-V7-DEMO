import { Component, ReactNode } from 'react';

// ============================================================
// ErrorBoundary — Catches rendering errors in child components
// to prevent a single component failure from blanking the
// entire application.
//
// Placed at the top level in main.tsx, wrapping the entire app.
// Shows a bilingual fallback UI with a recovery action.
// ============================================================

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: Error): ErrorBoundaryState {
    // Update state so the next render shows the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log safely for development/debugging — no sensitive data is exposed to the user
    console.error('[SHANAN ErrorBoundary]', error.message, errorInfo.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Bilingual fallback UI — uses simple inline styles to avoid
      // dependency on CSS that might also have failed to load
      const isRTL = document.dir === 'rtl' || document.documentElement.dir === 'rtl';
      const containerStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '40px 20px',
        fontFamily: 'Inter, Arial, sans-serif',
        backgroundColor: '#0B2545',
        color: '#fff',
        textAlign: 'center',
        direction: isRTL ? 'rtl' : 'ltr',
      };
      const buttonStyle: React.CSSProperties = {
        marginTop: '24px',
        padding: '12px 32px',
        fontSize: '14px',
        fontWeight: 600,
        border: 'none',
        borderRadius: '6px',
        backgroundColor: '#3b82f6',
        color: '#fff',
        cursor: 'pointer',
      };

      return (
        <div style={containerStyle}>
          <div style={{ maxWidth: '480px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '12px' }}>
              {isRTL ? 'حدث خطأ غير متوقع' : 'Something went wrong'}
            </h1>
            <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#cbd5e1', marginBottom: '8px' }}>
              {isRTL
                ? 'واجه التطبيق خطأ أثناء عرض هذه الصفحة. يمكنك المحاولة مرة أخرى.'
                : 'The application encountered an unexpected error while rendering this page. You can try again.'}
            </p>
            <p style={{ fontSize: '12px', color: '#94a3b8' }}>
              {isRTL ? 'إذا استمرت المشكلة، يرجى تحديث الصفحة أو الاتصال بالدعم.' : 'If the problem persists, please refresh the page or contact support.'}
            </p>
            <button style={buttonStyle} onClick={this.handleReset}>
              {isRTL ? 'إعادة المحاولة' : 'Try Again'}
            </button>
            <br />
            <a
              href="/"
              style={{
                display: 'inline-block',
                marginTop: '12px',
                fontSize: '12px',
                color: '#60a5fa',
                textDecoration: 'underline',
              }}
            >
              {isRTL ? 'العودة للصفحة الرئيسية' : 'Go to Home'}
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
