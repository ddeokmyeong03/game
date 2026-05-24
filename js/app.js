/* ============================================================
   GamePortal - Core Library  (js/app.js)
   ============================================================ */

// ──────────────────────────────────────────────
//  Path helper
// ──────────────────────────────────────────────
function basePath() {
  return window.location.pathname.includes('/games/') ? '../' : './';
}

// ──────────────────────────────────────────────
//  GameDB  –  localStorage + .db file
// ──────────────────────────────────────────────
const GameDB = {

  /* ---------- init ---------- */
  async init() {
    // 1순위: users.db.js 에 내장된 데이터 (file:// 환경에서도 동작)
    if (window.USERS_DB && !localStorage.getItem('gp_db_loaded')) {
      const existing = this._getUsers();
      const merged = [...existing];
      (window.USERS_DB.users || []).forEach(u => {
        if (!merged.find(e => e.username === u.username)) {
          merged.push({ username: u.username, password: u.password, role: u.role || 'user' });
        }
      });
      this._setUsers(merged);
      localStorage.setItem('gp_db_loaded', '1');
    }

    // 2순위: HTTP 서버 환경에서 users.db fetch 시도
    if (!localStorage.getItem('gp_db_loaded')) {
      try {
        const res = await fetch(basePath() + 'data/users.db');
        if (res.ok) {
          const data = await res.json();
          const existing = this._getUsers();
          const merged = [...existing];
          (data.users || []).forEach(u => {
            if (!merged.find(e => e.username === u.username)) {
              merged.push({ username: u.username, password: u.password, role: u.role || 'user' });
            }
          });
          this._setUsers(merged);
          localStorage.setItem('gp_db_loaded', '1');
        }
      } catch (_) { /* fetch 실패 — 무시 */ }
    }

    // 계정이 하나도 없으면 기본 admin 생성
    const users = this._getUsers();
    if (users.length === 0) {
      this._setUsers([{ username: 'admin', password: 'admin', role: 'admin' }]);
    }
  },

  /* ---------- users ---------- */
  _getUsers() { return JSON.parse(localStorage.getItem('gp_users') || '[]'); },
  _setUsers(u) { localStorage.setItem('gp_users', JSON.stringify(u)); },

  getUsers() { return this._getUsers(); },

  getUser(username) {
    return this._getUsers().find(u => u.username === username) || null;
  },

  validateUser(username, password) {
    const u = this.getUser(username);
    return u && u.password === password;
  },

  addUser(username, password) {
    const users = this._getUsers();
    if (users.find(u => u.username === username)) return false;
    users.push({ username, password, role: 'user', created: new Date().toISOString() });
    this._setUsers(users);
    return true;
  },

  removeUser(username) {
    const users = this._getUsers().filter(u => u.username !== username);
    this._setUsers(users);
  },

  /* ---------- scores ---------- */
  _getScores() { return JSON.parse(localStorage.getItem('gp_scores') || '[]'); },

  addScore(username, game, score) {
    const scores = this._getScores();
    scores.push({ username, game, score, date: new Date().toISOString() });
    localStorage.setItem('gp_scores', JSON.stringify(scores));
  },

  getTopScores(game, limit = 10) {
    const raw = this._getScores().filter(s => s.game === game);
    const best = {};
    raw.forEach(s => {
      if (best[s.username] === undefined || best[s.username] < s.score) {
        best[s.username] = s.score;
      }
    });
    return Object.entries(best)
      .map(([username, score]) => ({ username, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  },

  getUserBest(username, game) {
    const scores = this._getScores()
      .filter(s => s.game === game && s.username === username)
      .map(s => s.score);
    return scores.length ? Math.max(...scores) : 0;
  },

  getAllGamesBest(username) {
    const games = ['tetris', 'snake', 'breakout', 'memory'];
    const out = {};
    games.forEach(g => { out[g] = this.getUserBest(username, g); });
    return out;
  },

  getTotalScorers() {
    return new Set(this._getScores().map(s => s.username)).size;
  },

  /* ---------- export / import .db ---------- */
  exportDB() {
    const users = this._getUsers();
    const blob = new Blob(
      [JSON.stringify({ users }, null, 2)],
      { type: 'text/plain' }
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'users.db';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  },

  importDB(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          if (!Array.isArray(data.users)) throw new Error('Invalid format');
          const existing = this._getUsers();
          const merged = [...existing];
          let added = 0;
          data.users.forEach(u => {
            if (!merged.find(e => e.username === u.username)) {
              merged.push({ username: u.username, password: u.password, role: u.role || 'user' });
              added++;
            }
          });
          this._setUsers(merged);
          resolve(added);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('Read error'));
      reader.readAsText(file);
    });
  }
};

// ──────────────────────────────────────────────
//  Auth
// ──────────────────────────────────────────────
const Auth = {
  login(username, password) {
    if (GameDB.validateUser(username, password)) {
      sessionStorage.setItem('gp_session', JSON.stringify({ username, loginTime: Date.now() }));
      return true;
    }
    return false;
  },

  logout() {
    sessionStorage.removeItem('gp_session');
    window.location.href = basePath() + 'index.html';
  },

  getSession() {
    const s = sessionStorage.getItem('gp_session');
    return s ? JSON.parse(s) : null;
  },

  requireAuth() {
    const s = this.getSession();
    if (!s) { window.location.href = basePath() + 'index.html'; return null; }
    return s;
  },

  isAdmin() {
    const s = this.getSession();
    if (!s) return false;
    const u = GameDB.getUser(s.username);
    return u && u.role === 'admin';
  }
};

// ──────────────────────────────────────────────
//  UI helpers
// ──────────────────────────────────────────────
function showAlert(container, msg, type = 'error') {
  const existing = container.querySelector('.alert');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.className = `alert alert-${type}`;
  div.textContent = msg;
  container.prepend(div);
  setTimeout(() => div.remove(), 4000);
}

function formatScore(n) {
  return Number(n).toLocaleString();
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ──────────────────────────────────────────────
//  Navbar builder (used by dashboard / leaderboard)
// ──────────────────────────────────────────────
function buildNavbar(activePage) {
  const session = Auth.getSession();
  const nav = document.getElementById('navbar');
  if (!nav || !session) return;

  nav.innerHTML = `
    <a href="${basePath()}dashboard.html" class="navbar-brand">GAME<span>HUB</span></a>
    <ul class="navbar-nav">
      <li><a href="${basePath()}dashboard.html" ${activePage === 'dashboard' ? 'class="active"' : ''}>대시보드</a></li>
      <li><a href="${basePath()}leaderboard.html" ${activePage === 'leaderboard' ? 'class="active"' : ''}>순위</a></li>
      ${Auth.isAdmin() ? `<li><a href="${basePath()}admin.html" ${activePage === 'admin' ? 'class="active"' : ''}>관리</a></li>` : ''}
    </ul>
    <div class="navbar-right">
      <span class="user-badge">&#9650; ${session.username}</span>
      <button class="btn btn-ghost btn-sm" onclick="Auth.logout()">로그아웃</button>
    </div>
  `;
}

// ──────────────────────────────────────────────
//  Game names
// ──────────────────────────────────────────────
const GAME_NAMES = {
  tetris:   '테트리스',
  snake:    '스네이크',
  breakout: '브레이크아웃',
  memory:   '메모리 매치'
};
