import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { hapticFeedback } from '../utils/telegram';
import { formatTON } from '../utils/format';
import * as api from '../utils/api';
import Loader from '../components/Loader';
import './AdvertiserPage.css';

const TASK_TYPES = [
  { value: 'subscribe_channel', label: '📢 Подписка на канал', icon: '📢' },
  { value: 'start_bot', label: '🤖 Запуск бота', icon: '🤖' },
  { value: 'visit_link', label: '🔗 Переход по ссылке', icon: '🔗' },
];
const DEPOSIT_AMOUNTS = [100, 500, 1000, 5000, 10000, 50000];

export default function AdvertiserPage({ user }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('tasks');
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [adPrice, setAdPrice] = useState(20);
  const [userReward, setUserReward] = useState(10);
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(null);
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState(1000);
  const [depositing, setDepositing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [penaltyData, setPenaltyData] = useState(null);
  const [disabledTypes, setDisabledTypes] = useState([]);

  // Resolve state
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(null);
  const resolveTimer = useRef(null);

  // Create form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    url: '',
    type: 'subscribe_channel',
    max_completions: 100,
    image_url: null,
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [balRes, tasksRes, statsRes, rewardRes, penRes, modRes] = await Promise.all([
        api.getAdBalance(),
        api.getAdTasks(),
        api.getAdStats(),
        api.getRewardPrice(),
        api.getAdvertiserPenalties().catch(() => ({ penalties: [], total_refunded: 0, count: 0 })),
        api.getModules().catch(() => ({ modules: {} })),
      ]);
      setBalance(balRes.ad_balance);
      setTasks(tasksRes.tasks);
      setStats(statsRes);
      setAdPrice(rewardRes.ad_price);
      setUserReward(rewardRes.ad_user_reward);
      setPenaltyData(penRes);
      // Sync disabled task types from modules
      const typeMap = { tasks_subscribe: 'subscribe_channel', tasks_bot: 'start_bot', tasks_link: 'visit_link' };
      const disabled = Object.entries(modRes.modules || {}).filter(([k,v]) => k.startsWith('tasks_') && !v).map(([k]) => typeMap[k]).filter(Boolean);
      setDisabledTypes(disabled);
    } catch (err) {
      console.error('Load advertiser data error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-resolve Telegram URL
  const resolveUrl = useCallback(async (url, type) => {
    if (!url || type === 'visit_link') {
      setResolved(null);
      return;
    }
    // Check if it looks like a Telegram URL or username
    const isTg = url.includes('t.me/') || /^@?[a-zA-Z0-9_]{3,}$/.test(url);
    if (!isTg) {
      setResolved(null);
      return;
    }

    setResolving(true);
    try {
      const data = await api.resolveAdUrl(url, type);
      setResolved(data);
      if (data.success) {
        setForm(f => ({
          ...f,
          title: data.title || f.title,
          description: data.description || f.description,
          image_url: data.image_url,
        }));
      }
    } catch (err) {
      console.error('Resolve error:', err);
    } finally {
      setResolving(false);
    }
  }, []);

  // Debounced URL resolution
  const handleUrlChange = (newUrl) => {
    setForm(f => ({ ...f, url: newUrl }));
    setResolved(null);
    if (resolveTimer.current) clearTimeout(resolveTimer.current);
    resolveTimer.current = setTimeout(() => {
      resolveUrl(newUrl, form.type);
    }, 800);
  };

  const handleTypeChange = (newType) => {
    setForm(f => ({ ...f, type: newType, image_url: null }));
    setResolved(null);
    if (form.url && newType !== 'visit_link') {
      resolveUrl(form.url, newType);
    }
  };

  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (depositing || !amount || amount <= 0) return;
    setDepositing(true);
    hapticFeedback('medium');
    try {
      const res = await api.adDeposit(amount);
      setBalance(res.ad_balance);
      setShowDeposit(false);
      hapticFeedback('success');
    } catch (err) {
      alert(err.message);
      hapticFeedback('error');
    } finally {
      setDepositing(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    hapticFeedback('medium');
    try {
      const res = await api.createAdTask(form);
      setBalance(res.ad_balance);
      setTasks(prev => [res.task, ...prev]);
      setForm({ title: '', description: '', url: '', type: 'subscribe_channel', max_completions: 100, image_url: null });
      setResolved(null);
      setTab('tasks');
      hapticFeedback('success');
    } catch (err) {
      alert(err.message);
      hapticFeedback('error');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (task) => {
    hapticFeedback('light');
    const newStatus = task.status === 'active' ? 'paused' : 'active';
    try {
      const res = await api.updateAdTask(task.id, { status: newStatus });
      setTasks(prev => prev.map(t => t.id === task.id ? res.task : t));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (task) => {
    hapticFeedback('medium');
    if (!confirm(`Удалить задание "${task.title}"? Остаток будет возвращён.`)) return;
    try {
      const res = await api.deleteAdTask(task.id);
      setBalance(res.ad_balance);
      setTasks(prev => prev.filter(t => t.id !== task.id));
      hapticFeedback('success');
    } catch (err) {
      alert(err.message);
    }
  };

  const totalCost = adPrice * form.max_completions;

  if (loading) return <Loader text="Загрузка..." />;

  return (
    <div className="page advertiser-page">
      {/* Back */}
      <button className="adv-back-btn" onClick={() => { hapticFeedback('light'); navigate('/'); }}>
        ← Назад
      </button>

      {/* Balance */}
      <div className="card adv-balance-card animate-slide">
        <div className="adv-balance-icon">💰</div>
        <div className="adv-balance-value">{formatTON(balance)}</div>
        <div className="adv-balance-label">Рекламный баланс</div>
        <button className="adv-deposit-btn" onClick={() => { hapticFeedback('light'); setShowDeposit(true); }}>
          ➕ Пополнить
        </button>
      </div>

      {/* Tabs */}
      <div className="adv-tabs mt-16 animate-slide" style={{ animationDelay: '80ms' }}>
        <button className={`adv-tab ${tab === 'tasks' ? 'active' : ''}`} onClick={() => { hapticFeedback('light'); setTab('tasks'); }}>
          📋 Задания
        </button>
        <button className={`adv-tab ${tab === 'create' ? 'active' : ''}`} onClick={() => { hapticFeedback('light'); setTab('create'); }}>
          ➕ Создать
        </button>
        <button className={`adv-tab ${tab === 'stats' ? 'active' : ''}`} onClick={() => { hapticFeedback('light'); setTab('stats'); }}>
          📊 Стат
        </button>
        {penaltyData && penaltyData.count > 0 && (
          <button className={`adv-tab ${tab === 'penalties' ? 'active' : ''}`} onClick={() => { hapticFeedback('light'); setTab('penalties'); }}>
            ⚠️ Штрафы
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="mt-16 animate-slide" style={{ animationDelay: '160ms' }}>
        {tab === 'tasks' && (
          <div className="card">
            {tasks.length === 0 ? (
              <div className="adv-empty">
                <div className="adv-empty-icon">📢</div>
                <div className="adv-empty-text">Нет рекламных заданий.<br />Создайте первое!</div>
              </div>
            ) : (
              <div className="adv-tasks-list">
                {tasks.map(task => {
                  const progress = task.max_completions > 0 ? (task.current_completions / task.max_completions) * 100 : 0;
                  const spent = task.current_completions * task.reward;
                  const taskType = TASK_TYPES.find(t => t.value === task.type);
                  return (
                    <div key={task.id} className="adv-task-item">
                      <div className="adv-task-top">
                        {task.image_url ? (
                          <img src={task.image_url} alt="" className="adv-task-avatar" />
                        ) : (
                          <span className="adv-task-type-icon">{taskType?.icon || '📋'}</span>
                        )}
                        <div className="adv-task-info">
                          <div className="adv-task-title">{task.title}</div>
                          <div className="adv-task-meta">
                            <span>{formatTON(task.reward)} TON/выполнение</span>
                            <span className={`adv-task-status ${task.status}`}>{
                              task.status === 'active' ? '🟢 Активно' :
                              task.status === 'pending_review' ? '🔍 На модерации' :
                              task.status === 'rejected' ? '❌ Отклонено' :
                              task.status === 'paused' ? '⏸ Пауза' : '✅ Завершено'
                            }</span>
                          </div>
                        </div>
                      </div>
                      <div className="adv-task-progress">
                        <div className="adv-task-progress-bar">
                          <div className="adv-task-progress-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
                        </div>
                        <div className="adv-task-progress-text">
                          <span>{task.current_completions} / {task.max_completions}</span>
                          <span>−{formatTON(spent)} TON</span>
                        </div>
                      </div>
                      {(task.status === 'active' || task.status === 'paused') && (
                        <div className="adv-task-actions">
                          <button className="btn btn-sm btn-outline" onClick={() => handleToggle(task)}>
                            {task.status === 'active' ? '⏸ Пауза' : '▶️ Возобновить'}
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(task)}>
                            🗑 Удалить
                          </button>
                        </div>
                      )}
                      {task.status === 'pending_review' && (
                        <div style={{ fontSize: 12, color: '#ff9500', textAlign: 'center', padding: '8px 0' }}>
                          ⏳ Ожидайте проверки администратором
                        </div>
                      )}
                      {task.status === 'rejected' && (
                        <div className="adv-task-actions">
                          <div style={{ fontSize: 12, color: '#ff3b30', flex: 1 }}>Средства возвращены на баланс</div>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(task)}>
                            🗑 Удалить
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'create' && (
          <div className="card">
            <form className="adv-create-form" onSubmit={handleCreate}>

              {/* Type selector */}
              <div className="adv-form-group">
                <label className="adv-form-label">Тип задания</label>
                <select className="input" value={form.type} onChange={e => handleTypeChange(e.target.value)}>
                  {TASK_TYPES.filter(t => !disabledTypes.includes(t.value)).map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {form.type === 'subscribe_channel' && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(255,149,0,0.1)', borderRadius: 8, fontSize: 12, color: '#ff9500', lineHeight: 1.5 }}>
                    ⚠️ <b>Важно!</b> Бот должен быть администратором канала для проверки подписок.<br/>
                    📋 Канал → Настройки → Администраторы → Добавить бота
                  </div>
                )}
              </div>

              {/* URL */}
              <div className="adv-form-group">
                <label className="adv-form-label">
                  {form.type === 'visit_link' ? 'URL ссылки' : 'Telegram ссылка'}
                </label>
                <input
                  className="input"
                  placeholder={form.type === 'visit_link' ? 'https://example.com' : 'https://t.me/yourchannel'}
                  value={form.url}
                  onChange={e => handleUrlChange(e.target.value)}
                  required
                />
                {resolving && (
                  <div className="adv-resolve-status">⏳ Загрузка информации...</div>
                )}
              </div>

              {/* Resolved preview */}
              {resolved && resolved.success && form.type !== 'visit_link' && (
                <div className="adv-resolved-preview">
                  {resolved.image_url && (
                    <img src={resolved.image_url} alt="" className="adv-resolved-img" />
                  )}
                  <div className="adv-resolved-info">
                    <div className="adv-resolved-title">{resolved.title}</div>
                    {resolved.members_count && (
                      <div className="adv-resolved-meta">
                        👥 {resolved.members_count.toLocaleString()} подписчиков
                      </div>
                    )}
                    {form.type === 'subscribe_channel' && resolved.bot_is_admin !== null && (
                      <div style={{ 
                        marginTop: 4, fontSize: 12, fontWeight: 600,
                        color: resolved.bot_is_admin ? '#34c759' : '#ff3b30'
                      }}>
                        {resolved.bot_is_admin ? '✅ Бот — администратор' : '❌ Бот НЕ администратор'}
                      </div>
                    )}
                    {form.type === 'subscribe_channel' && resolved.bot_is_admin === false && resolved.bot_username && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText('@' + resolved.bot_username);
                              alert('Скопировано: @' + resolved.bot_username);
                            }}
                            style={{
                              padding: '4px 10px', fontSize: 11, borderRadius: 6,
                              border: '1px solid rgba(255,149,0,0.4)', background: 'rgba(255,149,0,0.1)',
                              color: '#ff9500', cursor: 'pointer', fontWeight: 600
                            }}
                          >
                            📋 Скопировать @{resolved.bot_username}
                          </button>
                          <button
                            type="button"
                            onClick={() => resolveUrl(form.url, form.type)}
                            style={{
                              padding: '4px 10px', fontSize: 11, borderRadius: 6,
                              border: '1px solid rgba(52,199,89,0.4)', background: 'rgba(52,199,89,0.1)',
                              color: '#34c759', cursor: 'pointer', fontWeight: 600
                            }}
                          >
                            🔄 Перепроверить
                          </button>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 11, color: '#888', lineHeight: 1.4 }}>
                          Добавьте бота в администраторы канала и нажмите «Перепроверить»
                        </div>
                      </div>
                    )}
                    {resolved.description && (
                      <div className="adv-resolved-desc">{resolved.description.substring(0, 100)}</div>
                    )}
                  </div>
                </div>
              )}

              {resolved && !resolved.success && (
                <div className="adv-resolve-error">
                  ⚠️ {resolved.error || 'Не удалось получить информацию'}
                </div>
              )}


              {/* Title (auto-filled or manual) */}
              <div className="adv-form-group">
                <label className="adv-form-label">Название задания</label>
                <input
                  className="input"
                  placeholder="Подписаться на канал..."
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>

              {/* Description */}
              <div className="adv-form-group">
                <label className="adv-form-label">Описание (необязательно)</label>
                <input
                  className="input"
                  placeholder="Подробное описание задания"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

              {/* Fixed reward info */}
              <div className="adv-form-group">
                <label className="adv-form-label">Цена за 1 выполнение</label>
                <div className="adv-fixed-reward-info">
                  <span className="adv-fixed-reward-value">{formatTON(adPrice)} TON</span>
                  <span className="adv-fixed-reward-note">исполнитель получит {formatTON(userReward)} TON</span>
                </div>
              </div>

              {/* Max completions */}
              <div className="adv-form-group">
                <label className="adv-form-label">Количество выполнений</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="100000"
                  value={form.max_completions}
                  onChange={e => setForm(f => ({ ...f, max_completions: Math.max(1, parseInt(e.target.value) || 1) }))}
                  required
                />
              </div>

              {/* Cost preview */}
              <div className="adv-cost-preview">
                <div className="adv-cost-preview-value">{formatTON(totalCost)} TON</div>
                <div className="adv-cost-preview-label">
                  {formatTON(adPrice)} TON × {form.max_completions} выполнений
                  {totalCost > balance && <span style={{ color: '#ff3b30', marginLeft: 8 }}>⚠ Недостаточно средств</span>}
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary mt-16"
                style={{ width: '100%', background: 'linear-gradient(135deg, #f5a623, #e09500)' }}
                disabled={creating || totalCost > balance || !form.title || !form.url}
              >
                {creating ? '⏳ Создание...' : `📢 Создать задание (−${formatTON(totalCost)} TON)`}
              </button>
            </form>
          </div>
        )}

        {tab === 'stats' && stats && (
          <div className="adv-stats-grid">
            <div className="card adv-stat-card">
              <span className="adv-stat-icon">📢</span>
              <span className="adv-stat-value">{stats.total_tasks}</span>
              <span className="adv-stat-label">Заданий</span>
            </div>
            <div className="card adv-stat-card">
              <span className="adv-stat-icon">🟢</span>
              <span className="adv-stat-value">{stats.active_tasks}</span>
              <span className="adv-stat-label">Активных</span>
            </div>
            <div className="card adv-stat-card">
              <span className="adv-stat-icon">✅</span>
              <span className="adv-stat-value">{stats.total_completions}</span>
              <span className="adv-stat-label">Выполнений</span>
            </div>
            <div className="card adv-stat-card">
              <span className="adv-stat-icon">💸</span>
              <span className="adv-stat-value gold">{formatTON(stats.total_spent)}</span>
              <span className="adv-stat-label">Потрачено</span>
            </div>
            <div className="card adv-stat-card" style={{ gridColumn: 'span 2' }}>
              <span className="adv-stat-icon">💳</span>
              <span className="adv-stat-value gold">{formatTON(stats.total_deposited)}</span>
              <span className="adv-stat-label">Всего пополнено</span>
            </div>
          </div>
        )}

        {tab === 'penalties' && penaltyData && (
          <div>
            <div className="card" style={{ padding: 16, textAlign: 'center', background: 'linear-gradient(135deg, rgba(52,199,89,0.08), rgba(52,199,89,0.02))', border: '1px solid rgba(52,199,89,0.15)', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>💰 Возвращено на баланс</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#34c759', marginTop: 4 }}>+{formatTON(penaltyData.total_refunded)} TON</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Из {penaltyData.count} штрафов пользователям</div>
            </div>

            <div className="card" style={{ padding: 0 }}>
              {penaltyData.penalties.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: i < penaltyData.penalties.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.task_title || `Задание #${p.task_id}`}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {p.first_name || p.username || `User #${p.user_id}`} отписался
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#34c759' }}>+{formatTON(p.penalty_applied)} TON</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {new Date(p.checked_at).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                </div>
              ))}
              {penaltyData.penalties.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Нет штрафов</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Deposit Modal */}
      {showDeposit && (
        <DepositModal
          onClose={() => setShowDeposit(false)}
          onConfirmed={(newBalance) => { setBalance(newBalance); setShowDeposit(false); }}
        />
      )}
    </div>
  );
}

/**
 * DepositModal — memo-based TON deposit flow
 */
function DepositModal({ onClose, onConfirmed }) {
  const [step, setStep] = useState('amount'); // 'amount' | 'pending' | 'confirmed'
  const [amount, setAmount] = useState('');
  const [deposit, setDeposit] = useState(null);
  const [wallet, setWallet] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [copied, setCopied] = useState('');

  const AMOUNTS = [50, 100, 500, 1000, 5000];

  // Check for existing pending deposit on mount
  useEffect(() => {
    api.getPendingDeposits().then(res => {
      const pending = res.deposits?.find(d => d.status === 'pending' && new Date(d.expires_at) > new Date());
      if (pending) {
        setDeposit(pending);
        setWallet(res.wallet);
        setAmount(pending.amount);
        setStep('pending');
      }
    }).catch(() => {});
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!deposit || step !== 'pending') return;
    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((new Date(deposit.expires_at) - new Date()) / 1000));
      setTimeLeft(diff);
      if (diff <= 0) setStep('amount');
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [deposit, step]);

  const handleCreate = async () => {
    const a = parseFloat(amount);
    if (!a || a <= 0) { setError('Введите сумму'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.createDeposit(a);
      setDeposit(res.deposit);
      setWallet(res.wallet);
      setStep('pending');
      hapticFeedback('success');
    } catch (err) {
      setError(err.message);
      hapticFeedback('error');
    } finally {
      setLoading(false);
    }
  };

  const handleCheck = async () => {
    if (!deposit || checking) return;
    setChecking(true);
    setError('');
    hapticFeedback('medium');
    try {
      const res = await api.checkDeposit(deposit.id);
      if (res.status === 'confirmed') {
        setStep('confirmed');
        hapticFeedback('success');
        setTimeout(() => onConfirmed(res.ad_balance), 2000);
      } else if (res.status === 'expired') {
        setError('Время истекло. Создайте новый депозит.');
        setStep('amount');
        hapticFeedback('error');
      } else {
        setError('Перевод ещё не найден. Убедитесь что вы отправили TON с правильным мемо и попробуйте позже.');
        hapticFeedback('warning');
      }
    } catch (err) {
      setError(err.message);
      hapticFeedback('error');
    } finally {
      setChecking(false);
    }
  };

  const copyText = (text, label) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(label);
    hapticFeedback('light');
    setTimeout(() => setCopied(''), 2000);
  };

  const fmtTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="adv-modal-overlay" onClick={onClose}>
      <div className="adv-modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflow: 'auto' }}>

        {/* Step 1: Amount */}
        {step === 'amount' && (
          <>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>💰 Пополнение баланса</h3>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {AMOUNTS.map(a => (
                <button
                  key={a}
                  onClick={() => { setAmount(String(a)); hapticFeedback('light'); }}
                  style={{
                    padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 700, transition: 'all 0.2s',
                    background: parseFloat(amount) === a ? 'var(--accent-primary)' : 'var(--bg-glass)',
                    color: parseFloat(amount) === a ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {a} TON
                </button>
              ))}
            </div>

            <input
              className="input"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Или введите сумму в TON"
              style={{ marginBottom: 12 }}
            />

            {error && (
              <div style={{ fontSize: 12, color: '#ff3b30', marginBottom: 8, fontWeight: 600 }}>⚠️ {error}</div>
            )}

            <div className="adv-modal-actions">
              <button className="btn btn-outline" onClick={onClose}>Отмена</button>
              <button
                className="btn btn-primary"
                style={{ background: 'linear-gradient(135deg, #f5a623, #e09500)' }}
                onClick={handleCreate}
                disabled={loading || !amount}
              >
                {loading ? '⏳...' : 'Далее →'}
              </button>
            </div>
          </>
        )}

        {/* Step 2: Pending — show memo & wallet */}
        {step === 'pending' && deposit && (
          <>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>📤 Отправьте TON</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Переведите точную сумму на кошелёк ниже с указанным мемо
            </p>

            {/* Amount */}
            <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-glass)', borderRadius: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Сумма перевода</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent-primary)' }}>{formatTON(deposit.amount)} TON</div>
            </div>

            {/* Memo */}
            <div
              onClick={() => copyText(deposit.memo, 'memo')}
              style={{
                padding: '14px 16px', background: 'rgba(245, 166, 35, 0.08)', border: '2px dashed rgba(245, 166, 35, 0.3)',
                borderRadius: 12, marginBottom: 10, cursor: 'pointer', textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 10, color: '#f5a623', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 4 }}>
                ⚠️ ОБЯЗАТЕЛЬНЫЙ МЕМО (Comment)
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.1em', color: '#f5a623', fontFamily: 'monospace' }}>
                {deposit.memo}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {copied === 'memo' ? '✅ Скопировано!' : '👆 Нажмите чтобы скопировать'}
              </div>
            </div>

            {/* Wallet */}
            {wallet && (
              <div
                onClick={() => copyText(wallet, 'wallet')}
                style={{
                  padding: '12px 16px', background: 'var(--bg-glass)', borderRadius: 12,
                  marginBottom: 12, cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  Кошелёк для перевода
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                  {wallet}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {copied === 'wallet' ? '✅ Скопировано!' : '👆 Нажмите чтобы скопировать'}
                </div>
              </div>
            )}

            {/* Timer */}
            <div style={{
              textAlign: 'center', padding: 8, borderRadius: 8,
              background: timeLeft < 300 ? 'rgba(255,59,48,0.08)' : 'rgba(255,149,0,0.08)',
              marginBottom: 12,
            }}>
              <span style={{
                fontSize: 14, fontWeight: 700,
                color: timeLeft < 300 ? '#ff3b30' : '#ff9500',
              }}>
                ⏰ Осталось: {fmtTime(timeLeft)}
              </span>
            </div>

            {error && (
              <div style={{ fontSize: 12, color: '#ff3b30', marginBottom: 8, fontWeight: 600, textAlign: 'center' }}>
                {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>
                Закрыть
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 2, background: 'linear-gradient(135deg, #34c759, #30d158)' }}
                onClick={handleCheck}
                disabled={checking}
              >
                {checking ? '🔍 Проверяю...' : '✅ Я отправил — Проверить'}
              </button>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
              💡 Перевод проверяется автоматически каждые 5 мин.
              <br />Убедитесь что мемо указано <b>точно</b> как показано выше.
            </div>
          </>
        )}

        {/* Step 3: Confirmed */}
        {step === 'confirmed' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Депозит подтверждён!</h3>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#34c759' }}>
              +{formatTON(deposit?.amount || 0)} TON
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              Баланс обновлён. Окно закроется автоматически.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
