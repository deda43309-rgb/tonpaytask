import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hapticFeedback } from '../utils/telegram';
import { formatTON } from '../utils/format';
import * as api from '../utils/api';
import './HomePage.css';

export default function HomePage({ user, onUserUpdate }) {
  const navigate = useNavigate();
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [bonusResult, setBonusResult] = useState(null);
  const [showBonus, setShowBonus] = useState(false);
  const [penaltyData, setPenaltyData] = useState(null);

  useEffect(() => {
    api.getPenalties().then(setPenaltyData).catch(() => {});
  }, []);

  const handleDailyBonus = async () => {
    if (claiming) return;
    setClaiming(true);
    hapticFeedback('medium');
    
    try {
      const result = await api.claimDailyBonus();
      setBonusResult(result);
      setDailyClaimed(true);
      setShowBonus(true);
      hapticFeedback('success');
      
      if (onUserUpdate) {
        onUserUpdate({ ...user, balance: result.balance });
      }

      setTimeout(() => setShowBonus(false), 3000);
    } catch (err) {
      if (err.message.includes('already claimed')) {
        setDailyClaimed(true);
      }
      hapticFeedback('error');
    } finally {
      setClaiming(false);
    }
  };

  const karma = user?.karma ?? 50;
  const karmaColor = karma >= 80 ? '#34c759' : karma >= 50 ? '#ff9500' : karma >= 20 ? '#ff6b00' : '#ff3b30';
  const karmaLabel = karma >= 80 ? '🌟 Отличная' : karma >= 50 ? '⚡ Нормальная' : karma >= 20 ? '⚠️ Низкая' : '🚫 Критическая';

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  const statusLabel = (status) => {
    switch (status) {
      case 'pending': return { text: '⏳ На проверке', color: '#ff9500' };
      case 'passed': return { text: '✅ Ок', color: '#34c759' };
      case 'penalized': return { text: '🚫 Штраф', color: '#ff3b30' };
      default: return { text: status, color: 'var(--text-muted)' };
    }
  };

  return (
    <div className="page home-page">
      {/* Profile Card */}
      <div className="card animate-slide" style={{
        padding: 20, textAlign: 'center',
        background: 'linear-gradient(135deg, rgba(var(--accent-primary-rgb, 100, 100, 255), 0.06), rgba(var(--accent-primary-rgb, 100, 100, 255), 0.02))',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20, margin: '0 auto 10px',
          background: `linear-gradient(135deg, ${karmaColor}, ${karmaColor}99)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, fontWeight: 800, color: '#fff',
          boxShadow: `0 6px 20px ${karmaColor}33`,
          overflow: 'hidden',
        }}>
          {user?.photo_url ? (
            <img src={user.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            (user?.first_name || 'U')[0].toUpperCase()
          )}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>
          {user?.first_name || ''} {user?.last_name || ''}
        </div>
        {user?.username && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>@{user.username}</div>
        )}
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>С нами с {memberSince}</div>
      </div>

      {/* Balance Card */}
      <div className="card mt-12 animate-slide" style={{ padding: 16, animationDelay: '60ms' }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>💎 Баланс</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-primary)', marginTop: 2 }}>{formatTON(user?.balance || 0)} TON</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 10, background: 'var(--bg-glass)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#34c759' }}>{formatTON(user?.total_earned || 0)}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Заработано</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 10, background: 'var(--bg-glass)' }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{user?.tasks_completed || 0}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Заданий</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 10, background: 'var(--bg-glass)' }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{user?.referral_count || 0}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Рефералов</div>
          </div>
        </div>
      </div>

      {/* Karma */}
      <div className="card mt-12 animate-slide" style={{ padding: '12px 16px', cursor: 'pointer', animationDelay: '100ms' }} onClick={() => navigate('/karma')}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>☯️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Карма</div>
              <div style={{ fontSize: 11, color: karmaColor, fontWeight: 600 }}>{karmaLabel}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: karmaColor }}>{karma}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>из 100</div>
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
          </div>
        </div>
      </div>

      {/* Daily Bonus */}
      <div className="card mt-12 animate-slide" style={{ animationDelay: '140ms' }}>
        <div className="daily-bonus-content">
          <div className="daily-bonus-left">
            <span className="daily-bonus-icon">🎁</span>
            <div>
              <h3 className="daily-bonus-title">Ежедневный бонус</h3>
              <p className="daily-bonus-text">
                {dailyClaimed ? 'Приходи завтра!' : 'Забери свой бонус'}
              </p>
            </div>
          </div>
          <button
            className={`btn ${dailyClaimed ? 'btn-secondary' : 'btn-primary'} btn-sm`}
            onClick={handleDailyBonus}
            disabled={dailyClaimed || claiming}
            id="daily-bonus-btn"
          >
            {claiming ? '⏳' : dailyClaimed ? '✅' : '💰 Забрать'}
          </button>
        </div>

        {showBonus && bonusResult && (
          <div className="daily-bonus-result">
            <span className="bonus-amount">+{formatTON(bonusResult.bonus)} TON</span>
            <span className="bonus-streak">🔥 Серия: {bonusResult.streak} дн.</span>
          </div>
        )}
      </div>

      {/* Penalties */}
      {penaltyData && (penaltyData.stats.penalty_count > 0 || penaltyData.stats.active_checks > 0) && (
        <div className="card mt-12 animate-slide" style={{ padding: 16, border: '1px solid rgba(255,59,48,0.15)', animationDelay: '180ms' }}>
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
              {penaltyData.penalties.slice(0, 3).map((p) => {
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
      )}

      {/* Quick Menu */}
      <div className="mt-16 animate-slide" style={{ animationDelay: '220ms' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {[
            { icon: '📋', label: 'Мои задания', path: '/completions' },
            { icon: '🎁', label: 'Реферальная программа', path: '/referral' },
            { icon: '📢', label: 'Рекламодатель', path: '/advertiser' },
            ...(user?.is_admin ? [{ icon: '⚙️', label: 'Админ-панель', path: '/admin' }] : []),
          ].map((item, i, arr) => (
            <button
              key={item.path}
              onClick={() => { hapticFeedback('light'); navigate(item.path); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px', border: 'none', background: 'transparent',
                cursor: 'pointer', textAlign: 'left',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-24 animate-fade" style={{ textAlign: 'center', paddingBottom: 20 }}>
        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>ID: {user?.id || '—'}</p>
        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>TonPayTask v1.0</p>
      </div>
    </div>
  );
}
