import './Loader.css';

export default function Loader({ text = 'Загрузка...' }) {
  return (
    <div className="loader-container">
      <div className="loader-spinner">
        <div className="loader-ring"></div>
        <div className="loader-ring"></div>
        <div className="loader-icon">💎</div>
      </div>
      <p className="loader-text">{text}</p>
    </div>
  );
}
