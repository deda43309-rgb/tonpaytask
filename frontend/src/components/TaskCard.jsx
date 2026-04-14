import { useState } from 'react';
import { hapticFeedback } from '../utils/telegram';
import './TaskCard.css';

const typeLabels = {
  subscribe_channel: { label: 'Подписка', color: 'accent' },
  start_bot: { label: 'Бот', color: 'warning' },
  visit_link: { label: 'Ссылка', color: 'info' },
};

export default function TaskCard({ task, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const [started, setStarted] = useState(false);

  const isCompleted = task.is_completed;
  const typeInfo = typeLabels[task.type] || { label: task.type, color: 'accent' };

  const handleStart = () => {
    hapticFeedback('light');
    setStarted(true);

    // Open the target URL
    if (task.type === 'subscribe_channel' || task.type === 'start_bot') {
      window.open(task.target_url, '_blank');
    } else if (task.type === 'visit_link') {
      window.open(task.target_url, '_blank');
      // Start countdown for visit_link
      let t = 10;
      setTimer(t);
      const interval = setInterval(() => {
        t--;
        setTimer(t);
        if (t <= 0) {
          clearInterval(interval);
        }
      }, 1000);
    }
  };

  const handleVerify = async () => {
    setLoading(true);
    hapticFeedback('medium');
    try {
      await onComplete(task.id, task.is_ad);
      hapticFeedback('success');
    } catch (err) {
      hapticFeedback('error');
    } finally {
      setLoading(false);
    }
  };

  const canVerify = started && (task.type !== 'visit_link' || timer <= 0);

  return (
    <div className={`task-card card ${isCompleted ? 'completed' : ''}`} id={`task-${task.id}`}>
      <div className="task-card-top">
        {task.image_url ? (
          <img src={task.image_url} alt="" className="task-card-avatar" />
        ) : (
          <div className="task-card-icon">{task.icon || '📋'}</div>
        )}
        <div className="task-card-info">
          <h3 className="task-card-title">{task.title}</h3>
          {task.description && (
            <p className="task-card-desc">{task.description}</p>
          )}
          <div className="task-card-meta">
            <span className={`badge badge-${typeInfo.color}`}>{typeInfo.label}</span>
            {task.is_ad ? <span className="badge" style={{ background: 'rgba(245,166,35,0.15)', color: '#f5a623' }}>📢 Реклама</span> : null}
          </div>
        </div>
        <div className="task-card-reward">
          <span className="task-reward-value">+{task.reward}</span>
          <span className="task-reward-label">Points</span>
        </div>
      </div>

      {!isCompleted && (
        <div className="task-card-actions">
          {!started ? (
            <button className="btn btn-primary btn-block btn-sm" onClick={handleStart}>
              {task.type === 'subscribe_channel' && '🔔 Подписаться'}
              {task.type === 'start_bot' && '🤖 Запустить бота'}
              {task.type === 'visit_link' && '🔗 Перейти'}
            </button>
          ) : (
            <button
              className="btn btn-success btn-block btn-sm"
              onClick={handleVerify}
              disabled={!canVerify || loading}
            >
              {loading ? '⏳ Проверка...' : timer > 0 ? `⏱ ${timer} сек...` : '✅ Проверить'}
            </button>
          )}
        </div>
      )}

      {isCompleted && (
        <div className="task-card-done">
          <span className="badge badge-success">✅ Выполнено</span>
        </div>
      )}
    </div>
  );
}
