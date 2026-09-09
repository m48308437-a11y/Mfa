/* ===========================================
   MIFA Next-Gen - Shared JavaScript
   =========================================== */

// API Client
const API_BASE = '/api';

const api = {
  getToken() { return localStorage.getItem('mifa_token'); },
  setToken(token) { localStorage.setItem('mifa_token', token); },
  removeToken() { 
    localStorage.removeItem('mifa_token');
    localStorage.removeItem('mifa_user');
  },
  getUser() {
    try {
      const user = localStorage.getItem('mifa_user');
      return user ? JSON.parse(user) : null;
    } catch { return null; }
  },
  setUser(user) { localStorage.setItem('mifa_user', JSON.stringify(user)); },
  isLoggedIn() { return !!this.getToken(); },
  isAdmin() { const user = this.getUser(); return user && user.role === 'admin'; },

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const response = await fetch(url, { ...options, headers });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          this.removeToken();
          window.location.reload();
        }
        throw new Error(data.error || 'خطا در درخواست');
      }
      return data;
    } catch (error) {
      if (error.name === 'TypeError') throw new Error('خطا در اتصال به سرور');
      throw error;
    }
  },

  async login(username, password) {
    const data = await this.request('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  },

  async register(username, password) {
    const data = await this.request('/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  },

  async logout() {
    try { await this.request('/logout', { method: 'POST' }); } catch {}
    this.removeToken();
  },

  async getMe() { return this.request('/me'); },
  async getAnime(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== '' && val !== null && val !== undefined) query.append(key, val);
    });
    const qs = query.toString();
    return this.request(`/anime${qs ? '?' + qs : ''}`);
  },
  async getAnimeDetail(id) { return this.request(`/anime/${id}`); },
  async createAnime(data) { return this.request('/anime', { method: 'POST', body: JSON.stringify(data) }); },
  async updateAnime(id, data) { return this.request(`/anime/${id}`, { method: 'PUT', body: JSON.stringify(data) }); },
  async deleteAnime(id) { return this.request(`/anime/${id}`, { method: 'DELETE' }); },
  async getComments(animeId) { return this.request(`/anime/${animeId}/comments`); },
  async createComment(animeId, text) { return this.request(`/anime/${animeId}/comments`, { method: 'POST', body: JSON.stringify({ text }) }); },
  async getAdminStats() { return this.request('/admin/stats'); },
  async getAdminUsers() { return this.request('/admin/users'); },
  async updateUserRole(userId, role) { return this.request(`/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }); },
  async getPendingComments() { return this.request('/comments/pending'); },
  async updateCommentStatus(commentId, status) { return this.request(`/comments/${commentId}`, { method: 'PATCH', body: JSON.stringify({ status }) }); }
};

// Toast Notifications
const Toast = {
  show(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container') || this.createContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  createContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
    return container;
  }
};

// Auth Manager
const AuthManager = {
  updateUI() {
    const authBtn = document.getElementById('auth-btn');
    const userMenu = document.getElementById('user-menu');
    if (!authBtn || !userMenu) return;

    if (api.isLoggedIn()) {
      const user = api.getUser();
      authBtn.classList.add('hidden');
      userMenu.classList.remove('hidden');
      const avatar = userMenu.querySelector('.header__user-avatar');
      const name = userMenu.querySelector('.header__user-name');
      if (avatar) avatar.textContent = (user.username || '?')[0].toUpperCase();
      if (name) name.textContent = user.username;
    } else {
      authBtn.classList.remove('hidden');
      userMenu.classList.add('hidden');
    }
  },

  showModal(tab = 'login') {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.classList.add('active');
    this.switchTab(tab);
    document.body.style.overflow = 'hidden';
  },

  hideModal() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
  },

  switchTab(tab) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(t => t.classList.remove('active'));
    if (tab === 'login') {
      loginForm?.classList.remove('hidden');
      registerForm?.classList.add('hidden');
      tabs[0]?.classList.add('active');
    } else {
      loginForm?.classList.add('hidden');
      registerForm?.classList.remove('hidden');
      tabs[1]?.classList.add('active');
    }
  },

  async handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    const errorEl = document.getElementById('login-error');

    if (!username || !password) {
      if (errorEl) errorEl.textContent = 'نام کاربری و رمز عبور را وارد کنید';
      return;
    }

    try {
      if (errorEl) errorEl.textContent = 'در حال ورود...';
      await api.login(username, password);
      this.hideModal();
      this.updateUI();
      Toast.show('ورود موفقیت‌آمیز بود! 🎉', 'success');
    } catch (error) {
      if (errorEl) errorEl.textContent = error.message;
    }
  },

  async handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('register-username')?.value.trim();
    const password = document.getElementById('register-password')?.value;
    const errorEl = document.getElementById('register-error');

    if (!username || username.length < 3) {
      if (errorEl) errorEl.textContent = 'نام کاربری باید حداقل ۳ کاراکتر باشد';
      return;
    }
    if (!password || password.length < 6) {
      if (errorEl) errorEl.textContent = 'رمز عبور باید حداقل ۶ کاراکتر باشد';
      return;
    }

    try {
      if (errorEl) errorEl.textContent = 'در حال ثبت‌نام...';
      await api.register(username, password);
      this.hideModal();
      this.updateUI();
      Toast.show('ثبت‌نام موفقیت‌آمیز بود! 🎉', 'success');
    } catch (error) {
      if (errorEl) errorEl.textContent = error.message;
    }
  },

  async handleLogout() {
    await api.logout();
    this.updateUI();
    Toast.show('با موفقیت خارج شدید', 'success');
    window.location.href = '/';
  },

  init() {
    this.updateUI();
    document.getElementById('auth-btn')?.addEventListener('click', () => this.showModal('login'));
    document.querySelector('.modal__close')?.addEventListener('click', () => this.hideModal());
    document.getElementById('auth-modal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.hideModal();
    });
    document.querySelectorAll('.auth-tab').forEach((tab, i) => {
      tab.addEventListener('click', () => this.switchTab(i === 0 ? 'login' : 'register'));
    });
    document.getElementById('login-form')?.addEventListener('submit', (e) => this.handleLogin(e));
    document.getElementById('register-form')?.addEventListener('submit', (e) => this.handleRegister(e));
    document.getElementById('logout-btn')?.addEventListener('click', () => this.handleLogout());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.hideModal(); });
  }
};

// Format Utilities
const Format = {
  score(score) { return Number(score || 0).toFixed(1); },
  year(year) { return year || '—'; },
  date(dateStr) {
    if (!dateStr) return '—';
    try { return new Date(dateStr).toLocaleDateString('fa-IR'); }
    catch { return dateStr; }
  }
};

// Anime Card Component
const Components = {
  animeCard(anime) {
    const genres = (anime.genres || '').split(',').filter(Boolean).slice(0, 3);
    const genreTags = genres.map(g => `<span class="anime-card__genre">${g}</span>`).join('');

    return `
      <a href="/anime-detail.html?id=${anime.id}" class="anime-card">
        <div class="anime-card__poster">
          <img src="${anime.poster || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 200 300\'%3E%3Crect fill=\'%23151515\' width=\'200\' height=\'300\'/%3E%3C/svg%3E'}" alt="${anime.title}" loading="lazy">
          ${anime.score ? `<span class="anime-card__score">★ ${Format.score(anime.score)}</span>` : ''}
          ${anime.status ? `<span class="anime-card__status">${anime.status}</span>` : ''}
        </div>
        <div class="anime-card__info">
          <h3 class="anime-card__title">${anime.title}</h3>
          <div class="anime-card__meta">
            <span>${Format.year(anime.year)}</span>
            <span>•</span>
            <span>${anime.studio || '—'}</span>
          </div>
          <div class="anime-card__genres">${genreTags}</div>
        </div>
      </a>
    `;
  },

  animeGrid(animeList, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!animeList || animeList.length === 0) {
      container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state__icon">🎬</div><h3 class="empty-state__title">انیمه‌ای پیدا نشد</h3></div>`;
      return;
    }
    container.innerHTML = animeList.map(a => this.animeCard(a)).join('');
  }
};

// Make globally available
window.api = api;
window.Toast = Toast;
window.AuthManager = AuthManager;
window.Format = Format;
window.Components = Components;
