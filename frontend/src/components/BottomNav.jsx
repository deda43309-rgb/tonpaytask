import { useLocation, useNavigate } from 'react-router-dom';
import { hapticFeedback } from '../utils/telegram';
import './BottomNav.css';

const allTabs = [
  { path: '/', icon: '🏠', label: 'Главная', module: null },
  { path: '/tasks', icon: '📋', label: 'Задания', module: 'tasks' },
  { path: '/advertiser', icon: '📢', label: 'Реклама', module: 'advertiser' },
  { path: '/referral', icon: '👥', label: 'Друзья', module: 'referral' },
];

export default function BottomNav({ modules = {} }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleClick = (path) => {
    if (location.pathname !== path) {
      hapticFeedback('light');
      navigate(path);
    }
  };

  const hiddenPaths = ['/admin'];
  if (hiddenPaths.some(p => location.pathname.startsWith(p))) return null;

  const tabs = allTabs.filter(t => !t.module || modules[t.module] !== false);

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
