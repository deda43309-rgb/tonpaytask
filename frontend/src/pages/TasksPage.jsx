import { useState, useEffect } from 'react';
import TaskCard from '../components/TaskCard';
import Loader from '../components/Loader';
import { formatTON } from '../utils/format';
import * as api from '../utils/api';
import './TasksPage.css';

const filterOptions = [
  { key: 'all', label: '🔥 Все' },
  { key: 'subscribe_channel', label: '🔔 Подписки' },
  { key: 'start_bot', label: '🤖 Боты' },
  { key: 'visit_link', label: '🔗 Ссылки' },
];

export default function TasksPage({ user, onUserUpdate }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState(null);
  const [penalty, setPenalty] = useState(0);
  const [subCheckHours, setSubCheckHours] = useState(72);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const data = await api.getTasks();
      setTasks(data.tasks);
      setPenalty(data.unsub_penalty || 0);
      setSubCheckHours(data.sub_check_hours || 72);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (taskId, isAd) => {
    try {
      const result = isAd
        ? await api.completeAdTask(taskId)
        : await api.completeTask(taskId);
      
      // Update task in list
      const key = isAd ? `ad-${taskId}` : `${taskId}`;
      setTasks(prev => prev.map(t => {
        const tKey = t.is_ad ? `ad-${t.id}` : `${t.id}`;
        return tKey === key ? { ...t, is_completed: 1 } : t;
      }));

      // Show reward toast
      showToast(`+${formatTON(result.reward)} TON! 🎉`, 'success');

      // Update user balance
      if (onUserUpdate) {
        onUserUpdate(prev => ({
          ...prev,
          balance: result.balance,
          total_earned: result.total_earned,
          tasks_completed: result.tasks_completed,
        }));
      }
    } catch (err) {
      showToast(err.message || 'Ошибка верификации', 'error');
      throw err;
    }
  };

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const filteredTasks = (filter === 'all'
    ? tasks
    : tasks.filter(t => t.type === filter)
  ).filter(t => !t.is_completed);

  if (loading) return <Loader text="Загрузка заданий..." />;

  return (
    <div className="page tasks-page">
      <div className="section-header">
        <h1 className="section-title">📋 Задания</h1>
        <span className="badge badge-accent">{filteredTasks.length} доступно</span>
      </div>

      {/* Filters */}
      <div className="filter-tabs">
        {filterOptions.map(opt => (
          <button
            key={opt.key}
            className={`filter-tab ${filter === opt.key ? 'active' : ''}`}
            onClick={() => setFilter(opt.key)}
            id={`filter-${opt.key}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Tasks */}
      {filteredTasks.length > 0 ? (
        <div className="tasks-list stagger">
          {filteredTasks.map(task => (
            <TaskCard key={task.is_ad ? `ad-${task.id}` : task.id} task={task} onComplete={handleComplete} penalty={task.type === 'subscribe_channel' ? penalty : 0} subCheckHours={task.type === 'subscribe_channel' ? subCheckHours : 0} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-state-icon">🎯</span>
          <h3 className="empty-state-title">Нет доступных заданий</h3>
          <p className="empty-state-text">Новые задания скоро появятся!</p>
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
