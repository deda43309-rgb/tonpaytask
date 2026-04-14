const tg = window.Telegram?.WebApp;

export function getTelegram() {
  return tg;
}

export function getTelegramUser() {
  return tg?.initDataUnsafe?.user || null;
}

export function getInitData() {
  return tg?.initData || '';
}

export function getStartParam() {
  return tg?.initDataUnsafe?.start_param || '';
}

export function expandApp() {
  tg?.expand();
}

export function hapticFeedback(type = 'light') {
  try {
    if (type === 'light') {
      tg?.HapticFeedback?.impactOccurred('light');
    } else if (type === 'medium') {
      tg?.HapticFeedback?.impactOccurred('medium');
    } else if (type === 'heavy') {
      tg?.HapticFeedback?.impactOccurred('heavy');
    } else if (type === 'success') {
      tg?.HapticFeedback?.notificationOccurred('success');
    } else if (type === 'error') {
      tg?.HapticFeedback?.notificationOccurred('error');
    }
  } catch (e) {
    // Haptic not available
  }
}

export function showAlert(message) {
  tg?.showAlert(message);
}

export function openTelegramLink(url) {
  tg?.openTelegramLink(url);
}

export function openLink(url) {
  tg?.openLink(url);
}

export function closeMiniApp() {
  tg?.close();
}

export function isInTelegram() {
  return !!tg?.initData;
}

export function setHeaderColor(color) {
  try {
    tg?.setHeaderColor(color);
  } catch (e) {}
}

export function setBackgroundColor(color) {
  try {
    tg?.setBackgroundColor(color);
  } catch (e) {}
}
