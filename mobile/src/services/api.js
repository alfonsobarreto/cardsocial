import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Auth ──────────────────────────────────────────────────────────────────────
export const register = (name, email, password) =>
  api.post('/auth/register', { name, email, password });

export const login = (email, password) =>
  api.post('/auth/login', { email, password });

export const getMe = () => api.get('/auth/me');

// ── Cards ─────────────────────────────────────────────────────────────────────
export const getMyCards = () => api.get('/cards');
export const createCard = (data) => api.post('/cards', data);
export const updateCard = (id, data) => api.put(`/cards/${id}`, data);
export const deleteCard = (id) => api.delete(`/cards/${id}`);
export const getPublicCard = (slug) => api.get(`/cards/public/${slug}`);
export const incrementShare = (slug) => api.post(`/cards/public/${slug}/share`);

// ── Vault ─────────────────────────────────────────────────────────────────────
export const getVaultItems = () => api.get('/vault');
export const getVaultItemData = (id) => api.get(`/vault/${id}/data`);
export const createVaultItem = (label, category, data) =>
  api.post('/vault', { label, category, data });
export const updateVaultItem = (id, data) => api.put(`/vault/${id}`, data);
export const deleteVaultItem = (id) => api.delete(`/vault/${id}`);

// ── Contacts ──────────────────────────────────────────────────────────────────
export const getContacts = () => api.get('/contacts');
export const addContact = (cardId, notes, tags) =>
  api.post('/contacts', { cardId, notes, tags });
export const updateContact = (id, notes, tags) =>
  api.put(`/contacts/${id}`, { notes, tags });
export const deleteContact = (id) => api.delete(`/contacts/${id}`);

// ── Reports ───────────────────────────────────────────────────────────────────
export const reportCard = (cardId, reason) =>
  api.post('/reports', { cardId, reason });

// ── Admin ─────────────────────────────────────────────────────────────────────
export const getAdminStats = () => api.get('/admin/stats');
export const listAdminUsers = (page = 1) => api.get(`/admin/users?page=${page}`);
export const updateAdminUser = (id, data) => api.put(`/admin/users/${id}`, data);
export const getPendingCards = () => api.get('/admin/cards/pending');
export const moderateCard = (id, status, note) =>
  api.put(`/admin/cards/${id}/moderate`, { status, note });
export const getAdminReports = () => api.get('/admin/reports');
export const updateAdminReport = (id, data) => api.put(`/admin/reports/${id}`, data);

export default api;
