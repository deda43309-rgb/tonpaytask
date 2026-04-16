import { formatTON } from '../utils/format';
import './TopBar.css';

export default function TopBar({ user }) {
  if (!user) return null;

  const karma = user.karma ?? 50;
  const karmaColor = karma >= 40 ? '#34c759' : karma >= 25 ? '#ff9500' : karma >= 10 ? '#ff6b00' : '#ff3b30';

  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="topbar-logo">💎</span>
        <span className="topbar-name">TonPayTask</span>
      </div>
      <div className="topbar-right">
        <div className="topbar-item">
          <span className="topbar-item-icon">☯️</span>
          <span className="topbar-item-value" style={{ color: karmaColor }}>{karma}</span>
        </div>
        <div className="topbar-sep" />
        <div className="topbar-item topbar-balance">
          <span className="topbar-item-icon">💰</span>
          <span className="topbar-item-value">{formatTON(user.balance || 0)}</span>
          <span className="topbar-item-unit">TON</span>
        </div>
      </div>
    </div>
  );
}
