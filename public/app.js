/* ClipWave frontend - vanilla JS, no build step. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const state = { token: localStorage.getItem('cw_token'), username: localStorage.getItem('cw_user'), cursor: null, loading: false, done: false, signup: false, commentsFor: null, muted: true };

  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const res = await fetch(path, { ...opts, headers });
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.status === 401 && state.token && !path.startsWith('/api/auth')) { setSession(null); }
    if (!res.ok) throw new Error((body && body.error) || `Request failed (${res.status})`);
    return body;
  }

  function setSession(s) {
    state.token = s ? s.token : null;
    state.username = s ? s.username : null;
    try {
      if (s) { localStorage.setItem('cw_token', s.token); localStorage.setItem('cw_user', s.username); }
      else { localStorage.removeItem('cw_token'); localStorage.removeItem('cw_user'); }
    } catch { /* storage unavailable */ }
    const inn = Boolean(state.token);
    $('#loginBtn').hidden = inn; $('#logoutBtn').hidden = !inn; $('#uploadBtn').hidden = !inn;
    $('#whoami').hidden = !inn; $('#whoami').textContent = inn ? `@${state.username}` : '';
  }

  // ---------- feed ----------
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target.querySelector('video');
      if (e.isIntersecting) { v.muted = state.muted; v.play().catch(() => {}); } else { v.pause(); }
    }
  }, { threshold: 0.6 });

  function renderCard(video) {
    const node = $('#cardTpl').content.firstElementChild.cloneNode(true);
    node.dataset.id = video.id;
    node.querySelector('video').src = video.url;
    node.querySelector('.author').textContent = video.username;
    node.querySelector('.caption').textContent = video.caption;
    const like = node.querySelector('.like');
    const paint = () => { like.classList.toggle('liked', video.likedByMe); like.querySelector('.count').textContent = video.likeCount; };
    paint();
    like.addEventListener('click', async () => {
      if (!state.token) return openAuth();
      const r = await api(`/api/videos/${video.id}/like`, { method: 'POST' });
      video.likedByMe = r.liked; video.likeCount = r.likeCount; paint();
    });
    const cc = node.querySelector('.comment .count');
    cc.textContent = video.commentCount;
    node.querySelector('.comment').addEventListener('click', () => openComments(video, cc));
    node.querySelector('.sound').addEventListener('click', () => {
      state.muted = !state.muted;
      document.querySelectorAll('.card video').forEach((v) => { v.muted = state.muted; });
    });
    node.querySelector('video').addEventListener('click', (e) => { const v = e.target; if (v.paused) v.play(); else v.pause(); });
    observer.observe(node);
    return node;
  }

  async function loadMore(reset = false) {
    if (state.loading || (state.done && !reset)) return;
    state.loading = true;
    try {
      if (reset) { state.cursor = null; state.done = false; document.querySelectorAll('.card').forEach((c) => c.remove()); }
      const q = new URLSearchParams({ limit: '5' });
      if (state.cursor) q.set('cursor', state.cursor);
      const { items, cursor } = await api(`/api/videos?${q}`);
      const feed = $('#feed');
      items.forEach((v) => feed.appendChild(renderCard(v)));
      state.cursor = cursor; state.done = !cursor;
      $('#empty').hidden = feed.querySelectorAll('.card').length > 0;
    } finally { state.loading = false; }
  }
  $('#feed').addEventListener('scroll', (e) => {
    const f = e.target;
    if (f.scrollTop + f.clientHeight * 2 >= f.scrollHeight) loadMore();
  });

  // ---------- auth ----------
  function openAuth() {
    $('#authError').textContent = '';
    $('#authDialog').showModal();
  }
  function setMode(signup) {
    state.signup = signup;
    $('#authTitle').textContent = signup ? 'Create account' : 'Log in';
    $('#authSubmit').textContent = signup ? 'Sign up' : 'Log in';
    $('#authToggle').textContent = signup ? 'Have an account? Log in' : 'Need an account? Sign up';
  }
  $('#loginBtn').addEventListener('click', () => { setMode(false); openAuth(); });
  $('#logoutBtn').addEventListener('click', () => { setSession(null); loadMore(true); });
  $('#authToggle').addEventListener('click', () => setMode(!state.signup));
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const s = await api(`/api/auth/${state.signup ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify({ username: f.get('username'), password: f.get('password') }) });
      setSession(s); $('#authDialog').close(); e.target.reset(); loadMore(true);
    } catch (err) { $('#authError').textContent = err.message; }
  });

  // ---------- upload (direct-to-storage, valet key pattern) ----------
  $('#uploadBtn').addEventListener('click', () => { $('#uploadError').textContent = ''; $('#uploadDialog').showModal(); });
  $('#uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const file = form.file.files[0];
    if (!file) return;
    const btn = $('#uploadSubmit'); const bar = $('#uploadProgress');
    btn.disabled = true; bar.hidden = false; bar.value = 0; $('#uploadError').textContent = '';
    try {
      const { uploadUrl, blobName } = await api('/api/videos/upload-url', { method: 'POST', body: JSON.stringify({ contentType: file.type, size: file.size }) });
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) bar.value = (ev.loaded / ev.total) * 100; };
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error('Upload failed (network/CORS)'));
        xhr.send(file);
      });
      await api('/api/videos', { method: 'POST', body: JSON.stringify({ blobName, caption: form.caption.value }) });
      $('#uploadDialog').close(); form.reset();
      await loadMore(true);
      $('#feed').scrollTo({ top: 0 });
    } catch (err) { $('#uploadError').textContent = err.message; }
    finally { btn.disabled = false; bar.hidden = true; }
  });

  // ---------- comments ----------
  async function openComments(video, countEl) {
    state.commentsFor = { video, countEl };
    const list = $('#commentList'); list.textContent = 'Loading...';
    $('#commentsDialog').showModal();
    const { items } = await api(`/api/videos/${video.id}/comments`);
    list.textContent = '';
    if (!items.length) list.innerHTML = '<li class="muted">No comments yet</li>';
    items.forEach(addCommentLi);
  }
  function addCommentLi(c) {
    const li = document.createElement('li');
    const b = document.createElement('b'); b.textContent = c.username;
    li.append(b, document.createTextNode(c.text));
    $('#commentList').appendChild(li);
  }
  $('#commentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.token) { $('#commentsDialog').close(); return openAuth(); }
    const { video, countEl } = state.commentsFor;
    const c = await api(`/api/videos/${video.id}/comments`, { method: 'POST', body: JSON.stringify({ text: e.target.text.value }) });
    if ($('#commentList .muted')) $('#commentList').textContent = '';
    addCommentLi(c); e.target.reset();
    video.commentCount += 1; countEl.textContent = video.commentCount;
  });

  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

  // Show which build/revision served us - handy for demonstrating canary releases.
  api('/api/version').then((v) => { $('#version').textContent = `v${v.version} · ${v.environment} · rev ${v.revision} · ${String(v.commit).slice(0, 7)}`; }).catch(() => {});

  setSession(state.token ? { token: state.token, username: state.username } : null);
  loadMore(true);
})();
