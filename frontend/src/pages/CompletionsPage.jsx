import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hapticFeedback } from '../utils/telegram';
import { formatTON } from '../utils/format';
import * as api from '../utils/api';
import Loader from '../components/Loader';

const TYPE_ICONS = {
  subscribe_channel: '📢',
  start_bot: '🤖',
  visit_link: '🔗',
};

function Countdown({ endDate, channelUrl, channelId }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);
  const [unsubscribed, setUnsubscribed] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const end = new Date(endDate);
      const diff = end - now;
      if (diff <= 0) {
        setExpired(true);
        setTimeLeft('');
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setTimeLeft(`${h}ч ${m}м`);
    };
    update();
    const t = setInterval(update, 60000);
    return () => clearInterval(t);
  }, [endDate]);

  const handleUnsubscribe = async () => {
    hapticFeedback('light');
    // Open channel first
    if (channelUrl) window.open(channelUrl, '_blank');
    // After a delay, check if actually unsubscribed
    setChecking(true);
    setTimeout(async () => {
      try {
        const result = await api.checkUnsubscribed(channelId);
        if (!result.subscribed) {
          setUnsubscribed(true);
          hapticFeedback('success');
        }
      } catch (e) {
        console.error('Check unsub error:', e);
      } finally {
        setChecking(false);
      }
    }, 3000);
  };

  if (expired) {
    if (unsubscribed) {
      return (
        <span style={{ fontSize: 10, color: '#34c759', fontWeight: 600 }}>
          ✅ Отписались
        </span>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: '#34c759', fontWeight: 600 }}>
          ✅ Можно отписаться
        </span>
        {channelUrl && (
          <button
            onClick={handleUnsubscribe}
            disabled={checking}
            style={{
              padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, background: 'rgba(255,59,48,0.12)',
              color: '#ff3b30', transition: 'all 0.2s',
              opacity: checking ? 0.5 : 1,
            }}
          >
            {checking ? '⏳ Проверка...' : '🔕 Отписаться'}
          </button>
        )}
      </div>
    );
  }

  return (
    <span style={{ fontSize: 10, color: '#ff9500', fontWeight: 600 }}>
      🔒 Не отписывайтесь: {timeLeft}
    </span>
  );
}

export default function CompletionsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.getCompletions()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader text="Загрузка..." />;

  const completions = data?.completions || [];
  const stats = data?.stats || {};

  const filtered = filter === 'all'
    ? completions
    : completions.filter(c => c.source === filter);

  const grouped = {};
  filtered.forEach(c => {
    const date = new Date(c.completed_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(c);
  });

  return (
    <div className="page" style={{ paddingBottom: 100 }}>
      <button
        onClick={() => { hapticFeedback('light'); navigate('/profile'); }}
        style={{
          background: 'none', border: 'none', color: 'var(--accent-primary)',
          fontSize: 14, fontWeight: 600, padding: '8px 0', cursor: 'pointer',
        }}
      >
        ← Назад
      </button>

      <div className="section-header">
        <h1 className="section-title">📋 Мои задания</h1>
      </div>

      <div className="card animate-slide" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, textAlign: 'center' }}>
          <div style={{ flex: 1, padding: '8px 0', borderRadius: 10, background: 'var(--bg-glass)' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-primary)' }}>{stats.total}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Выполнено</div>
          </div>
          <div style={{ flex: 1, padding: '8px 0', borderRadius: 10, background: 'var(--bg-glass)' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#34c759' }}>{formatTON(stats.total_reward)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Заработано TON</div>
          </div>
        </div>
      </div>

      <div className="mt-16 animate-slide" style={{ display: 'flex', gap: 8, animationDelay: '80ms' }}>
        {[
          { key: 'all', label: `Все (${completions.length})` },
          { key: 'admin', label: `Системные (${stats.admin_count})` },
          { key: 'ad', label: `Рекламные (${stats.ad_count})` },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => { hapticFeedback('light'); setFilter(f.key); }}
            style={{
              flex: 1, padding: '8px 4px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, transition: 'all 0.2s',
              background: filter === f.key ? 'var(--accent-primary)' : 'var(--bg-glass)',
              color: filter === f.key ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-16 animate-slide" style={{ animationDelay: '160ms' }}>
        {filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Нет выполненных заданий</div>
          </div>
        ) : (
          Object.entries(grouped).map(([date, items]) => (
            <div key={date} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, paddingLeft: 4 }}>
                {date}
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {items.map((c, i) => (
                  <div
                    key={`${c.source}-${c.id}`}
                    style={{
                      padding: '12px 16px',
                      borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {c.image_url ? (
                        <img
                          src={c.image_url}
                          alt=""
                          style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'var(--bg-glass)', fontSize: 18,
                        }}>
                          {c.icon || TYPE_ICONS[c.type] || '📋'}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {c.source === 'ad' ? '📢 Рекламное' : '⚙️ Системное'}
                          {' · '}
                          {new Date(c.completed_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#34c759', flexShrink: 0 }}>
                        +{formatTON(c.reward)}
                      </div>
                    </div>

                    {/* Subscription status */}
                    {c.type === 'subscribe_channel' && c.obligation_end && c.sub_status === 'passed' && (
                      <div style={{ marginTop: 6, marginLeft: 48 }}>
                        <span style={{ fontSize: 10, color: '#34c759', fontWeight: 600 }}>
                          ✅ Выполнено
                        </span>
                      </div>
                    )}
                    {c.type === 'subscribe_channel' && c.obligation_end && (!c.sub_status || c.sub_status === 'pending') && (
                      <div style={{ marginTop: 6, marginLeft: 48 }}>
                        <Countdown endDate={c.obligation_end} channelUrl={c.target_url} channelId={c.channel_id} />
                      </div>
                    )}
                    {c.type === 'subscribe_channel' && c.sub_status === 'penalized' && (
                      <div style={{ marginTop: 6, marginLeft: 48 }}>
                        <span style={{ fontSize: 10, color: '#ff3b30', fontWeight: 600 }}>
                          🚫 Штраф за отписку
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
