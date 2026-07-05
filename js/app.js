/* ============================================================
   GamePortal - Core Library  (js/app.js)
   v1.2  2026-06-06  본명·승인 시스템 추가, users.db 제거
   ============================================================ */

// ──────────────────────────────────────────────
//  Path helper
//  사용: 전 페이지 — file:// 환경 상대 경로 계산
// ──────────────────────────────────────────────
function basePath() {
  return window.location.pathname.includes('/games/') ? '../' : './';
}

// ──────────────────────────────────────────────
//  GameDB  –  localStorage (+ data/db.js 백업 연동)
//  사용: 전 페이지 — 사용자 계정·점수 관리
//        data/db.js 백업은 localStorage 가 비어있을 때만 로드됨
// ──────────────────────────────────────────────
const GameDB = {

  /* ---------- init ---------- */
  async init() {
    // localStorage 가 비어있고 data/db.js 백업이 있으면 전체 복원
    // (localStorage 에 데이터가 있으면 백업 파일은 완전히 무시됨)
    if (this._getUsers().length === 0 && window.GAMEDB_BACKUP) {
      const { users = [], scores = [], boardPosts = [] } = window.GAMEDB_BACKUP;
      if (users.length)  this._setUsers(users);
      if (scores.length) localStorage.setItem('gp_scores', JSON.stringify(scores));
      if (boardPosts.length) localStorage.setItem('gp_board_posts', JSON.stringify(boardPosts));
    }
    // 그래도 계정이 없으면 기본 admin 생성
    if (this._getUsers().length === 0) {
      this._setUsers([{ username: 'admin', password: 'admin', role: 'admin', approved: true }]);
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
    if (!u || u.password !== password) return false;
    if (u.approved === false) return 'pending'; // 명시적 false 만 차단 (기존 계정 호환)
    return true;
  },

  addUser(username, password, fullname = '') {
    const users = this._getUsers();
    if (users.find(u => u.username === username)) return false;
    users.push({ username, password, fullname: fullname.trim(), role: 'user', approved: false, created: new Date().toISOString() });
    this._setUsers(users);
    return true;
  },

  removeUser(username) {
    const users = this._getUsers().filter(u => u.username !== username);
    this._setUsers(users);
  },

  /* ---------- approval ---------- */
  getPendingUsers() {
    return this._getUsers().filter(u => u.approved === false);
  },

  approveUser(username) {
    this._setUsers(this._getUsers().map(u =>
      u.username === username ? { ...u, approved: true } : u
    ));
  },

  /* ---------- backup ---------- */
  // 계정 + 점수 전체를 data/db.js 형식으로 다운로드
  // 사용: admin.html (백업 다운로드 버튼)
  exportFullDB() {
    const users  = this._getUsers();
    const scores = JSON.parse(localStorage.getItem('gp_scores') || '[]');
    const boardPosts = JSON.parse(localStorage.getItem('gp_board_posts') || '[]');
    const ts     = new Date().toLocaleString('ko-KR');
    const content =
      `// GameHub DB 백업 — ${ts}\n` +
      `// data/db.js 로 저장하면 localStorage 초기화 시 자동 복원됩니다.\n` +
      `window.GAMEDB_BACKUP = ${JSON.stringify({ users, scores, boardPosts }, null, 2)};\n`;
    const a   = document.createElement('a');
    a.href    = URL.createObjectURL(new Blob([content], { type: 'text/javascript' }));
    a.download = 'db.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  },

  /* ---------- display name ---------- */
  getDisplayName(username) {
    const u = this.getUser(username);
    return (u && u.fullname) ? u.fullname : username;
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
    const games = ['tetris', 'snake', 'breakout', 'memory', 'dino', '1010'];
    const out = {};
    games.forEach(g => { out[g] = this.getUserBest(username, g); });
    return out;
  },

  getTotalScorers() {
    return new Set(this._getScores().map(s => s.username)).size;
  },

  /* ---------- anonymous board ---------- */
  _getBoardPosts() { return JSON.parse(localStorage.getItem('gp_board_posts') || '[]'); },
  _setBoardPosts(posts) { localStorage.setItem('gp_board_posts', JSON.stringify(posts)); },

  getBoardPosts() {
    return this._getBoardPosts()
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  addBoardPost({ title, content }) {
    const trimmedTitle = String(title || '').trim();
    const trimmedContent = String(content || '').trim();
    if (!trimmedTitle || !trimmedContent) return null;

    const post = {
      id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: trimmedTitle,
      content: trimmedContent,
      createdAt: new Date().toISOString(),
      author: '익명'
    };

    const posts = this._getBoardPosts();
    posts.push(post);
    this._setBoardPosts(posts);
    return post;
  },

  removeBoardPost(id) {
    this._setBoardPosts(this._getBoardPosts().filter(post => post.id !== id));
  },

};

// ──────────────────────────────────────────────
//  Auth
//  사용: 전 페이지 — 로그인 세션 및 권한 관리
// ──────────────────────────────────────────────
const Auth = {
  login(username, password) {
    const check = GameDB.validateUser(username, password);
    if (check === true) {
      sessionStorage.setItem('gp_session', JSON.stringify({ username, loginTime: Date.now() }));
      return true;
    }
    return check; // false 또는 'pending'
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
//  사용: 전 페이지 — 알림 표시, 점수 포맷, 날짜 포맷
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

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatScore(n) {
  return Number(n).toLocaleString();
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ──────────────────────────────────────────────
//  Navbar builder
//  사용: dashboard.html, leaderboard.html, admin.html
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
      <li><a href="${basePath()}board.html" ${activePage === 'board' ? 'class="active"' : ''}>게시판</a></li>
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
//  사용: leaderboard.html (탭·표 제목), admin.html (합산 점수)
// ──────────────────────────────────────────────
const GAME_NAMES = {
  tetris:   '테트리스',
  snake:    '스네이크',
  breakout: '브레이크아웃',
  memory:   '메모리 매치',
  dino:     '공룡 달리기',
  '1010':   '1010!',
};
