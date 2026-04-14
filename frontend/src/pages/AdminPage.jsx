import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Loader from '../components/Loader';
import { hapticFeedback } from '../utils/telegram';
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
  }, [tab]);

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
        const data = await api.getAdminUsers();
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
      reward: parseInt(settings.ad_user_reward) || 10,
      target_url: '',
      target_id: '',
      icon: '🔔',
      sort_order: 0,
      max_completions: 0,
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
                  <span className="admin-stat-value">{stats.total_paid.toLocaleString()}</span>
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
            </div>
          )}

          {/* Tasks Tab */}
          {tab === 'tasks' && (
            <div className="admin-tasks">
              <button
                className="btn btn-primary btn-block mb-16"
                onClick={() => { setEditingTask(null); resetForm(); setShowTaskForm(true); hapticFeedback('light'); }}
                id="create-task-btn"
              >
                ➕ Создать задание
              </button>

              <div className="tasks-list stagger">
                {tasks.map(task => (
                  <div className={`card admin-task-item ${!task.is_active ? 'inactive' : ''}`} key={task.id}>
                    <div className="admin-task-top">
                      <span className="admin-task-icon">{task.icon || '📋'}</span>
                      <div className="admin-task-info">
                        <span className="admin-task-title">{task.title}</span>
                        <span className="admin-task-meta">
                          +{task.reward} Points · {task.current_completions} выполнений
                        </span>
                      </div>
                      <span className={`badge ${task.is_active ? 'badge-success' : 'badge-danger'}`}>
                        {task.is_active ? 'Вкл' : 'Выкл'}
                      </span>
                    </div>
                    <div className="admin-task-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => handleEditTask(task)}>✏️</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleToggleTask(task)}>
                        {task.is_active ? '⏸' : '▶️'}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleDeleteTask(task.id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>

              {tasks.length === 0 && (
                <div className="empty-state">
                  <span className="empty-state-icon">📋</span>
                  <h3 className="empty-state-title">Нет заданий</h3>
                  <p className="empty-state-text">Создайте первое задание</p>
                </div>
              )}
            </div>
          )}

          {/* Users Tab */}
          {tab === 'users' && (
            <div className="admin-users stagger">
              {users.map(u => (
                <div className="card admin-user-item" key={u.id}>
                  <div className="admin-user-avatar">
                    {(u.first_name || u.username || '?')[0].toUpperCase()}
                  </div>
                  <div className="admin-user-info">
                    <span className="admin-user-name">
                      {u.first_name || u.username || `#${u.id}`}
                    </span>
                    <span className="admin-user-meta">
                      💎 {u.balance} · ✅ {u.tasks_completed} · 👥 {u.referral_count || 0}
                    </span>
                  </div>
                </div>
              ))}

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
                <div style={{ fontSize: 32, fontWeight: 800, color: revenue.admin_balance >= 0 ? '#34c759' : '#ff3b30' }}>{revenue.admin_balance.toLocaleString()} pts</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  📈 Комиссия: +{revenue.commission.total.toLocaleString()} · 📉 Расходы заданий: −{revenue.task_expenses.toLocaleString()}
                </div>
              </div>

              <div className="admin-stats-grid" style={{ marginTop: 16 }}>
                <div className="card admin-stat-card">
                  <span className="admin-stat-icon">🏦</span>
                  <span className="admin-stat-value" style={{ color: '#34c759' }}>{revenue.commission.total.toLocaleString()}</span>
                  <span className="admin-stat-label">Комиссия системы</span>
                </div>
                <div className="card admin-stat-card">
                  <span className="admin-stat-icon">🎯</span>
                  <span className="admin-stat-value">{revenue.user_rewards.total.toLocaleString()}</span>
                  <span className="admin-stat-label">Выплата юзерам</span>
                </div>
                <div className="card admin-stat-card">
                  <span className="admin-stat-icon">👥</span>
                  <span className="admin-stat-value">{revenue.ref_rewards.total.toLocaleString()}</span>
                  <span className="admin-stat-label">Реф. награды</span>
                </div>
                <div className="card admin-stat-card">
                  <span className="admin-stat-icon">💳</span>
                  <span className="admin-stat-value">{revenue.total_deposited.toLocaleString()}</span>
                  <span className="admin-stat-label">Всего депозитов</span>
                </div>
              </div>

              <div className="card mt-16" style={{ padding: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📅 Сегодня</h3>
                <div className="admin-today-grid">
                  <div className="admin-today-item">
                    <span className="admin-today-value" style={{ color: '#34c759' }}>{revenue.today.commission}</span>
                    <span className="admin-today-label">Комиссия</span>
                  </div>
                  <div className="admin-today-item">
                    <span className="admin-today-value">{revenue.today.user_rewards}</span>
                    <span className="admin-today-label">Юзерам</span>
                  </div>
                  <div className="admin-today-item">
                    <span className="admin-today-value">{revenue.today.ref_rewards}</span>
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
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📢 Ценообразование рекламных заданий</h3>
                
                <div className="form-group">
                  <label className="form-label">💰 Цена для рекламодателя (за 1 выполнение)</label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    value={settings.ad_price || 20}
                    onChange={e => setSettings(s => ({ ...s, ad_price: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">🎯 Награда исполнителю</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={settings.ad_user_reward || 10}
                    onChange={e => setSettings(s => ({ ...s, ad_user_reward: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">👥 Реферальная награда</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={settings.ad_ref_reward || 2}
                    onChange={e => setSettings(s => ({ ...s, ad_ref_reward: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">🏦 Комиссия системы</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={settings.ad_commission || 8}
                    onChange={e => setSettings(s => ({ ...s, ad_commission: e.target.value }))}
                  />
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
                  📊 Итого: {parseInt(settings.ad_user_reward || 10) + parseInt(settings.ad_ref_reward || 2) + parseInt(settings.ad_commission || 8)} pts
                  {' '}из {settings.ad_price || 20} pts
                  {parseInt(settings.ad_user_reward || 10) + parseInt(settings.ad_ref_reward || 2) + parseInt(settings.ad_commission || 8) !== parseInt(settings.ad_price || 20) && (
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

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Иконка</label>
                <input
                  className="input"
                  value={taskForm.icon}
                  onChange={e => setTaskForm({ ...taskForm, icon: e.target.value })}
                />
              </div>
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

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Порядок</label>
                <input
                  className="input"
                  type="number"
                  value={taskForm.sort_order}
                  onChange={e => setTaskForm({ ...taskForm, sort_order: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Макс. выполнений</label>
                <input
                  className="input"
                  type="number"
                  placeholder="0 = без лимита"
                  value={taskForm.max_completions}
                  onChange={e => setTaskForm({ ...taskForm, max_completions: parseInt(e.target.value) || 0 })}
                />
              </div>
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
