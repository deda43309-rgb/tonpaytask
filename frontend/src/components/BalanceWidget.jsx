import { formatTON } from '../utils/format';
import './BalanceWidget.css';

export default function BalanceWidget({ balance = 0, totalEarned = 0, tasksCompleted = 0 }) {
  return (
    <div className="balance-widget card card-glow" id="balance-widget">
      <div className="balance-top">
        <span className="balance-label">Ваш баланс</span>
        <div className="balance-amount">
          <span className="balance-icon">💎</span>
          <span className="balance-value">{formatTON(balance)}</span>
          <span className="balance-currency">TON</span>
        </div>
      </div>
      <div className="balance-stats">
        <div className="balance-stat">
          <span className="balance-stat-value">{formatTON(totalEarned)}</span>
          <span className="balance-stat-label">Заработано</span>
        </div>
        <div className="balance-stat-divider" />
        <div className="balance-stat">
          <span className="balance-stat-value">{tasksCompleted}</span>
          <span className="balance-stat-label">Заданий</span>
        </div>
      </div>
    </div>
  );
}
