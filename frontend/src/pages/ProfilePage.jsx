import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hapticFeedback } from '../utils/telegram';
import { formatTON } from '../utils/format';
import * as api from '../utils/api';
import './ProfilePage.css';

export default function ProfilePage({ user }) {
  const navigate = useNavigate();
  const [penaltyData, setPenaltyData] = useState(null);

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  useEffect(() => {
    api.getPenalties().then(setPenaltyData).catch(() => {});
  }, []);

  const statusLabel = (status) => {
    switch (status) {
      case 'pending': return { text: '⏳ На проверке', color: '#ff9500' };
      case 'passed': return { text: '✅ Ок', color: '#34c759' };
      case 'penalized': return { text: '🚫 Штраф', color: '#ff3b30' };
      default: return { text: status, color: 'var(--text-muted)' };
    }
  };

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
              <span className="profile-stat-value">{formatTON(user?.balance || 0)}</span>
              <span className="profile-stat-label">Баланс</span>
            </div>
          </div>
          <div className="profile-stat-sep" />
          <div className="profile-stat">
            <span className="profile-stat-icon">📊</span>
            <div className="profile-stat-text">
              <span className="profile-stat-value">{formatTON(user?.total_earned || 0)}</span>
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

      {/* Karma */}
      {(() => {
        const karma = user?.karma ?? 100;
        const karmaColor = karma >= 80 ? '#34c759' : karma >= 50 ? '#ff9500' : karma >= 20 ? '#ff6b00' : '#ff3b30';
        const karmaLabel = karma >= 80 ? '🌟 Отличная' : karma >= 50 ? '⚡ Нормальная' : karma >= 20 ? '⚠️ Низкая' : '🚫 Критическая';
        return (
          <div className="mt-16 animate-slide" style={{ animationDelay: '120ms' }}>
            <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>☯️</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Карма</div>
                  <div style={{ fontSize: 11, color: karmaColor, fontWeight: 600 }}>{karmaLabel}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: karmaColor }}>{karma}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>из 100</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Penalties Section */}
      {penaltyData && (penaltyData.stats.penalty_count > 0 || penaltyData.stats.active_checks > 0) && (
        <div className="mt-16 animate-slide" style={{ animationDelay: '150ms' }}>
          <div className="card" style={{ padding: 16, border: '1px solid rgba(255,59,48,0.15)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>⚠️ Штрафы и проверки</h3>

            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              {penaltyData.stats.active_checks > 0 && (
                <div style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 8, background: 'rgba(255,149,0,0.08)' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#ff9500' }}>{penaltyData.stats.active_checks}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>На проверке</div>
                </div>
              )}
              {penaltyData.stats.penalty_count > 0 && (
                <div style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 8, background: 'rgba(255,59,48,0.08)' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#ff3b30' }}>{penaltyData.stats.penalty_count}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Штрафов</div>
                </div>
              )}
              {penaltyData.stats.total_penalty > 0 && (
                <div style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 8, background: 'rgba(255,59,48,0.08)' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#ff3b30' }}>-{formatTON(penaltyData.stats.total_penalty)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Списано TON</div>
                </div>
              )}
            </div>

            {penaltyData.penalties.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                {penaltyData.penalties.slice(0, 5).map((p) => {
                  const s = statusLabel(p.status);
                  return (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.task_title || `Задание #${p.task_id}`}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {new Date(p.created_at).toLocaleDateString('ru-RU')}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.text}</div>
                        {p.status === 'penalized' && (
                          <div style={{ fontSize: 11, color: '#ff3b30', fontWeight: 700 }}>-{formatTON(p.penalty_applied)} TON</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

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
            onClick={() => { hapticFeedback('light'); navigate('/completions'); }}
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
