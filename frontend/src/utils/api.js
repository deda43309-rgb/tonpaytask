import { getInitData } from './telegram';

const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const initData = getInitData();

  const headers = {
    'Content-Type': 'application/json',
    ...(initData && { 'X-Telegram-Init-Data': initData }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// Auth
export const login = (startParam) =>
  request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ startParam }),
  });

// Tasks
export const getTasks = () => request('/tasks');
export const getTask = (id) => request(`/tasks/${id}`);
export const completeTask = (id) =>
  request(`/tasks/${id}/complete`, { method: 'POST' });

// Users
export const getMe = () => request('/users/me');
export const claimDailyBonus = () =>
  request('/users/daily-bonus', { method: 'POST' });
export const getReferrals = () => request('/users/referrals');
export const getPenalties = () => request('/users/penalties');
export const getCompletions = () => request('/users/completions');

// Admin
export const getAdminStats = () => request('/admin/stats');
export const getAdminTasks = () => request('/admin/tasks');
export const createTask = (data) =>
  request('/admin/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
export const updateTask = (id, data) =>
  request(`/admin/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
export const deleteTask = (id) =>
  request(`/admin/tasks/${id}`, { method: 'DELETE' });
export const getAdminUsers = (page = 1, sort = 'date') =>
  request(`/admin/users?page=${page}&sort=${sort}`);
export const blockUser = (id) =>
  request(`/admin/users/${id}/block`, { method: 'POST' });
export const deleteUser = (id, pin) =>
  request(`/admin/users/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ pin }),
  });
export const getAdminSettings = () => request('/admin/settings');
export const getAdRevenue = () => request('/admin/ad-revenue');
export const updateAdminSettings = (data) =>
  request('/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });

// Ad Tasks (complete from tasks feed)
export const completeAdTask = (id) =>
  request(`/tasks/${id}/complete-ad`, { method: 'POST' });

// Advertiser
export const getAdBalance = () => request('/advertiser/balance');
export const getRewardPrice = () => request('/advertiser/reward-price');
export const adDeposit = (amount) =>
  request('/advertiser/deposit', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
export const resolveAdUrl = (url, type) =>
  request('/advertiser/resolve-url', {
    method: 'POST',
    body: JSON.stringify({ url, type }),
  });
export const getAdTasks = () => request('/advertiser/tasks');
export const getAdStats = () => request('/advertiser/stats');
export const getAdvertiserPenalties = () => request('/advertiser/penalties');
export const createAdTask = (data) =>
  request('/advertiser/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
export const updateAdTask = (id, data) =>
  request(`/advertiser/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
export const deleteAdTask = (id) =>
  request(`/advertiser/tasks/${id}`, { method: 'DELETE' });
export const resetDatabase = (pin, password) =>
  request('/admin/reset', {
    method: 'POST',
    body: JSON.stringify({ pin, password }),
  });
export const checkSubscriptions = () =>
  request('/admin/check-subscriptions', { method: 'POST' });
export const checkUnsubscribed = (channel_id) =>
  request('/users/check-unsubscribed', {
    method: 'POST',
    body: JSON.stringify({ channel_id }),
  });

// Deposits (memo-based)
export const createDeposit = (amount) =>
  request('/advertiser/deposit/create', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
export const checkDeposit = (id) =>
  request(`/advertiser/deposit/check/${id}`, { method: 'POST' });
export const getPendingDeposits = () =>
  request('/advertiser/deposit/pending');

// Main balance deposits
export const createMainDeposit = (amount) =>
  request('/deposit/create', { method: 'POST', body: JSON.stringify({ amount }) });
export const checkMainDeposit = (id) =>
  request(`/deposit/check/${id}`, { method: 'POST' });
export const getDepositHistory = () =>
  request('/deposit/history');

