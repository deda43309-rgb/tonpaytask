import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hapticFeedback } from '../utils/telegram';
import { formatTON } from '../utils/format';
import * as api from '../utils/api';

const levels = [
  { min: 80, max: 100, label: '🌟 Отличная', color: '#34c759', desc: 'Вы надёжный пользователь. Все функции доступны.' },
  { min: 50, max: 79, label: '⚡ Нормальная', color: '#ff9500', desc: 'Карма в норме, но будьте внимательны.' },
  { min: 20, max: 49, label: '⚠️ Низкая', color: '#ff6b00', desc: 'Внимание! Ещё несколько штрафов могут привести к блокировке.' },
  { min: 0, max: 19, label: '🚫 Критическая', color: '#ff3b30', desc: 'Срочно выполняйте задания, чтобы восстановить карму!' },
];

export default function KarmaPage({ user }) {
  const navigate = useNavigate();
  const [penaltyData, setPenaltyData] = useState(null);
  const [settings, setSettings] = useState(null);

  const karma = user?.karma ?? 50;
  const tasksCompleted = user?.tasks_completed || 0;
  const tasksUntilKarma = 10 - (tasksCompleted % 10);
  const currentLevel = levels.find(l => karma >= l.min && karma <= l.max) || levels[0];

  useEffect(() => {
    api.getPenalties().then(setPenaltyData).catch(() => {});
    api.getTasks().then(data => {
      setSettings({
        unsub_penalty: data.unsub_penalty || 50,
        sub_check_hours: data.sub_check_hours || 72,
      });
    }).catch(() => {});
  }, []);

  const penaltyAmount = settings?.unsub_penalty || 50;
  const checkHours = settings?.sub_check_hours || 72;

  const rules = [
    { icon: '🎯', title: 'Начальная карма', desc: 'При регистрации каждый пользователь получает 50 очков кармы из 100 возможных.' },
    { icon: '📉', title: 'Штраф за отписку', desc: `Отписка от канала в течение ${checkHours}ч снимает 10 кармы и ${formatTON(penaltyAmount)} TON с баланса.`, color: '#ff3b30' },
    { icon: '📈', title: 'Награда за задания', desc: `За каждые 10 выполненных заданий вы получаете +1 к карме (макс. 100).`, color: '#34c759' },
    { icon: '💸', title: 'Штраф за низкую карму', desc: 'При карме от 20 до 49 вы теряете 10% от награды за каждое задание. Эта сумма уходит в системный баланс.', color: '#ff6b00' },
    { icon: '🔒', title: 'Обязательная подписка', desc: `После выполнения задания на подписку вы обязаны оставаться подписанным ${checkHours} часов.` },
    { icon: '🚫', title: 'Блокировка', desc: 'При карме = 0 или отрицательном балансе аккаунт блокируется автоматически.', color: '#ff3b30' },
    { icon: '🔓', title: 'Разблокировка', desc: 'Для разблокировки обратитесь к администратору.' },
  ];

  const statusLabel = (status) => {
    switch (status) {
      case 'pending': return { text: '⏳ Ожидание', color: '#ff9500' };
      case 'passed': return { text: '✅ Пройдено', color: '#34c759' };
      case 'penalized': return { text: '🚫 Штраф', color: '#ff3b30' };
      default: return { text: status, color: 'var(--text-muted)' };
    }
  };

  return (
    <div className="page" style={{ paddingBottom: 100 }}>
      <button
        onClick={() => { hapticFeedback('light'); navigate(-1); }}
        style={{
          background: 'none', border: 'none', color: 'var(--accent-primary)',
          fontSize: 14, fontWeight: 600, padding: '8px 0', cursor: 'pointer',
        }}
      >
        ← Назад
      </button>

      <div className="section-header">
        <h1 className="section-title">☯️ Система кармы</h1>
      </div>

      {/* Current Status */}
      <div className="card animate-slide" style={{ padding: 20, textAlign: 'center', border: `1px solid ${currentLevel.color}33` }}>
        <div style={{ fontSize: 48, fontWeight: 900, color: currentLevel.color }}>{karma}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>из 100</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: currentLevel.color }}>{currentLevel.label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{currentLevel.desc}</div>

        {/* Progress bar */}
        <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.06)', borderRadius: 8, height: 8, overflow: 'hidden' }}>
          <div style={{
            width: `${(karma / 100) * 100}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${currentLevel.color}, ${currentLevel.color}88)`,
            borderRadius: 8,
            transition: 'width 0.5s ease'
          }} />
        </div>

        {/* Next karma point progress */}
        {karma < 100 && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              До следующей +1 кармы:
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#34c759' }}>
              {tasksUntilKarma === 10 ? 10 : tasksUntilKarma} заданий
            </span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="card mt-16 animate-slide" style={{ padding: 12, animationDelay: '80ms' }}>
        <div style={{ display: 'flex', gap: 8, textAlign: 'center' }}>
          <div style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: 'var(--bg-glass)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-primary)' }}>{tasksCompleted}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Заданий</div>
          </div>
          <div style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: 'var(--bg-glass)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#ff3b30' }}>
              {penaltyData?.stats?.penalty_count || 0}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Штрафов</div>
          </div>
          <div style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: 'var(--bg-glass)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#ff9500' }}>
              {penaltyData?.stats?.active_checks || 0}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Проверок</div>
          </div>
          <div style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: 'var(--bg-glass)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#ff3b30' }}>
              {penaltyData?.stats?.total_penalty ? `-${formatTON(penaltyData.stats.total_penalty)}` : '0'}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Списано TON</div>
          </div>
        </div>
      </div>

      {/* Rules */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 10px', paddingLeft: 4 }}>📋 Правила</h2>
      <div className="animate-slide" style={{ animationDelay: '160ms' }}>
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
      <div className="animate-slide" style={{ animationDelay: '240ms' }}>
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

      {/* Penalty History */}
      {penaltyData?.penalties?.length > 0 && (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 10px', paddingLeft: 4 }}>📜 История проверок</h2>
          <div className="card animate-slide" style={{ padding: 0, overflow: 'hidden', animationDelay: '320ms' }}>
            {penaltyData.penalties.slice(0, 10).map((p, i) => {
              const s = statusLabel(p.status);
              return (
                <div key={p.id} style={{
                  padding: '10px 14px',
                  borderBottom: i < Math.min(penaltyData.penalties.length, 10) - 1 ? '1px solid var(--border)' : 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.task_title || `Задание #${p.task_id}`}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {p.channel_id} · {new Date(p.created_at).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.text}</div>
                    {p.status === 'penalized' && (
                      <div style={{ fontSize: 11, color: '#ff3b30', fontWeight: 700 }}>
                        -{formatTON(p.penalty_applied)} TON
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}
