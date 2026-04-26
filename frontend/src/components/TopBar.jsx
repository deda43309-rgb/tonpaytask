import { formatTON } from '../utils/format';
import './TopBar.css';

export default function TopBar({ user }) {
  if (!user) return null;

  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="topbar-logo">💎</span>
        <span className="topbar-name">TonPayTask</span>
      </div>
      <div className="topbar-right">
        <div className="topbar-item topbar-balance">
          <span className="topbar-item-icon">💰</span>
          <span className="topbar-item-value">{formatTON(user.balance || 0)}</span>
          <span className="topbar-item-unit">TON</span>
        </div>
      </div>
    </div>
  );
}
