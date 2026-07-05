const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const dataDir = path.join(rootDir, 'data');
const postsFile = path.join(dataDir, 'board-posts.json');
const logFile = path.join(dataDir, 'board-actions.log');

function ensureFiles() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(postsFile)) fs.writeFileSync(postsFile, '[]');
  if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '');
}

function readPosts() {
  try {
    return JSON.parse(fs.readFileSync(postsFile, 'utf8')) || [];
  } catch (error) {
    return [];
  }
}

function writePosts(posts) {
  fs.writeFileSync(postsFile, JSON.stringify(posts, null, 2));
}

function logAction(entry) {
  const line = `${new Date().toISOString()} ${entry}\n`;
  fs.appendFileSync(logFile, line);
}

function isAdmin(username) {
  return username === 'admin';
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

function serveStatic(req, res) {
  let reqPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (reqPath === '/') reqPath = '/index.html';
  const safePath = path.normalize(reqPath).replace(/^\.(?!\.)/, '');
  const filePath = path.join(rootDir, safePath);
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403); res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404); res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  ensureFiles();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const username = req.headers['x-user'] || '';
  const trimmedUsername = String(username).trim();

  if (url.pathname === '/api/board/posts') {
    if (req.method === 'GET') {
      const posts = readPosts();
      const visiblePosts = posts
        .filter((post) => isAdmin(trimmedUsername) || post.visible !== false)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return sendJson(res, 200, { posts: visiblePosts });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const title = String(body.title || '').trim();
      const content = String(body.content || '').trim();
      if (!title || !content) return sendJson(res, 400, { error: '제목과 내용을 입력해주세요.' });

      const post = {
        id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        authorUsername: trimmedUsername || 'unknown',
        authorFullname: String(body.fullname || body.authorFullname || '').trim() || (trimmedUsername || 'unknown'),
        visible: true,
        comments: []
      };

      const posts = readPosts();
      posts.push(post);
      writePosts(posts);
      logAction(`create_post actor=${post.authorUsername} postId=${post.id} title=${title}`);
      return sendJson(res, 201, { post });
    }
  }

  const postMatch = url.pathname.match(/^\/api\/board\/posts\/([^/]+)(?:\/comments|\/visibility)?$/);
  if (postMatch && req.method === 'PUT') {
    const postId = postMatch[1];
    const body = await parseJsonBody(req);
    const posts = readPosts();
    const post = posts.find((item) => item.id === postId);
    if (!post) return sendJson(res, 404, { error: '게시글을 찾을 수 없습니다.' });

    if (!isAdmin(trimmedUsername) && post.authorUsername !== trimmedUsername) {
      return sendJson(res, 403, { error: '수정 권한이 없습니다.' });
    }

    if (body.title !== undefined) post.title = String(body.title).trim();
    if (body.content !== undefined) post.content = String(body.content).trim();
    post.updatedAt = new Date().toISOString();
    writePosts(posts);
    logAction(`edit_post actor=${trimmedUsername} postId=${postId}`);
    return sendJson(res, 200, { post });
  }

  if (postMatch && req.method === 'DELETE') {
    const postId = postMatch[1];
    if (!isAdmin(trimmedUsername)) return sendJson(res, 403, { error: '삭제 권한이 없습니다.' });

    const posts = readPosts().filter((item) => item.id !== postId);
    writePosts(posts);
    logAction(`delete_post actor=${trimmedUsername} postId=${postId}`);
    return sendJson(res, 200, { success: true });
  }

  if (postMatch && url.pathname.endsWith('/comments') && req.method === 'POST') {
    const postId = postMatch[1];
    const body = await parseJsonBody(req);
    const content = String(body.content || '').trim();
    if (!content) return sendJson(res, 400, { error: '댓글 내용을 입력해주세요.' });

    const posts = readPosts();
    const post = posts.find((item) => item.id === postId);
    if (!post) return sendJson(res, 404, { error: '게시글을 찾을 수 없습니다.' });

    post.comments = post.comments || [];
    post.comments.push({
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      createdAt: new Date().toISOString(),
      authorUsername: trimmedUsername || 'unknown',
      authorFullname: String(body.fullname || body.authorFullname || '').trim() || (trimmedUsername || 'unknown')
    });
    post.updatedAt = new Date().toISOString();
    writePosts(posts);
    logAction(`comment_post actor=${trimmedUsername} postId=${postId}`);
    return sendJson(res, 201, { post });
  }

  if (postMatch && url.pathname.endsWith('/visibility') && req.method === 'PUT') {
    const postId = postMatch[1];
    if (!isAdmin(trimmedUsername)) return sendJson(res, 403, { error: '권한이 없습니다.' });

    const body = await parseJsonBody(req);
    const posts = readPosts();
    const post = posts.find((item) => item.id === postId);
    if (!post) return sendJson(res, 404, { error: '게시글을 찾을 수 없습니다.' });

    post.visible = body.visible !== false;
    post.updatedAt = new Date().toISOString();
    writePosts(posts);
    logAction(`toggle_visibility actor=${trimmedUsername} postId=${postId} visible=${post.visible}`);
    return sendJson(res, 200, { post });
  }

  serveStatic(req, res);
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Board server running on http://127.0.0.1:${port}`);
});
