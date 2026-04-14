import { useState, useEffect } from 'react';
import Loader from '../components/Loader';
import { hapticFeedback } from '../utils/telegram';
import * as api from '../utils/api';
import './ReferralPage.css';

export default function ReferralPage({ user }) {
  const [referrals, setReferrals] = useState([]);
  const [totalBonus, setTotalBonus] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadReferrals();
  }, []);

  const loadReferrals = async () => {
    try {
      const data = await api.getReferrals();
      setReferrals(data.referrals);
      setTotalBonus(data.total_bonus);
    } catch (err) {
      console.error('Failed to load referrals:', err);
    } finally {
      setLoading(false);
    }
  };

  const getBotUsername = () => {
    // Will be configured properly with actual bot username
    return 'TonPayTaskBot';
  };

  const getReferralLink = () => {
    return `https://t.me/${getBotUsername()}?start=ref_${user?.referral_code || ''}`;
  };

  const handleCopy = async () => {
    const link = getReferralLink();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      hapticFeedback('success');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback
      const input = document.createElement('input');
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      hapticFeedback('success');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = () => {
    const link = getReferralLink();
    const text = `🎮 Присоединяйся к TonPayTask и зарабатывай Points!\n\n${link}`;
    hapticFeedback('medium');
    
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('🎮 Присоединяйся к TonPayTask и зарабатывай Points!')}`);
    } else {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    }
  };

  if (loading) return <Loader text="Загрузка..." />;

  return (
    <div className="page referral-page">
      <div className="section-header">
        <h1 className="section-title">👥 Друзья</h1>
      </div>

      {/* Invite Card */}
      <div className="card referral-invite-card animate-slide">
        <div className="referral-invite-icon">🎁</div>
        <h2 className="referral-invite-title">Приглашай друзей</h2>
        <p className="referral-invite-text">
          Получайте по <strong>100 Points</strong> за каждого приглашённого друга — и вы, и ваш друг!
        </p>

        <div className="referral-link-box mt-16">
          <span className="referral-link-label">Ваша ссылка:</span>
          <div className="referral-link-row">
            <span className="referral-link-value">{getReferralLink()}</span>
          </div>
        </div>

        <div className="referral-buttons mt-16">
          <button className="btn btn-primary" onClick={handleShare} id="share-btn">
            📤 Поделиться
          </button>
          <button className="btn btn-secondary" onClick={handleCopy} id="copy-btn">
            {copied ? '✅ Скопировано' : '📋 Копировать'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="referral-stats mt-16 animate-slide" style={{ animationDelay: '100ms' }}>
        <div className="card referral-stat-card">
          <span className="referral-stat-icon">👥</span>
          <span className="referral-stat-value">{referrals.length}</span>
          <span className="referral-stat-label">Друзей</span>
        </div>
        <div className="card referral-stat-card">
          <span className="referral-stat-icon">💎</span>
          <span className="referral-stat-value">{totalBonus.toLocaleString()}</span>
          <span className="referral-stat-label">Заработано</span>
        </div>
      </div>

      {/* Referral List */}
      <div className="mt-24 animate-slide" style={{ animationDelay: '200ms' }}>
        <h2 className="section-title" style={{ fontSize: 16 }}>Ваши рефералы</h2>
        
        {referrals.length > 0 ? (
          <div className="referral-list mt-12 stagger">
            {referrals.map((ref, i) => (
              <div className="card referral-item" key={ref.id}>
                <div className="referral-item-avatar">
                  {(ref.first_name || ref.username || '?')[0].toUpperCase()}
                </div>
                <div className="referral-item-info">
                  <span className="referral-item-name">
                    {ref.first_name || ref.username || `User #${ref.id}`}
                  </span>
                  <span className="referral-item-date">
                    {new Date(ref.created_at).toLocaleDateString('ru-RU')}
                  </span>
                </div>
                <span className="badge badge-success">+{ref.bonus}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state mt-16">
            <span className="empty-state-icon">👋</span>
            <h3 className="empty-state-title">Пока никого</h3>
            <p className="empty-state-text">Поделитесь ссылкой с друзьями чтобы заработать бонусы</p>
          </div>
        )}
      </div>
    </div>
  );
}
