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
      const [balRes, tasksRes, statsRes, rewardRes] = await Promise.all([
        api.getAdBalance(),
        api.getAdTasks(),
        api.getAdStats(),
        api.getRewardPrice(),
      ]);
      setBalance(balRes.ad_balance);
      setTasks(tasksRes.tasks);
      setStats(statsRes);
      setAdPrice(rewardRes.ad_price);
      setUserReward(rewardRes.ad_user_reward);
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
      <button className="adv-back-btn" onClick={() => { hapticFeedback('light'); navigate('/profile'); }}>
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
                      {task.status !== 'completed' && (
                        <div className="adv-task-actions">
                          <button className="btn btn-sm btn-outline" onClick={() => handleToggle(task)}>
                            {task.status === 'active' ? '⏸ Пауза' : '▶️ Возобновить'}
                          </button>
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
                  {TASK_TYPES.map(t => (
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
      </div>

      {/* Deposit Modal */}
      {showDeposit && (
        <div className="adv-modal-overlay" onClick={() => setShowDeposit(false)}>
          <div className="adv-modal" onClick={e => e.stopPropagation()}>
            <h3>💰 Пополнение баланса</h3>
            <div className="adv-modal-amounts">
              {DEPOSIT_AMOUNTS.map(amt => (
                <button
                  key={amt}
                  className={`adv-amount-btn ${depositAmount === amt ? 'active' : ''}`}
                  onClick={() => { hapticFeedback('light'); setDepositAmount(amt); }}
                >
                  {amt.toLocaleString()}
                </button>
              ))}
            </div>
            <input
              className="input"
              type="text"
              inputMode="decimal"
              value={depositAmount}
              onChange={e => setDepositAmount(e.target.value)}
              placeholder="Или введите сумму"
            />
            <div className="adv-modal-actions">
              <button className="btn btn-outline" onClick={() => setShowDeposit(false)}>
                Отмена
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'linear-gradient(135deg, #f5a623, #e09500)' }}
                onClick={handleDeposit}
                disabled={depositing}
              >
                {depositing ? '⏳...' : `+${formatTON(depositAmount)} TON`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
