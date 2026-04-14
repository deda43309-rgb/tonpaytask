import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '32px 16px',
          color: '#f87171',
          textAlign: 'center',
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>💥</div>
          <h2 style={{ color: '#f0f0ff', marginBottom: '8px' }}>Ошибка</h2>
          <p style={{ fontSize: '13px', opacity: 0.7, maxWidth: '300px' }}>
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '16px',
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #7c5cfc, #5b8def)',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🔄 Перезагрузить
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
