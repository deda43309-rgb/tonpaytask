import { useLocation, useNavigate } from 'react-router-dom';
import { hapticFeedback } from '../utils/telegram';
import './BottomNav.css';

const tabs = [
  { path: '/', icon: '🏠', label: 'Главная' },
  { path: '/tasks', icon: '📋', label: 'Задания' },
  { path: '/referral', icon: '👥', label: 'Друзья' },
  { path: '/profile', icon: '👤', label: 'Профиль' },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleClick = (path) => {
    if (location.pathname !== path) {
      hapticFeedback('light');
      navigate(path);
    }
  };

  // Don't show on admin page
  if (location.pathname.startsWith('/admin')) return null;

  return (
    <nav className="bottom-nav" id="bottom-nav">
      <div className="bottom-nav-inner">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              className={`nav-tab ${isActive ? 'active' : ''}`}
              onClick={() => handleClick(tab.path)}
              id={`nav-${tab.path.replace('/', '') || 'home'}`}
            >
              <span className="nav-tab-icon">{tab.icon}</span>
              <span className="nav-tab-label">{tab.label}</span>
              {isActive && <span className="nav-tab-indicator" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
