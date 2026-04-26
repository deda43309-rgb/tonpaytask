import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hapticFeedback } from '../utils/telegram';
import { formatTON } from '../utils/format';
import * as api from '../utils/api';
import './DepositPage.css';

const AMOUNTS = [1, 5, 10, 50, 100, 500];

export default function DepositPage({ user, onUserUpdate }) {
  const navigate = useNavigate();
  const [step, setStep] = useState('amount');
  const [amount, setAmount] = useState('');
  const [deposit, setDeposit] = useState(null);
  const [wallet, setWallet] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [copied, setCopied] = useState('');
  const [history, setHistory] = useState([]);
  const [minDeposit, setMinDeposit] = useState(0.1);

  // Check for existing pending deposit on mount
  useEffect(() => {
    api.getDepositHistory().then(res => {
      setHistory(res.deposits || []);
      setWallet(res.wallet || '');
      if (res.min_deposit) setMinDeposit(res.min_deposit);
      const pending = res.deposits?.find(d => d.status === 'pending' && new Date(d.expires_at) > new Date());
      if (pending) {
        setDeposit(pending);
        setAmount(pending.amount);
        setStep('pending');
      }
    }).catch(() => {});
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!deposit || step !== 'pending') return;
    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((new Date(deposit.expires_at) - new Date()) / 1000));
      setTimeLeft(diff);
      if (diff <= 0) { setStep('amount'); setDeposit(null); }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [deposit, step]);

  const handleCreate = async () => {
    const a = parseFloat(amount);
    if (!a || a <= 0) { setError('Введите сумму'); return; }
    if (a < minDeposit) { setError(`Минимальный депозит: ${minDeposit} TON`); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.createMainDeposit(a);
      setDeposit(res.deposit);
      setWallet(res.wallet);
      setStep('pending');
      hapticFeedback('success');
    } catch (err) {
      setError(err.message);
      hapticFeedback('error');
    } finally {
      setLoading(false);
    }
  };

  const handleCheck = async () => {
    if (!deposit || checking) return;
    setChecking(true);
    setError('');
    hapticFeedback('medium');
    try {
      const res = await api.checkMainDeposit(deposit.id);
      if (res.status === 'confirmed') {
        setStep('confirmed');
        hapticFeedback('success');
        if (onUserUpdate && res.balance !== undefined) {
          onUserUpdate({ ...user, balance: res.balance });
        }
      } else if (res.status === 'expired') {
        setError('Время истекло. Создайте новый депозит.');
        setStep('amount');
        setDeposit(null);
        hapticFeedback('error');
      } else {
        setError('Перевод не найден. Убедитесь что отправили TON с правильным мемо.');
        hapticFeedback('warning');
      }
    } catch (err) {
      setError(err.message);
      hapticFeedback('error');
    } finally {
      setChecking(false);
    }
  };

  const copyText = (text, label) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(label);
    hapticFeedback('light');
    setTimeout(() => setCopied(''), 2000);
  };

  const fmtTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const statusBadge = (s) => {
    switch (s) {
      case 'pending': return { text: '⏳ Ожидание', color: '#ff9500' };
      case 'confirmed': return { text: '✅ Подтверждён', color: '#34c759' };
      case 'expired': return { text: '⏰ Истёк', color: '#ff3b30' };
      default: return { text: s, color: 'var(--text-muted)' };
    }
  };

  return (
    <div className="page deposit-page">
      <button className="deposit-back" onClick={() => { hapticFeedback('light'); navigate('/'); }}>
        ← Назад
      </button>

      <div className="section-header">
        <h1 className="section-title">💎 Пополнение баланса</h1>
        <p className="deposit-subtitle">Пополните баланс через перевод TON</p>
      </div>

      {/* Current Balance */}
      <div className="card deposit-balance-card animate-slide">
        <div className="deposit-balance-label">Текущий баланс</div>
        <div className="deposit-balance-value">{formatTON(user?.balance || 0)} TON</div>
      </div>

      {/* Step 1: Amount */}
      {step === 'amount' && (
        <div className="card mt-16 animate-slide" style={{ padding: 20, animationDelay: '80ms' }}>
          <h3 className="deposit-step-title">Шаг 1: Выберите сумму</h3>

          <div className="deposit-amounts">
            {AMOUNTS.filter(a => a >= minDeposit).map(a => (
              <button
                key={a}
                className={`deposit-amount-btn ${parseFloat(amount) === a ? 'active' : ''}`}
                onClick={() => { setAmount(String(a)); hapticFeedback('light'); }}
              >
                {a} TON
              </button>
            ))}
          </div>

          <input
            className="input deposit-input"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder={`Минимум ${minDeposit} TON`}
          />

          {error && <div className="deposit-error">⚠️ {error}</div>}

          <button
            className="btn btn-primary deposit-next-btn"
            onClick={handleCreate}
            disabled={loading || !amount}
          >
            {loading ? '⏳ Создание...' : '→ Получить реквизиты'}
          </button>
        </div>
      )}

      {/* Step 2: Pending */}
      {step === 'pending' && deposit && (
        <div className="card mt-16 animate-slide" style={{ padding: 20, animationDelay: '80ms' }}>
          <h3 className="deposit-step-title">Шаг 2: Отправьте TON</h3>
          <p className="deposit-hint">Переведите точную сумму с указанным мемо</p>

          {/* Amount display */}
          <div className="deposit-info-block deposit-amount-display">
            <div className="deposit-info-label">Сумма перевода</div>
            <div className="deposit-info-value-big">{formatTON(deposit.amount)} TON</div>
          </div>

          {/* Memo */}
          <div className="deposit-memo-block" onClick={() => copyText(deposit.memo, 'memo')}>
            <div className="deposit-memo-label">⚠️ ОБЯЗАТЕЛЬНЫЙ МЕМО (Comment)</div>
            <div className="deposit-memo-value">{deposit.memo}</div>
            <div className="deposit-copy-hint">
              {copied === 'memo' ? '✅ Скопировано!' : '👆 Нажмите чтобы скопировать'}
            </div>
          </div>

          {/* Wallet */}
          {wallet && (
            <div className="deposit-wallet-block" onClick={() => copyText(wallet, 'wallet')}>
              <div className="deposit-info-label">Кошелёк для перевода</div>
              <div className="deposit-wallet-value">{wallet}</div>
              <div className="deposit-copy-hint">
                {copied === 'wallet' ? '✅ Скопировано!' : '👆 Нажмите чтобы скопировать'}
              </div>
            </div>
          )}

          {/* Timer */}
          <div className={`deposit-timer ${timeLeft < 300 ? 'danger' : ''}`}>
            ⏰ Осталось: {fmtTime(timeLeft)}
          </div>

          {error && <div className="deposit-error">{error}</div>}

          {/* Check button */}
          <button
            className="btn deposit-check-btn"
            onClick={handleCheck}
            disabled={checking}
          >
            {checking ? '🔍 Проверяю...' : '✅ Я отправил — Проверить'}
          </button>

          <div className="deposit-auto-note">
            💡 Перевод также проверяется автоматически каждые 5 мин.
            <br />Мемо должен быть указан <b>точно</b> как показано выше.
          </div>
        </div>
      )}

      {/* Step 3: Confirmed */}
      {step === 'confirmed' && (
        <div className="card mt-16 animate-slide" style={{ padding: 30, textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
          <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Депозит подтверждён!</h3>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#34c759' }}>
            +{formatTON(deposit?.amount || 0)} TON
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>
            Баланс успешно пополнен
          </p>
          <button className="btn btn-primary mt-16" onClick={() => navigate('/')}>
            ← На главную
          </button>
        </div>
      )}

      {/* History */}
      {history.length > 0 && step === 'amount' && (
        <div className="card mt-16 animate-slide" style={{ padding: 0, animationDelay: '160ms' }}>
          <div className="deposit-history-header">📋 История депозитов</div>
          {history.slice(0, 8).map((d) => {
            const s = statusBadge(d.status);
            return (
              <div key={d.id} className="deposit-history-item">
                <div className="deposit-history-left">
                  <div className="deposit-history-amount">{formatTON(d.amount)} TON</div>
                  <div className="deposit-history-date">
                    {new Date(d.created_at).toLocaleDateString('ru-RU')} · {d.memo}
                  </div>
                </div>
                <div className="deposit-history-status" style={{ color: s.color }}>
                  {s.text}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
