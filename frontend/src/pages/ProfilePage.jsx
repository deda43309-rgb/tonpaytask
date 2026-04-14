import { useNavigate } from 'react-router-dom';
import { hapticFeedback } from '../utils/telegram';
import './ProfilePage.css';

export default function ProfilePage({ user }) {
  const navigate = useNavigate();

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  return (
    <div className="page profile-page">
      <div className="section-header">
        <h1 className="section-title">👤 Профиль</h1>
      </div>

      {/* Profile Card */}
      <div className="card profile-card animate-slide">
        <div className="profile-avatar">
          {user?.photo_url ? (
            <img src={user.photo_url} alt="" className="profile-avatar-img" />
          ) : (
            <span className="profile-avatar-text">
              {(user?.first_name || 'U')[0].toUpperCase()}
            </span>
          )}
        </div>
        <h2 className="profile-name">
          {user?.first_name || ''} {user?.last_name || ''}
        </h2>
        {user?.username && (
          <p className="profile-username">@{user.username}</p>
        )}
        <p className="profile-member-since">
          С нами с {memberSince}
        </p>
      </div>

      {/* Balance Stats */}
      <div className="profile-stats mt-16 animate-slide" style={{ animationDelay: '100ms' }}>
        <div className="card profile-stat-row">
          <div className="profile-stat">
            <span className="profile-stat-icon">💎</span>
            <div className="profile-stat-text">
              <span className="profile-stat-value">{(user?.balance || 0).toLocaleString()}</span>
              <span className="profile-stat-label">Баланс</span>
            </div>
          </div>
          <div className="profile-stat-sep" />
          <div className="profile-stat">
            <span className="profile-stat-icon">📊</span>
            <div className="profile-stat-text">
              <span className="profile-stat-value">{(user?.total_earned || 0).toLocaleString()}</span>
              <span className="profile-stat-label">Всего заработано</span>
            </div>
          </div>
        </div>

        <div className="card profile-stat-row mt-10">
          <div className="profile-stat">
            <span className="profile-stat-icon">✅</span>
            <div className="profile-stat-text">
              <span className="profile-stat-value">{user?.tasks_completed || 0}</span>
              <span className="profile-stat-label">Заданий выполнено</span>
            </div>
          </div>
          <div className="profile-stat-sep" />
          <div className="profile-stat">
            <span className="profile-stat-icon">👥</span>
            <div className="profile-stat-text">
              <span className="profile-stat-value">{user?.referral_count || 0}</span>
              <span className="profile-stat-label">Рефералов</span>
            </div>
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="profile-menu mt-16 animate-slide" style={{ animationDelay: '200ms' }}>
        <div className="card profile-menu-card">
          <button
            className="profile-menu-item"
            onClick={() => { hapticFeedback('light'); navigate('/referral'); }}
            id="menu-referral"
          >
            <span className="profile-menu-icon">🎁</span>
            <span className="profile-menu-label">Реферальная программа</span>
            <span className="profile-menu-arrow">›</span>
          </button>

          <div className="profile-menu-divider" />

          <button
            className="profile-menu-item"
            onClick={() => { hapticFeedback('light'); navigate('/tasks'); }}
            id="menu-tasks"
          >
            <span className="profile-menu-icon">📋</span>
            <span className="profile-menu-label">Мои задания</span>
            <span className="profile-menu-arrow">›</span>
          </button>

          <div className="profile-menu-divider" />

          <button
            className="profile-menu-item"
            onClick={() => { hapticFeedback('light'); navigate('/advertiser'); }}
            id="menu-advertiser"
          >
            <span className="profile-menu-icon">📢</span>
            <span className="profile-menu-label">Рекламодатель</span>
            <span className="profile-menu-arrow">›</span>
          </button>

          {user?.is_admin ? (
            <>
              <div className="profile-menu-divider" />
              <button
                className="profile-menu-item"
                onClick={() => { hapticFeedback('light'); navigate('/admin'); }}
                id="menu-admin"
              >
                <span className="profile-menu-icon">⚙️</span>
                <span className="profile-menu-label">Админ-панель</span>
                <span className="profile-menu-arrow">›</span>
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* User ID Footer */}
      <div className="profile-footer mt-24 animate-fade">
        <p className="profile-id">ID: {user?.id || '—'}</p>
        <p className="profile-version">TonPayTask v1.0</p>
      </div>
    </div>
  );
}
