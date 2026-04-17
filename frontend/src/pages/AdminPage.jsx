import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Loader from '../components/Loader';
import { hapticFeedback } from '../utils/telegram';
import { formatTON } from '../utils/format';
import * as api from '../utils/api';
import './AdminPage.css';

export default function AdminPage({ user }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [toast, setToast] = useState(null);
  const [settings, setSettings] = useState({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [revenue, setRevenue] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(null);
  const [userSort, setUserSort] = useState('date');
  const resolveTimer = useRef(null);

  // Task form state
  const [taskForm, setTaskForm] = useState({
    type: 'subscribe_channel',
    title: '',
    description: '',
    reward: 0,
    target_url: '',
    target_id: '',
    icon: '🔔',
    sort_order: 0,
    max_completions: 0,
    image_url: null,
  });

  // Auto-resolve Telegram URL
  const resolveUrl = useCallback(async (url, type) => {
    if (!url || type === 'visit_link') { setResolved(null); return; }
    const isTg = url.includes('t.me/') || /^@?[a-zA-Z0-9_]{3,}$/.test(url);
    if (!isTg) { setResolved(null); return; }
    setResolving(true);
    try {
      const data = await api.resolveAdUrl(url, type);
      setResolved(data);
      if (data.success) {
        setTaskForm(f => ({
          ...f,
          title: data.title || f.title,
          description: data.description || f.description,
          target_id: data.username ? '@' + data.username : f.target_id,
          image_url: data.image_url || null,
        }));
      }
    } catch (err) {
      console.error('Resolve error:', err);
    } finally {
      setResolving(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.is_admin) {
      navigate('/');
      return;
    }
    loadData();
  }, [tab, userSort]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (tab === 'stats') {
        const data = await api.getAdminStats();
        setStats(data);
      } else if (tab === 'tasks') {
        const [tasksData, settingsData] = await Promise.all([
          api.getAdminTasks(),
          api.getAdminSettings(),
        ]);
        setTasks(tasksData.tasks);
        setSettings(settingsData.settings || {});
      } else if (tab === 'users') {
        const data = await api.getAdminUsers(1, userSort);
        setUsers(data.users);
      } else if (tab === 'settings') {
        const data = await api.getAdminSettings();
        setSettings(data.settings || {});
      } else if (tab === 'revenue') {
        const data = await api.getAdRevenue();
        setRevenue(data);
      }
    } catch (err) {
      console.error('Admin load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const showToastMsg = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreateTask = async () => {
    if (!taskForm.title || !taskForm.target_url) {
      showToastMsg('Заполните название и URL', 'error');
      return;
    }
    try {
      if (editingTask) {
        await api.updateTask(editingTask.id, taskForm);
        showToastMsg('Задание обновлено ✅');
      } else {
        await api.createTask(taskForm);
        showToastMsg('Задание создано ✅');
      }
      hapticFeedback('success');
      setShowTaskForm(false);
      setEditingTask(null);
      resetForm();
      loadData();
    } catch (err) {
      showToastMsg(err.message, 'error');
      hapticFeedback('error');
    }
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    setTaskForm({
      type: task.type,
      title: task.title,
      description: task.description || '',
      reward: task.reward,
      target_url: task.target_url,
      target_id: task.target_id || '',
      icon: task.icon || '📋',
      sort_order: task.sort_order || 0,
      max_completions: task.max_completions || 0,
      image_url: task.image_url || null,
    });
    setShowTaskForm(true);
    hapticFeedback('light');
  };

  const handleToggleTask = async (task) => {
    try {
      await api.updateTask(task.id, { is_active: task.is_active ? 0 : 1 });
      hapticFeedback('medium');
      loadData();
    } catch (err) {
      showToastMsg(err.message, 'error');
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm('Удалить задание?')) return;
    try {
      await api.deleteTask(taskId);
      hapticFeedback('success');
      showToastMsg('Задание удалено');
      loadData();
    } catch (err) {
      showToastMsg(err.message, 'error');
    }
  };

  const resetForm = () => {
    setTaskForm({
      type: 'subscribe_channel',
      title: '',
      description: '',
      reward: parseFloat(settings.ad_user_reward) || 10,
      target_url: '',
      target_id: '',
      icon: '🔔',
      sort_order: 0,
      max_completions: 0,
      image_url: null,
    });
    setResolved(null);
  };

  const iconByType = { subscribe_channel: '🔔', start_bot: '🤖', visit_link: '🔗' };

  return (
    <div className="page admin-page">
      <div className="admin-header">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/profile')}>
          ← Назад
        </button>
        <h1 className="section-title">⚙️ Админ</h1>
      </div>

      {/* Menu Grid */}
      <div className="admin-menu mt-16">
        {[
          { key: 'stats', icon: '📊', label: 'Статистика' },
          { key: 'tasks', icon: '📋', label: 'Задания' },
          { key: 'users', icon: '👥', label: 'Юзеры' },
          { key: 'revenue', icon: '💰', label: 'Доход' },
          { key: 'settings', icon: '⚙️', label: 'Настройки' },
        ].map(item => (
          <button
            key={item.key}
            className={`admin-menu-item ${tab === item.key ? 'active' : ''}`}
            onClick={() => { setTab(item.key); hapticFeedback('light'); }}
            id={`admin-tab-${item.key}`}
          >
            <span className="admin-menu-icon">{item.icon}</span>
            <span className="admin-menu-label">{item.label}</span>
          </button>
        ))}
      </div>

      {loading ? <Loader text="Загрузка..." /> : (
        <>
          {/* Stats Tab */}
          {tab === 'stats' && stats && (
            <div className="admin-stats stagger">
              <div className="admin-stats-grid">
                <div className="card admin-stat-card">
                  <span className="admin-stat-icon">👥</span>
                  <span className="admin-stat-value">{stats.users}</span>
                  <span className="admin-stat-label">Всего юзеров</span>
                </div>
                <div className="card admin-stat-card">
                  <span className="admin-stat-icon">📋</span>
                  <span className="admin-stat-value">{stats.active_tasks}</span>
                  <span className="admin-stat-label">Активных заданий</span>
                </div>
                <div className="card admin-stat-card">
                  <span className="admin-stat-icon">✅</span>
                  <span className="admin-stat-value">{stats.total_completions}</span>
                  <span className="admin-stat-label">Выполнений</span>
                </div>
                <div className="card admin-stat-card">
                  <span className="admin-stat-icon">💎</span>
                  <span className="admin-stat-value">{formatTON(stats.total_paid)}</span>
                  <span className="admin-stat-label">Всего выплат</span>
                </div>
              </div>

              <div className="card mt-16">
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📅 Сегодня</h3>
                <div className="admin-today-grid">
                  <div className="admin-today-item">
                    <span className="admin-today-value">{stats.today_users}</span>
                    <span className="admin-today-label">Новых юзеров</span>
                  </div>
                  <div className="admin-today-item">
                    <span className="admin-today-value">{stats.today_completions}</span>
                    <span className="admin-today-label">Выполнений</span>
                  </div>
                </div>
              </div>

              {/* Penalty Stats */}
              {stats.penalties && (
                <div className="card mt-16" style={{ border: '1px solid rgba(255, 59, 48, 0.15)' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>⚠️ Штрафы</h3>
                  <div className="admin-stats-grid">
                    <div className="card admin-stat-card" style={{ background: 'rgba(255, 59, 48, 0.06)' }}>
                      <span className="admin-stat-icon">🚫</span>
                      <span className="admin-stat-value" style={{ color: '#ff3b30' }}>{stats.penalties.total_count}</span>
                      <span className="admin-stat-label">Всего штрафов</span>
                    </div>
                    <div className="card admin-stat-card" style={{ background: 'rgba(255, 59, 48, 0.06)' }}>
                      <span className="admin-stat-icon">💸</span>
                      <span className="admin-stat-value" style={{ color: '#ff3b30' }}>{formatTON(stats.penalties.total_amount)}</span>
                      <span className="admin-stat-label">Списано TON</span>
                    </div>
                    <div className="card admin-stat-card" style={{ background: 'rgba(255, 149, 0, 0.06)' }}>
                      <span className="admin-stat-icon">⏳</span>
                      <span className="admin-stat-value" style={{ color: '#ff9500' }}>{stats.penalties.pending_checks}</span>
                      <span className="admin-stat-label">На проверке</span>
                    </div>
                    <div className="card admin-stat-card" style={{ background: 'rgba(255, 59, 48, 0.06)' }}>
                      <span className="admin-stat-icon">📅</span>
                      <span className="admin-stat-value" style={{ color: '#ff3b30' }}>{stats.penalties.today_count}</span>
                      <span className="admin-stat-label">Штрафов сегодня</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tasks Tab */}
          {tab === 'tasks' && (() => {
            const taskFilter = window._adminTaskFilter || 'all';
            const setTaskFilter = (f) => { window._adminTaskFilter = f; setTasks([...tasks]); };
            const filtered = taskFilter === 'all' ? tasks 
              : taskFilter === 'admin' ? tasks.filter(t => t.source === 'admin')
              : tasks.filter(t => t.source === 'ad');
            const adminCount = tasks.filter(t => t.source === 'admin').length;
            const adCount = tasks.filter(t => t.source === 'ad').length;

            return (
            <div className="admin-tasks">
              <button
                className="btn btn-primary btn-block mb-16"
                onClick={() => { setEditingTask(null); resetForm(); setShowTaskForm(true); hapticFeedback('light'); }}
                id="create-task-btn"
              >
                ➕ Создать задание
              </button>

              {/* Filter buttons */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[
                  { key: 'all', label: `Все (${tasks.length})` },
                  { key: 'admin', label: `⚙️ Админ (${adminCount})` },
                  { key: 'ad', label: `📢 Рекл. (${adCount})` },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => { hapticFeedback('light'); setTaskFilter(f.key); }}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, transition: 'all 0.2s',
                      background: taskFilter === f.key ? 'var(--accent-primary)' : 'var(--bg-glass)',
                      color: taskFilter === f.key ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="tasks-list stagger">
                {filtered.map(task => (
                  <div className={`card admin-task-item ${!task.is_active ? 'inactive' : ''}`} key={`${task.source}-${task.id}`}>
                    <div className="admin-task-top">
                      <span className="admin-task-icon">
                        {task.source === 'ad' ? '📢' : (task.icon || '📋')}
                      </span>
                      <div className="admin-task-info">
                        <span className="admin-task-title">{task.title}</span>
                        <span className="admin-task-meta">
                          {task.source === 'ad' ? `👤 ${task.advertiser_name} · ` : '⚙️ Админ · '}
                          {task.current_completions}/{task.max_completions || '∞'} выполнений
                        </span>
                      </div>
                      <span className={`badge ${task.is_active ? 'badge-success' : 'badge-danger'}`}>
                        {task.is_active ? 'Вкл' : 'Выкл'}
                      </span>
                    </div>
                    {task.source === 'admin' && (
                      <div className="admin-task-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => handleEditTask(task)}>✏️</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleToggleTask(task)}>
                          {task.is_active ? '⏸' : '▶️'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleDeleteTask(task.id)}>🗑</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {filtered.length === 0 && (
                <div className="empty-state">
                  <span className="empty-state-icon">📋</span>
                  <h3 className="empty-state-title">Нет заданий</h3>
                  <p className="empty-state-text">Создайте первое задание</p>
                </div>
              )}
            </div>
            );
          })()}

          {/* Users Tab */}
          {tab === 'users' && (
            <div className="admin-users stagger">
              {/* Sort */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {[
                  { key: 'date', label: '📅 Дата' },
                  { key: 'balance', label: '💎 Баланс' },
                  { key: 'karma', label: '☯️ Карма' },
                  { key: 'earned', label: '💰 Доход' },
                  { key: 'penalties', label: '⚠️ Штрафы' },
                  { key: 'ad_balance', label: '📢 Рекл.' },
                ].map(s => (
                  <button
                    key={s.key}
                    onClick={() => { setUserSort(s.key); hapticFeedback('light'); }}
                    style={{
                      padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 600, transition: 'all 0.2s',
                      background: userSort === s.key ? 'var(--accent-primary)' : 'var(--bg-glass)',
                      color: userSort === s.key ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {users.map(u => {
                const karma = u.karma ?? 50;
                const karmaColor = karma >= 50 ? '#34c759' : karma >= 20 ? '#ff9500' : '#ff3b30';
                const avatarGrad = karma >= 50
                  ? 'linear-gradient(135deg, #34c759, #30d158)'
                  : karma >= 20
                    ? 'linear-gradient(135deg, #ff9500, #ffb340)'
                    : 'linear-gradient(135deg, #ff3b30, #ff6961)';
                return (
                <div key={u.id} style={{
                  background: 'var(--bg-card)',
                  borderRadius: 16,
                  border: u.is_blocked ? '1px solid rgba(255,59,48,0.3)' : '1px solid var(--border)',
                  padding: 16,
                  marginBottom: 10,
                  opacity: u.is_blocked ? 0.7 : 1,
                  transition: 'all 0.2s',
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {u.photo_url ? (
                      <img
                        src={u.photo_url}
                        alt=""
                        style={{
                          width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                          objectFit: 'cover',
                          border: `2px solid ${karmaColor}40`,
                          boxShadow: `0 4px 12px ${karmaColor}22`,
                        }}
                      />
                    ) : (
                      <div style={{
                        width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                        background: avatarGrad,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, fontWeight: 800, color: '#fff',
                        boxShadow: `0 4px 12px ${karmaColor}33`,
                      }}>
                        {(u.first_name || u.username || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.first_name || u.username || `ID: ${u.id}`}
                        </span>
                        {u.is_blocked && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,59,48,0.15)', color: '#ff3b30', fontWeight: 700 }}>BAN</span>}
                      </div>
                      {u.username && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>@{u.username}</div>
                      )}
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 8 }}>
                        <span>📅 {new Date(u.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                        <span>🕐 {new Date(u.updated_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} {new Date(u.updated_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <div style={{
                      padding: '4px 10px', borderRadius: 8,
                      background: `${karmaColor}18`, border: `1px solid ${karmaColor}30`,
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: karmaColor, lineHeight: 1 }}>{karma}</div>
                      <div style={{ fontSize: 8, color: karmaColor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>карма</div>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 12,
                    background: 'var(--bg-glass)', borderRadius: 12, padding: 8,
                  }}>
                    {[
                      { icon: '💎', val: formatTON(u.balance, 5), label: 'Баланс' },
                      { icon: '✅', val: u.tasks_completed, label: 'Задания' },
                      { icon: '👥', val: u.referral_count || 0, label: 'Рефы' },
                      { icon: '💰', val: formatTON(u.total_earned, 5), label: 'Доход' },
                    ].map((s, i) => (
                      <div key={i} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, marginBottom: 2 }}>{s.icon}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{s.val}</div>
                        <div style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Badges */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    {parseFloat(u.ad_balance) > 0 && (
                      <span style={{ fontSize: 10, padding: '4px 10px', borderRadius: 20, background: 'rgba(0,122,255,0.08)', border: '1px solid rgba(0,122,255,0.15)', color: '#007aff', fontWeight: 700 }}>
                        📢 Рекл: {formatTON(u.ad_balance, 5)}
                      </span>
                    )}
                    {parseInt(u.penalty_count) > 0 && (
                      <span style={{ fontSize: 10, padding: '4px 10px', borderRadius: 20, background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.15)', color: '#ff3b30', fontWeight: 700 }}>
                        ⚠️ {u.penalty_count} штр. ({formatTON(u.penalty_amount, 5)})
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={async () => {
                        try {
                          await api.blockUser(u.id);
                          hapticFeedback('medium');
                          showToastMsg(u.is_blocked ? 'Разблокирован ✅' : 'Заблокирован 🚫');
                          loadData();
                        } catch (err) { showToastMsg(err.message, 'error'); }
                      }}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: 700, transition: 'all 0.2s',
                        background: u.is_blocked ? 'rgba(52,199,89,0.1)' : 'rgba(255,149,0,0.1)',
                        color: u.is_blocked ? '#34c759' : '#ff9500',
                      }}
                    >
                      {u.is_blocked ? '✅ Разблокировать' : '🚫 Заблокировать'}
                    </button>
                    <button
                      onClick={async () => {
                        const pin = prompt('🔐 Введите PIN для удаления:');
                        if (!pin) return;
                        if (!confirm(`Удалить ${u.first_name || u.username || u.id}? Все данные будут потеряны!`)) return;
                        try {
                          await api.deleteUser(u.id, pin);
                          hapticFeedback('success');
                          showToastMsg('Пользователь удалён ✅');
                          loadData();
                        } catch (err) { showToastMsg(err.message, 'error'); hapticFeedback('error'); }
                      }}
                      style={{
                        padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: 700, transition: 'all 0.2s',
                        background: 'rgba(255,59,48,0.1)', color: '#ff3b30',
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
                );
              })}

              {users.length === 0 && (
                <div className="empty-state">
                  <span className="empty-state-icon">👥</span>
                  <h3 className="empty-state-title">Нет пользователей</h3>
                </div>
              )}
            </div>
          )}

          {/* Revenue Tab */}
          {tab === 'revenue' && revenue && (
            <div className="admin-stats stagger">
              {/* Admin Balance */}
              <div className="card" style={{ padding: 20, textAlign: 'center', background: 'linear-gradient(135deg, rgba(52, 199, 89, 0.08), rgba(52, 199, 89, 0.02))', border: '1px solid rgba(52, 199, 89, 0.15)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>💰 Баланс системы</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: revenue.admin_balance >= 0 ? '#34c759' : '#ff3b30' }}>{formatTON(revenue.admin_balance)} TON</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  📈 Комиссия: +{formatTON(revenue.commission.total)} · 📉 Расходы заданий: −{formatTON(revenue.task_expenses)}
                </div>
              </div>

              <div className="admin-stats-grid" style={{ marginTop: 16 }}>
                <div className="card admin-stat-card">
                  <span className="admin-stat-icon">🏦</span>
                  <span className="admin-stat-value" style={{ color: '#34c759' }}>{formatTON(revenue.commission.total)}</span>
                  <span className="admin-stat-label">Комиссия системы</span>
                </div>
                <div className="card admin-stat-card">
                  <span className="admin-stat-icon">🎯</span>
                  <span className="admin-stat-value">{formatTON(revenue.user_rewards.total)}</span>
                  <span className="admin-stat-label">Выплата юзерам</span>
                </div>
                <div className="card admin-stat-card">
                  <span className="admin-stat-icon">👥</span>
                  <span className="admin-stat-value">{formatTON(revenue.ref_rewards.total)}</span>
                  <span className="admin-stat-label">Реф. награды</span>
                </div>
                <div className="card admin-stat-card">
                  <span className="admin-stat-icon">💳</span>
                  <span className="admin-stat-value">{formatTON(revenue.total_deposited)}</span>
                  <span className="admin-stat-label">Всего депозитов</span>
                </div>
              </div>

              <div className="card mt-16" style={{ padding: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📅 Сегодня</h3>
                <div className="admin-today-grid">
                  <div className="admin-today-item">
                    <span className="admin-today-value" style={{ color: '#34c759' }}>{formatTON(revenue.today.commission)}</span>
                    <span className="admin-today-label">Комиссия</span>
                  </div>
                  <div className="admin-today-item">
                    <span className="admin-today-value">{formatTON(revenue.today.user_rewards)}</span>
                    <span className="admin-today-label">Юзерам</span>
                  </div>
                  <div className="admin-today-item">
                    <span className="admin-today-value">{formatTON(revenue.today.ref_rewards)}</span>
                    <span className="admin-today-label">Рефералам</span>
                  </div>
                </div>
              </div>

              {revenue.top_users.length > 0 && (
                <div className="card mt-16" style={{ padding: 16 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>🏆 Топ исполнители</h3>
                  {revenue.top_users.map((u, i) => (
                    <div key={u.user_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < revenue.top_users.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ fontSize: 13 }}>{i + 1}. {u.first_name || u.username || `#${u.user_id}`}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>+{u.total_earned}</span>
                    </div>
                  ))}
                </div>
              )}

              {revenue.top_refs.length > 0 && (
                <div className="card mt-16" style={{ padding: 16 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>👥 Топ рефереры</h3>
                  {revenue.top_refs.map((u, i) => (
                    <div key={u.user_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < revenue.top_refs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ fontSize: 13 }}>{i + 1}. {u.first_name || u.username || `#${u.user_id}`}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-secondary)' }}>+{u.total_earned}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {tab === 'settings' && (
            <div className="admin-settings stagger">
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>🏦 Баланс системы</h3>
                <div className="form-group">
                  <label className="form-label">💰 Системный баланс (TON)</label>
                  <input
                    className="input"
                    type="text"
                    inputMode="decimal"
                    value={settings.admin_balance ?? ''}
                    onChange={e => setSettings({ ...settings, admin_balance: e.target.value })}
                  />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Из этого баланса списывается стоимость заданий (reward × кол-во)
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-block"
                  onClick={async () => {
                    const pin = prompt('🔐 Введите PIN-код для изменения баланса:');
                    if (!pin) return;
                    try {
                      const res = await api.updateAdminSettings({
                        admin_balance: settings.admin_balance,
                        pin: pin,
                      });
                      setSettings(res.settings);
                      showToastMsg('Баланс обновлён ✅');
                      hapticFeedback('success');
                    } catch (err) {
                      showToastMsg(err.message || 'Неверный PIN', 'error');
                      hapticFeedback('error');
                    }
                  }}
                >
                  🔐 Сохранить баланс
                </button>
              </div>

              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📢 Ценообразование рекламных заданий</h3>
                
                <div className="form-group">
                  <label className="form-label">💰 Цена для рекламодателя (за 1 выполнение)</label>
                  <input
                    className="input"
                    type="text"
                    inputMode="decimal"
                    value={settings.ad_price ?? ''}
                    onChange={e => setSettings(s => ({ ...s, ad_price: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">🎯 Награда исполнителю</label>
                  <input
                    className="input"
                    type="text"
                    inputMode="decimal"
                    value={settings.ad_user_reward ?? ''}
                    onChange={e => setSettings(s => ({ ...s, ad_user_reward: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">👥 Реферальная награда</label>
                  <input
                    className="input"
                    type="text"
                    inputMode="decimal"
                    value={settings.ad_ref_reward ?? ''}
                    onChange={e => setSettings(s => ({ ...s, ad_ref_reward: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">🏦 Комиссия системы</label>
                  <input
                    className="input"
                    type="text"
                    inputMode="decimal"
                    value={settings.ad_commission ?? ''}
                    onChange={e => setSettings(s => ({ ...s, ad_commission: e.target.value }))}
                  />
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
                  📊 Итого: {formatTON(parseFloat(settings.ad_user_reward || 10) + parseFloat(settings.ad_ref_reward || 2) + parseFloat(settings.ad_commission || 8))} TON
                  {' '}из {formatTON(settings.ad_price || 20)} TON
                  {Math.abs((parseFloat(settings.ad_user_reward || 10) + parseFloat(settings.ad_ref_reward || 2) + parseFloat(settings.ad_commission || 8)) - parseFloat(settings.ad_price || 20)) > 0.0001 && (
                    <span style={{ color: '#ff3b30', fontWeight: 700 }}> ⚠ Суммы не совпадают!</span>
                  )}
                </div>

                <button
                  className="btn btn-primary mt-16"
                  style={{ width: '100%' }}
                  disabled={savingSettings}
                  onClick={async () => {
                    setSavingSettings(true);
                    try {
                      const res = await api.updateAdminSettings({
                        ad_price: settings.ad_price,
                        ad_user_reward: settings.ad_user_reward,
                        ad_ref_reward: settings.ad_ref_reward,
                        ad_commission: settings.ad_commission,
                        sub_check_hours: settings.sub_check_hours,
                        unsub_penalty: settings.unsub_penalty,
                        referral_bonus: settings.referral_bonus,
                        daily_bonus: settings.daily_bonus,
                      });
                      setSettings(res.settings);
                      showToastMsg('Настройки сохранены ✅');
                      hapticFeedback('success');
                    } catch (err) {
                      showToastMsg(err.message, 'error');
                    } finally {
                      setSavingSettings(false);
                    }
                  }}
                >
                  {savingSettings ? '⚙️ Сохранение...' : '💾 Сохранить'}
                </button>
              </div>

              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>🎁 Бонусы</h3>
                
                <div className="form-group">
                  <label className="form-label">👥 Реферальный бонус (TON)</label>
                  <input
                    className="input"
                    type="text"
                    inputMode="decimal"
                    value={settings.referral_bonus ?? ''}
                    onChange={e => setSettings(s => ({ ...s, referral_bonus: e.target.value }))}
                  />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Бонус получают оба — пригласивший и приглашённый
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">🌟 Ежедневный бонус (TON)</label>
                  <input
                    className="input"
                    type="text"
                    inputMode="decimal"
                    value={settings.daily_bonus ?? ''}
                    onChange={e => setSettings(s => ({ ...s, daily_bonus: e.target.value }))}
                  />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Базовый бонус × стрик (макс 7 дней). Напр.: 0.001 × 3 = 0.003 TON
                  </div>
                </div>

                <button
                  className="btn btn-primary mt-16"
                  style={{ width: '100%' }}
                  disabled={savingSettings}
                  onClick={async () => {
                    setSavingSettings(true);
                    try {
                      const res = await api.updateAdminSettings({
                        referral_bonus: settings.referral_bonus,
                        daily_bonus: settings.daily_bonus,
                      });
                      setSettings(res.settings);
                      showToastMsg('Бонусы сохранены ✅');
                      hapticFeedback('success');
                    } catch (err) {
                      showToastMsg(err.message, 'error');
                    } finally {
                      setSavingSettings(false);
                    }
                  }}
                >
                  {savingSettings ? '⚙️ Сохранение...' : '💾 Сохранить'}
                </button>
              </div>

              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>🔍 Проверка подписок</h3>
                
                <div className="form-group">
                  <label className="form-label">⏰ Обязательная подписка (часов)</label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="720"
                    value={settings.sub_check_hours ?? ''}
                    onChange={e => setSettings(s => ({ ...s, sub_check_hours: e.target.value }))}
                  />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Юзер должен оставаться подписан указанное время. После этого срока может отписаться без штрафа.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">🔄 Интервал проверки (минут)</label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="1440"
                    value={settings.unsub_check_interval ?? ''}
                    onChange={e => setSettings(s => ({ ...s, unsub_check_interval: e.target.value }))}
                  />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Как часто бот проверяет подписки (по умолчанию 30 мин)
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">💸 Штраф за отписку (TON)</label>
                  <input
                    className="input"
                    type="text"
                    inputMode="decimal"
                    value={settings.unsub_penalty ?? ''}
                    onChange={e => setSettings(s => ({ ...s, unsub_penalty: e.target.value }))}
                  />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Если юзер отписался — с баланса списывается штраф и отправляется уведомление
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={savingSettings}
                    onClick={async () => {
                      setSavingSettings(true);
                      try {
                        const res = await api.updateAdminSettings({
                          sub_check_hours: settings.sub_check_hours,
                          unsub_penalty: settings.unsub_penalty,
                          unsub_check_interval: settings.unsub_check_interval,
                        });
                        setSettings(res.settings);
                        showToastMsg('Настройки подписок сохранены ✅');
                        hapticFeedback('success');
                      } catch (err) {
                        showToastMsg(err.message, 'error');
                      } finally {
                        setSavingSettings(false);
                      }
                    }}
                  >
                    {savingSettings ? '⚙️ Сохранение...' : '💾 Сохранить'}
                  </button>
                  <button
                    className="btn"
                    style={{ 
                      flex: 1, background: 'rgba(52,199,89,0.15)', 
                      color: '#34c759', border: '1px solid rgba(52,199,89,0.3)' 
                    }}
                    onClick={async () => {
                      try {
                        const res = await api.checkSubscriptions();
                        showToastMsg(res.message || 'Проверка завершена ✅');
                        hapticFeedback('success');
                      } catch (err) {
                        showToastMsg(err.message || 'Ошибка проверки', 'error');
                      }
                    }}
                  >
                    🔍 Проверить сейчас
                  </button>
                </div>
              </div>

              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>☯️ Модификаторы кармы (%)</h3>
                
                <div className="form-group">
                  <label className="form-label">🌟 Бонус за высокую карму (80-100)</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="100"
                    value={settings.karma_bonus_high ?? '5'}
                    onChange={e => setSettings(s => ({ ...s, karma_bonus_high: e.target.value }))}
                  />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    +{settings.karma_bonus_high || 5}% к награде из системного баланса
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">⚠️ Штраф за низкую карму (20-49)</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="100"
                    value={settings.karma_penalty_low ?? '10'}
                    onChange={e => setSettings(s => ({ ...s, karma_penalty_low: e.target.value }))}
                  />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    -{settings.karma_penalty_low || 10}% от награды в системный баланс
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">🚫 Штраф за критическую карму (0-19)</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max="100"
                    value={settings.karma_penalty_critical ?? '15'}
                    onChange={e => setSettings(s => ({ ...s, karma_penalty_critical: e.target.value }))}
                  />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    -{settings.karma_penalty_critical || 15}% от награды в системный баланс
                  </div>
                </div>

                <button
                  className="btn btn-primary btn-block"
                  disabled={savingSettings}
                  onClick={async () => {
                    setSavingSettings(true);
                    try {
                      const res = await api.updateAdminSettings({
                        karma_bonus_high: settings.karma_bonus_high,
                        karma_penalty_low: settings.karma_penalty_low,
                        karma_penalty_critical: settings.karma_penalty_critical,
                      });
                      setSettings(res.settings);
                      showToastMsg('Настройки кармы сохранены ✅');
                      hapticFeedback('success');
                    } catch (err) {
                      showToastMsg(err.message, 'error');
                    } finally {
                      setSavingSettings(false);
                    }
                  }}
                >
                  {savingSettings ? '⚙️ Сохранение...' : '💾 Сохранить'}
                </button>
              </div>

              <div className="card" style={{ padding: 20, border: '1px solid rgba(239,68,68,0.3)' }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#ef4444' }}>⚠️ Опасная зона</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                  Удаление всех данных необратимо. Будут удалены все пользователи, задания, выполнения и транзакции. Настройки сохранятся.
                </p>
                <button
                  className="btn btn-block"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                  onClick={async () => {
                    const pin = prompt('🔐 Введите PIN-код:');
                    if (!pin) return;
                    const password = prompt('🔑 Введите пароль:');
                    if (!password) return;
                    if (!confirm('❗ ВСЕ ДАННЫЕ БУДУТ УДАЛЕНЫ! Вы уверены?')) return;
                    try {
                      await api.resetDatabase(pin, password);
                      showToastMsg('Все данные удалены ✅');
                      hapticFeedback('success');
                      loadData();
                    } catch (err) {
                      showToastMsg(err.message, 'error');
                      hapticFeedback('error');
                    }
                  }}
                >
                  🗑 Удалить все данные
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Task Form Modal */}
      {showTaskForm && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowTaskForm(false); }}>
          <div className="modal" id="task-form-modal">
            <div className="modal-header">
              <h2 className="modal-title">
                {editingTask ? '✏️ Редактировать' : '➕ Новое задание'}
              </h2>
              <button className="modal-close" onClick={() => setShowTaskForm(false)}>✕</button>
            </div>

            <div className="form-group">
              <label className="form-label">Тип</label>
              <select
                className="select"
                value={taskForm.type}
                onChange={e => {
                  const type = e.target.value;
                  setTaskForm({ ...taskForm, type, icon: iconByType[type] || '📋' });
                }}
              >
                <option value="subscribe_channel">🔔 Подписка на канал</option>
                <option value="start_bot">🤖 Запуск бота</option>
                <option value="visit_link">🔗 Посещение ссылки</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Название</label>
              <input
                className="input"
                placeholder="Подпишись на канал..."
                value={taskForm.title}
                onChange={e => setTaskForm({ ...taskForm, title: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Описание</label>
              <input
                className="input"
                placeholder="Описание (необязательно)"
                value={taskForm.description}
                onChange={e => setTaskForm({ ...taskForm, description: e.target.value })}
              />
            </div>



            <div className="form-group">
              <label className="form-label">URL (ссылка на канал/бота/сайт)</label>
              <input
                className="input"
                placeholder="https://t.me/..."
                value={taskForm.target_url}
                onChange={e => {
                  const newUrl = e.target.value;
                  setTaskForm({ ...taskForm, target_url: newUrl });
                  setResolved(null);
                  if (resolveTimer.current) clearTimeout(resolveTimer.current);
                  resolveTimer.current = setTimeout(() => resolveUrl(newUrl, taskForm.type), 500);
                }}
              />
              {resolving && <div style={{ fontSize: 12, color: 'var(--accent-primary)', marginTop: 4 }}>⏳ Загрузка...</div>}
              {resolved && resolved.success && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, padding: 10, borderRadius: 10, background: 'var(--bg-glass)', border: '1px solid var(--border)' }}>
                  {resolved.image_url && (
                    <img src={resolved.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{resolved.title}</div>
                    {resolved.members_count > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>👥 {resolved.members_count.toLocaleString()} подписчиков</div>}
                  </div>
                  <span style={{ fontSize: 16 }}>✅</span>
                </div>
              )}
            </div>

            {taskForm.type === 'subscribe_channel' && (
              <div className="form-group">
                <label className="form-label">ID канала (для проверки, напр. @channel)</label>
                <input
                  className="input"
                  placeholder="@channel_name"
                  value={taskForm.target_id}
                  onChange={e => setTaskForm({ ...taskForm, target_id: e.target.value })}
                />
              </div>
            )}


            <div className="form-group">
              <label className="form-label">📊 Кол-во выполнений</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[100, 200, 300, 400, 500, 1000].map(n => (
                  <button
                    key={n}
                    type="button"
                    className={`btn ${taskForm.max_completions === n ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: '1 1 auto', minWidth: 60, padding: '8px 4px', fontSize: 13 }}
                    onClick={() => setTaskForm({ ...taskForm, max_completions: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {taskForm.max_completions > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  💰 Бюджет: <b style={{ color: 'var(--accent-primary)' }}>{formatTON(parseFloat(settings.ad_price || 0.002) * taskForm.max_completions)} TON</b>
                  {' '}({taskForm.max_completions} × {formatTON(settings.ad_price || 0.002)})
                  <br/>
                  🎯 Награда юзеру: {formatTON(settings.ad_user_reward || 0.001)} · 👥 Рефералу: {formatTON(settings.ad_ref_reward || 0)} · 🏦 Комиссия: {formatTON(settings.ad_commission || 0)}
                </div>
              )}
            </div>

            <button
              className="btn btn-primary btn-block mt-16"
              onClick={handleCreateTask}
              id="save-task-btn"
            >
              {editingTask ? '💾 Сохранить' : '✅ Создать'}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type} show`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
