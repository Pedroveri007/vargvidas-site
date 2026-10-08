const API_URL = location.protocol === 'file:'
  ? 'http://localhost:3000/api'
  : ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && location.port !== '3000'
    ? `${location.protocol}//${location.hostname}:3000/api`
    : '/api';

function mediaUrl(path) {
  if (!path || /^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith('data:')) return path || '';
  return `${API_URL.replace(/\/api$/, '')}/${path.replace(/^\/+/, '')}`;
}

function toast(message) {
  let element = document.querySelector('.toast');
  if (!element) {
    element = document.createElement('div');
    element.className = 'toast';
    document.body.appendChild(element);
  }
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(element._timer);
  element._timer = setTimeout(() => element.classList.remove('show'), 3200);
}

function fmtDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR');
}

function statusLabel(status) {
  return { pending: 'Em triagem', active: 'Busca ativa', found: 'Encontrado(a)', archived: 'Arquivado', deleted: 'Oculto (excluído)' }[status] || status;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function toggleMenu() {
  const menu = document.querySelector('nav.main-nav');
  const button = document.querySelector('.hamburger');
  if (!menu || !button) return;

  const isOpen = menu.classList.toggle('open');
  button.setAttribute('aria-expanded', String(isOpen));
  button.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
  button.textContent = isOpen ? '×' : '☰';
}

function markActiveNav() {
  const currentPath = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav.main-nav a').forEach(link => {
    if (link.getAttribute('href') === currentPath) link.classList.add('active');
  });
}

document.addEventListener('DOMContentLoaded', markActiveNav);

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('varg_token');
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(API_URL + path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.');
  return body;
}

const DB = {
  getCases: filters => apiRequest(`/cases?${new URLSearchParams(filters)}`),
  getCaseById: id => apiRequest(`/cases/${encodeURIComponent(id)}`),
  getMyCases: () => apiRequest('/me/cases'),
  getNotifications: () => apiRequest('/me/notifications'),
  getMySightings: () => apiRequest('/me/sightings'),
  getUpdatesForCase: id => apiRequest(`/cases/${encodeURIComponent(id)}/history`),
  addCase: data => apiRequest('/cases', { method: 'POST', body: JSON.stringify(data) }),
  updateCase: (id, data) => apiRequest(`/me/cases/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  uploadCasePhoto: file => {
    const formData = new FormData();
    formData.append('photo', file);
    return apiRequest('/uploads/case-photo', { method: 'POST', body: formData });
  },
  addSighting: data => apiRequest('/sightings', { method: 'POST', body: JSON.stringify(data) }),
  addContactMessage: data => apiRequest('/contact', { method: 'POST', body: JSON.stringify(data) }),
  getStates: () => apiRequest('/states'),
  getCities: state => apiRequest(`/cities${state ? `?state=${encodeURIComponent(state)}` : ''}`),
  getSecuritySettings: () => apiRequest('/me/security'),
  enableEmailTwoFactor: senha => apiRequest('/me/security/enable-email-code', { method: 'POST', body: JSON.stringify({ senha }) }),
  confirmEmailTwoFactor: (setupToken, code) => apiRequest('/me/security/confirm-email-code', { method: 'POST', body: JSON.stringify({ setupToken, code }) }),
  disableEmailTwoFactor: senha => apiRequest('/me/security/disable-email-code', { method: 'POST', body: JSON.stringify({ senha }) }),
  resendEmailCode: challengeToken => apiRequest('/auth/login/resend-email-code', { method: 'POST', body: JSON.stringify({ challengeToken }) }),
  stats: () => apiRequest('/stats'),
  adminCases: filters => apiRequest(`/admin/cases?${new URLSearchParams(filters || {})}`),
  adminCaseById: id => apiRequest(`/admin/cases/${encodeURIComponent(id)}`),
  adminSightings: () => apiRequest('/admin/sightings'),
  adminDenuncias: () => apiRequest('/admin/denuncias'),
  adminMessages: () => apiRequest('/admin/messages'),
  adminUsers: () => apiRequest('/admin/users'),
  sendUserNotice: (id, message) => apiRequest(`/admin/users/${encodeURIComponent(id)}/notices`, { method: 'POST', body: JSON.stringify({ message }) }),
  deleteUser: id => apiRequest(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  adminFoundRequests: () => apiRequest('/admin/found-requests'),
  approveFoundRequest: id => apiRequest(`/admin/found-requests/${encodeURIComponent(id)}/approve`, { method: 'PUT' }),
  rejectFoundRequest: id => apiRequest(`/admin/found-requests/${encodeURIComponent(id)}/reject`, { method: 'PUT' }),
  approveCase: id => apiRequest(`/admin/cases/${encodeURIComponent(id)}/approve`, { method: 'PUT' }),
  rejectCase: (id, reason) => apiRequest(`/admin/cases/${encodeURIComponent(id)}/reject`, { method: 'PUT', body: JSON.stringify({ reason }) }),
  archiveCase: id => apiRequest(`/admin/cases/${encodeURIComponent(id)}/archive`, { method: 'PUT' }),
  markCaseFound: id => apiRequest(`/admin/cases/${encodeURIComponent(id)}/found`, { method: 'PUT' }),
  deleteCase: id => apiRequest(`/admin/cases/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  requestFound: id => apiRequest(`/cases/${encodeURIComponent(id)}/found-request`, { method: 'POST' }),
  async login(email, senha) {
    const result = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
    if (result.token) {
      localStorage.setItem('varg_token', result.token);
      localStorage.setItem('varg_session', JSON.stringify(result.user));
    }
    return result;
  },
  async verifyLoginEmailCode(challengeToken, code) {
    const result = await apiRequest('/auth/login/verify-email-code', { method: 'POST', body: JSON.stringify({ challengeToken, code }) });
    localStorage.setItem('varg_token', result.token);
    localStorage.setItem('varg_session', JSON.stringify(result.user));
    return result.user;
  },
  async register(data) {
    const result = await apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(data) });
    localStorage.setItem('varg_token', result.token);
    localStorage.setItem('varg_session', JSON.stringify(result.user));
    return result.user;
  },
  logout() {
    localStorage.removeItem('varg_token');
    localStorage.removeItem('varg_session');
  },
  getSession() {
    try { return JSON.parse(localStorage.getItem('varg_session')); }
    catch (_) { return null; }
  }
};
