import { useNavigate } from 'react-router-dom';
import { formatTON } from '../utils/format';

const rules = [
  { icon: '🎯', title: 'Начальная карма', desc: 'При регистрации каждый пользователь получает 50 очков кармы.' },
  { icon: '📉', title: 'Штраф за отписку', desc: 'Отписка от канала в период обязательной подписки снимает 10 кармы и накладывает денежный штраф.', color: '#ff3b30' },
  { icon: '📈', title: 'Награда за задания', desc: 'За каждые 10 выполненных заданий вы получаете +1 к карме.', color: '#34c759' },
  { icon: '🔒', title: 'Максимум кармы', desc: 'Карма не может превышать 50 очков.' },
  { icon: '🚫', title: 'Блокировка аккаунта', desc: 'При достижении кармы 0 или отрицательном балансе аккаунт блокируется.', color: '#ff3b30' },
  { icon: '🔓', title: 'Разблокировка', desc: 'Для разблокировки обратитесь к администратору.' },
];

const levels = [
  { min: 40, max: 50, label: '🌟 Отличная', color: '#34c759', desc: 'Вы надёжный пользователь. Все функции доступны.' },
  { min: 25, max: 39, label: '⚡ Нормальная', color: '#ff9500', desc: 'Карма в норме, но будьте внимательны.' },
  { min: 10, max: 24, label: '⚠️ Низкая', color: '#ff6b00', desc: 'Внимание! Ещё несколько штрафов могут привести к блокировке.' },
  { min: 0, max: 9, label: '🚫 Критическая', color: '#ff3b30', desc: 'Срочно выполняйте задания, чтобы восстановить карму!' },
];

export default function KarmaPage({ user }) {
  const navigate = useNavigate();
  const karma = user?.karma ?? 50;
  const currentLevel = levels.find(l => karma >= l.min && karma <= l.max) || levels[0];

  return (
    <div className="page-container">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>←</button>
        <h1 className="page-title">☯️ Система кармы</h1>
      </div>

      {/* Current Status */}
      <div className="card animate-slide" style={{ padding: 20, textAlign: 'center', marginTop: 16, border: `1px solid ${currentLevel.color}33` }}>
        <div style={{ fontSize: 48, fontWeight: 900, color: currentLevel.color }}>{karma}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>из 50</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: currentLevel.color }}>{currentLevel.label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{currentLevel.desc}</div>

        {/* Progress bar */}
        <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.06)', borderRadius: 8, height: 8, overflow: 'hidden' }}>
          <div style={{
            width: `${(karma / 50) * 100}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${currentLevel.color}, ${currentLevel.color}88)`,
            borderRadius: 8,
            transition: 'width 0.5s ease'
          }} />
        </div>
      </div>

      {/* Rules */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 10px', paddingLeft: 4 }}>📋 Правила</h2>
      <div className="animate-slide" style={{ animationDelay: '100ms' }}>
        {rules.map((rule, i) => (
          <div key={i} className="card" style={{ padding: '12px 14px', marginBottom: 8, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>{rule.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: rule.color || 'var(--text-primary)' }}>{rule.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{rule.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Levels */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 10px', paddingLeft: 4 }}>📊 Уровни кармы</h2>
      <div className="animate-slide" style={{ animationDelay: '200ms' }}>
        {levels.map((level, i) => (
          <div key={i} className="card" style={{
            padding: '10px 14px', marginBottom: 8,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            border: karma >= level.min && karma <= level.max ? `1px solid ${level.color}55` : 'none',
            background: karma >= level.min && karma <= level.max ? `${level.color}11` : undefined
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: level.color }}>{level.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{level.desc}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: level.color, whiteSpace: 'nowrap', marginLeft: 8 }}>
              {level.min}–{level.max}
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 100 }} />
    </div>
  );
}
