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
export const getAdminUsers = (page = 1) =>
  request(`/admin/users?page=${page}`);
