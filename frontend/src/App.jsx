import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import Loader from './components/Loader';
import HomePage from './pages/HomePage';
import TasksPage from './pages/TasksPage';
import ReferralPage from './pages/ReferralPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import { getStartParam, expandApp, setHeaderColor, setBackgroundColor } from './utils/telegram';
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
      const data = await api.login(startParam);
      setUser(data.user);
    } catch (err) {
      console.error('Login failed:', err);
      setError(err.message);
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
          <button className="btn btn-primary mt-16" onClick={() => { setError(null); setLoading(true); doLogin(); }}>
            🔄 Повторить
          </button>
        </div>
      </>
    );
  }

  return (
    <HashRouter>
      <div className="app-bg" />
      <Routes>
        <Route path="/" element={<HomePage user={user} onUserUpdate={handleUserUpdate} />} />
        <Route path="/tasks" element={<TasksPage onUserUpdate={handleUserUpdate} />} />
        <Route path="/referral" element={<ReferralPage user={user} />} />
        <Route path="/profile" element={<ProfilePage user={user} />} />
        <Route path="/admin" element={<AdminPage user={user} />} />
      </Routes>
      <BottomNav />
    </HashRouter>
  );
}
