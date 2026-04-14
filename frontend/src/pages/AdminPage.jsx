import { useState, useEffect } from 'react';
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

  // Task form state
  const [taskForm, setTaskForm] = useState({
    type: 'subscribe_channel',
    title: '',
    description: '',
    reward: 100,
    target_url: '',
    target_id: '',
    icon: '🔔',
    sort_order: 0,
    max_completions: 0,
  });

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
        const data = await api.getAdminTasks();
        setTasks(data.tasks);
      } else if (tab === 'users') {
        const data = await api.getAdminUsers();
        setUsers(data.users);
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
      reward: 100,
      target_url: '',
      target_id: '',
      icon: '🔔',
      sort_order: 0,
      max_completions: 0,
    });
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

      {/* Tabs */}
      <div className="filter-tabs mt-16">
        {['stats', 'tasks', 'users'].map(t => (
          <button
            key={t}
            className={`filter-tab ${tab === t ? 'active' : ''}`}
            onClick={() => { setTab(t); hapticFeedback('light'); }}
            id={`admin-tab-${t}`}
          >
            {t === 'stats' && '📊 Статистика'}
            {t === 'tasks' && '📋 Задания'}
            {t === 'users' && '👥 Пользователи'}
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
                <label className="form-label">Награда</label>
                <input
                  className="input"
                  type="number"
                  value={taskForm.reward}
                  onChange={e => setTaskForm({ ...taskForm, reward: parseInt(e.target.value) || 0 })}
                />
              </div>
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
                onChange={e => setTaskForm({ ...taskForm, target_url: e.target.value })}
              />
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
