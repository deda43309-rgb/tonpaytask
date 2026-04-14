import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import Loader from './components/Loader';
import ErrorBoundary from './components/ErrorBoundary';
import HomePage from './pages/HomePage';
import TasksPage from './pages/TasksPage';
import ReferralPage from './pages/ReferralPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import AdvertiserPage from './pages/AdvertiserPage';
import { getStartParam, expandApp, setHeaderColor, setBackgroundColor, getInitData } from './utils/telegram';
import * as api from './utils/api';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Expand the mini app & set colors
    expandApp();
    setHeaderColor('#0a0a1a');
    setBackgroundColor('#0a0a1a');

    // Login
    doLogin();
  }, []);

  const doLogin = async () => {
    try {
      const startParam = getStartParam();
      console.log('[TonPayTask] initData:', getInitData() ? 'present' : 'empty');
      console.log('[TonPayTask] startParam:', startParam);
      const data = await api.login(startParam);
      console.log('[TonPayTask] login result:', data);
      setUser(data.user);
    } catch (err) {
      console.error('[TonPayTask] Login failed:', err);
      setError(err.message || 'Unknown login error');
    } finally {
      setLoading(false);
    }
  };

  const handleUserUpdate = (updater) => {
    if (typeof updater === 'function') {
      setUser(prev => updater(prev));
    } else {
      setUser(prev => ({ ...prev, ...updater }));
    }
  };

  if (loading) {
    return (
      <>
        <div className="app-bg" />
        <Loader text="Загрузка TonPayTask..." />
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="app-bg" />
        <div className="empty-state" style={{ minHeight: '100vh' }}>
          <span className="empty-state-icon">⚠️</span>
          <h3 className="empty-state-title">Ошибка подключения</h3>
          <p className="empty-state-text">{error}</p>
          <p className="empty-state-text" style={{ marginTop: '8px', fontSize: '11px', opacity: 0.5 }}>
            initData: {getInitData() ? '✅' : '❌'}
          </p>
          <button className="btn btn-primary mt-16" onClick={() => { setError(null); setLoading(true); doLogin(); }}>
            🔄 Повторить
          </button>
        </div>
      </>
    );
  }

  return (
    <BrowserRouter>
      <div className="app-bg" />
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<HomePage user={user} onUserUpdate={handleUserUpdate} />} />
          <Route path="/tasks" element={<TasksPage onUserUpdate={handleUserUpdate} />} />
          <Route path="/referral" element={<ReferralPage user={user} />} />
          <Route path="/profile" element={<ProfilePage user={user} />} />
          <Route path="/admin" element={<AdminPage user={user} />} />
          <Route path="/advertiser" element={<AdvertiserPage user={user} />} />
        </Routes>
      </ErrorBoundary>
      <BottomNav />
    </BrowserRouter>
  );
}
