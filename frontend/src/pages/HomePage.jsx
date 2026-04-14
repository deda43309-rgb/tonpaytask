import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BalanceWidget from '../components/BalanceWidget';
import { hapticFeedback } from '../utils/telegram';
import * as api from '../utils/api';
import './HomePage.css';

export default function HomePage({ user, onUserUpdate }) {
  const navigate = useNavigate();
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [bonusResult, setBonusResult] = useState(null);
  const [showBonus, setShowBonus] = useState(false);

  useEffect(() => {
    // Check if daily bonus was already claimed (last_daily_bonus contains today's date)
    // We don't have this in user object directly, so we check via API on claim
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

  return (
    <div className="page home-page">
      {/* Greeting */}
      <div className="home-greeting animate-fade">
        <h1 className="home-title">
          Привет, {user?.first_name || 'User'} 👋
        </h1>
        <p className="home-subtitle">Выполняй задания и зарабатывай!</p>
      </div>

      {/* Balance */}
      <div className="animate-slide mt-16">
        <BalanceWidget
          balance={user?.balance || 0}
          totalEarned={user?.total_earned || 0}
          tasksCompleted={user?.tasks_completed || 0}
        />
      </div>

      {/* Daily Bonus */}
      <div className="daily-bonus-section mt-16 animate-slide" style={{ animationDelay: '100ms' }}>
        <div className="card daily-bonus-card">
          <div className="daily-bonus-content">
            <div className="daily-bonus-left">
              <span className="daily-bonus-icon">🎁</span>
              <div>
                <h3 className="daily-bonus-title">Ежедневный бонус</h3>
                <p className="daily-bonus-text">
                  {dailyClaimed ? 'Приходи завтра!' : 'Забери свой бонус сегодня'}
                </p>
              </div>
            </div>
            <button
              className={`btn ${dailyClaimed ? 'btn-secondary' : 'btn-primary'} btn-sm`}
              onClick={handleDailyBonus}
              disabled={dailyClaimed || claiming}
              id="daily-bonus-btn"
            >
              {claiming ? '⏳' : dailyClaimed ? '✅ Получено' : '💰 Забрать'}
            </button>
          </div>

          {showBonus && bonusResult && (
            <div className="daily-bonus-result">
              <span className="bonus-amount">+{bonusResult.bonus} Points</span>
              <span className="bonus-streak">🔥 Серия: {bonusResult.streak} дн.</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="home-actions mt-16 animate-slide" style={{ animationDelay: '200ms' }}>
        <h2 className="section-title">Быстрые действия</h2>
        <div className="action-grid mt-12">
          <div className="action-card card" onClick={() => { hapticFeedback('light'); navigate('/tasks'); }}>
            <span className="action-icon">📋</span>
            <span className="action-label">Задания</span>
            <span className="action-desc">Выполняй и зарабатывай</span>
          </div>
          <div className="action-card card" onClick={() => { hapticFeedback('light'); navigate('/referral'); }}>
            <span className="action-icon">👥</span>
            <span className="action-label">Друзья</span>
            <span className="action-desc">Приглашай и получай</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="home-stats mt-16 animate-slide" style={{ animationDelay: '300ms' }}>
        <div className="stats-grid">
          <div className="stat-item card">
            <span className="stat-icon">⚡</span>
            <span className="stat-value">{user?.tasks_completed || 0}</span>
            <span className="stat-label">Выполнено</span>
          </div>
          <div className="stat-item card">
            <span className="stat-icon">💎</span>
            <span className="stat-value">{(user?.total_earned || 0).toLocaleString()}</span>
            <span className="stat-label">Заработано</span>
          </div>
          <div className="stat-item card">
            <span className="stat-icon">🏆</span>
            <span className="stat-value">#{user?.id ? '—' : '—'}</span>
            <span className="stat-label">Рейтинг</span>
          </div>
        </div>
      </div>
    </div>
  );
}
