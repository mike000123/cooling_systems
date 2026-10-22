/* =====================================================================
   Cooling Systems Lab Academy — εφαρμογή (vanilla JS, Supabase)
   Διαδρομές (hash): #/  #/me  #/me/settings  #/me/stats  #/login  #/register  #/forgot
     #/join/<κωδικός>  #/new-class  #/c/<class>[/<tab>]
     #/c/<class>/lesson/<id>[/edit]  #/c/<class>/asg/<id>[/edit|/grade]
     #/c/<class>/chat[/<student>]
   ===================================================================== */
(() => {
'use strict';
const CFG = window.ACADEMY_CONFIG || {};
// Λειτουργίες που υπάρχουν αλλά είναι κλειστές μέχρι να ενεργοποιηθούν από το config.js
const F = Object.assign({ assignments: false, announcements: false, messages: false }, CFG.features || {});
const none = () => Promise.resolve([]);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// απλή μορφοποίηση κειμένου: παράγραφοι, αλλαγές γραμμής, **έντονα**, σύνδεσμοι
function rich(s) {
  if (!s || !String(s).trim()) return '';
  return String(s).trim().split(/\n{2,}/).map(p => '<p>' + esc(p)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>') + '</p>').join('');
}
const fmtDate = d => d ? new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : '';
const fmtDay = d => d ? new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'short' }).format(new Date(d)) : '';
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const num = n => n == null ? '' : String(+(+n).toFixed(2)).replace('.', ',');
function toast(t, err) { const el = $('#toast'); el.textContent = t; el.className = 'toast' + (err ? ' err' : ''); el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, err ? 6000 : 3000); }
const msgBox = (kind, t) => `<div class="msg ${kind}">${t}</div>`;

// ελληνικά μηνύματα για τα συνήθη σφάλματα
function errText(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e);
  const map = [
    [/Invalid login credentials/i, 'Λάθος email ή κωδικός.'],
    [/User already registered|already been registered/i, 'Υπάρχει ήδη λογαριασμός με αυτό το email.'],
    [/Email not confirmed/i, 'Το email δεν έχει επιβεβαιωθεί ακόμη. Ελέγξτε τα εισερχόμενα (και τα ανεπιθύμητα).'],
    [/Password should be at least|weak.?password/i, 'Ο κωδικός είναι πολύ αδύναμος (τουλάχιστον 8 χαρακτήρες).'],
    [/rate limit|too many/i, 'Πολλές προσπάθειες. Δοκιμάστε ξανά σε λίγα λεπτά.'],
    [/row-level security|permission denied|violates/i, 'Δεν επιτρέπεται αυτή η ενέργεια.'],
    [/exceeded the maximum allowed size|too large/i, 'Το αρχείο είναι πολύ μεγάλο.'],
    [/mime type|invalid_mime/i, 'Μη αποδεκτός τύπος αρχείου.'],
    [/Failed to fetch|NetworkError|network/i, 'Πρόβλημα σύνδεσης. Ελέγξτε το internet και δοκιμάστε ξανά.'],
    [/duplicate key/i, 'Υπάρχει ήδη.'],
    [/JWT expired/i, 'Η σύνδεση έληξε. Συνδεθείτε ξανά.']
  ];
  for (const [re, t] of map) if (re.test(m)) return t;
  return m;
}
async function q(p) { const { data, error } = await p; if (error) throw error; return data; }

// ---------------------------------------------------------------- Supabase
const configured = CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase;
const sb = configured ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
let session = null, me = null, recovering = false;
const isTeacher = () => me && me.role === 'instructor';

async function loadMe() {
  me = null;
  if (!session) return;
  me = await q(sb.from('profiles').select('*').eq('id', session.user.id).single());
  me.email = session.user.email;
}

// ---------------------------------------------------------------- προσομοιώσεις
let SIMS = [];
const simsReady = fetch('sims.json').then(r => r.json()).then(d => SIMS = d).catch(() => {});
function simLabel(key) {
  const [id, sc] = key.split('.'); const s = SIMS.find(x => x.id === id);
  if (!s) return key;
  const scene = sc && s.s.find(x => x[0] === sc);
  return scene && s.s.length > 1 ? `${s.t} — ${scene[1]}` : s.t;
}
const simHref = key => (CFG.siteUrl || '../') + '#' + key;

// ---------------------------------------------------------------- YouTube
function ytId(u) {
  const m = String(u).match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/|studio\.youtube\.com\/video\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function videoCards(list) {
  const v = (list || []).map(u => ({ u, id: ytId(u) })).filter(x => x.id);
  if (!v.length) return '';
  // πάντα δημόσιος σύνδεσμος (ένας σύνδεσμος Studio ανοίγει μόνο για τον ιδιοκτήτη)
  v.forEach(x => { if (/studio\.youtube|embed\//.test(x.u)) x.u = 'https://www.youtube.com/watch?v=' + x.id; });
  return `<div class="vids">${v.map(x => `<a class="vid" href="${esc(x.u)}" target="_blank" rel="noopener">
    <img src="https://i.ytimg.com/vi/${x.id}/mqdefault.jpg" alt="" loading="lazy"><span>▶ Άνοιγμα στο YouTube</span></a>`).join('')}</div>`;
}

function recapCards(list) {
  const v = (list || []).map(u => ytId(u)).filter(Boolean);
  if (!v.length) return '';
  return `<div class="recaps">${v.map((id, i) => `<a class="recap" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener" title="Ανασκόπηση μαθήματος${v.length > 1 ? ' ' + (i + 1) : ''} — άνοιγμα στο YouTube" aria-label="Ανασκόπηση μαθήματος${v.length > 1 ? ' ' + (i + 1) : ''} στο YouTube">
    <img src="https://i.ytimg.com/vi/${id}/maxresdefault.jpg" alt="" loading="lazy" onload="if(this.naturalWidth<200)this.src='https://i.ytimg.com/vi/${id}/mqdefault.jpg'" onerror="this.onerror=null;this.src='https://i.ytimg.com/vi/${id}/mqdefault.jpg'"><i aria-hidden="true"></i></a>`).join('')}</div>`;
}

// ---------------------------------------------------------------- κουίζ αυτοελέγχου
// Μορφή:  ? Ερώτηση  /  - λάθος επιλογή  /  * σωστή επιλογή  /  > επεξήγηση
function parseQuiz(src) {
  const qs = []; let cur = null;
  for (const raw of String(src || '').split('\n')) {
    const l = raw.trim(); if (!l) continue;
    if (l.startsWith('?')) { cur = { q: l.slice(1).trim(), opts: [], expl: '' }; qs.push(cur); }
    else if (cur && (l.startsWith('-') || l.startsWith('*'))) cur.opts.push({ t: l.slice(1).trim(), ok: l[0] === '*' });
    else if (cur && l.startsWith('>')) cur.expl += (cur.expl ? ' ' : '') + l.slice(1).trim();
  }
  return qs.filter(x => x.q && x.opts.length >= 2);
}
function quizHTML(src) {
  const qs = parseQuiz(src); if (!qs.length) return '';
  return `<div class="quiz">${qs.map((x, i) => `<div class="q" data-q="${i}"><b>${i + 1}. ${esc(x.q)}</b>
    ${x.opts.map((o, j) => `<label class="opt"><input type="radio" name="q${i}" value="${j}"> <span>${esc(o.t)}</span></label>`).join('')}
    <div class="expl" hidden>${esc(x.expl)}</div></div>`).join('')}
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="check">Έλεγχος απαντήσεων</button><span class="muted" data-score></span></div></div>`;
}
function bindQuiz(root, src, onScore) {
  const qs = parseQuiz(src); const btn = $('[data-act=check]', root); if (!btn) return;
  btn.onclick = () => {
    let score = 0;
    $$('.q', root).forEach((el, i) => {
      const pick = $(`input[name=q${i}]:checked`, el);
      $$('.opt', el).forEach((o, j) => { o.classList.remove('right', 'wrong'); if (qs[i].opts[j].ok) o.classList.add('right'); });
      if (pick) { const j = +pick.value; if (qs[i].opts[j].ok) score++; else pick.closest('.opt').classList.add('wrong'); }
      const ex = $('.expl', el); ex.hidden = !qs[i].expl;
    });
    $('[data-score]', root).textContent = `Σωστές: ${score} από ${qs.length}`;
    if (onScore) onScore(score, qs.length);
  };
}

// ---------------------------------------------------------------- αρχεία
async function signedUrl(bucket, path) {
  const d = await q(sb.storage.from(bucket).createSignedUrl(path, 3600));
  return d.signedUrl;
}
async function openFile(bucket, path) {
  const w = window.open('', '_blank');
  try { const u = await signedUrl(bucket, path); if (w) w.location = u; else location.href = u; }
  catch (e) { if (w) w.close(); toast(errText(e), true); }
}
// ---------------------------------------------------------------- προβολή αρχείων (χωρίς λήψη)
const VIEWABLE = /\.(pdf|png|jpe?g|webp|gif)$/i;
let pdfjsP = null;
function loadPdfJs() {
  // πρώτα το τοπικό αντίγραφο (vendor/pdfjs), αλλιώς από το cdnjs
  const srcs = [['vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js'],
    ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js']];
  const one = ([js, worker]) => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = js;
    s.onload = () => window.pdfjsLib ? (window.pdfjsLib.GlobalWorkerOptions.workerSrc = worker, res(window.pdfjsLib)) : rej(new Error('pdfjs'));
    s.onerror = () => { s.remove(); rej(new Error('pdfjs')); };
    document.head.appendChild(s);
  });
  return pdfjsP || (pdfjsP = one(srcs[0]).catch(() => one(srcs[1])).catch(() => { pdfjsP = null; throw new Error('Δεν φορτώθηκε ο προβολέας PDF. Ελέγξτε τη σύνδεση και δοκιμάστε ξανά.'); }));
}
const wmText = () => 'CoolingSystemsLab';
function drawWatermark(ctx, w, h, text) {
  if (!text) return;
  const fs = Math.max(13, Math.round(w / 38));
  ctx.save(); ctx.globalAlpha = 0.12; ctx.fillStyle = '#0B2540'; ctx.font = `600 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 7);
  const tw = ctx.measureText(text).width + fs * 4, step = fs * 6, D = Math.hypot(w, h);
  for (let y = -D, r = 0; y < D; y += step, r++) for (let x = -D - (r % 2 ? tw / 2 : 0); x < D; x += tw) ctx.fillText(text, x, y);
  ctx.restore();
}
async function viewFile(m, canDownload) {
  const ov = document.createElement('div'); ov.className = 'viewer'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', m.title);
  ov.innerHTML = `<div class="vbar"><b class="vtitle">${esc(m.title)}</b><span class="muted small" id="vinfo">Φόρτωση…</span><span class="spacer"></span>
    ${canDownload ? '<button class="btn small" id="vdl">⬇ Λήψη</button>' : ''}<button class="btn small primary" id="vx">✕ Κλείσιμο</button></div><div class="vpages" id="vpages"></div>`;
  document.body.appendChild(ov); document.body.classList.add('viewing');
  let closed = false, pdf = null, io = null;
  const onKey = e => {
    if (e.key === 'Escape') close();
    if ((e.ctrlKey || e.metaKey) && /^[sp]$/i.test(e.key)) { e.preventDefault(); e.stopPropagation(); }
  };
  const close = () => { if (closed) return; closed = true; io && io.disconnect(); ov.remove(); document.body.classList.remove('viewing'); document.removeEventListener('keydown', onKey, true); if (pdf) pdf.destroy(); };
  document.addEventListener('keydown', onKey, true);
  ov.addEventListener('contextmenu', e => e.preventDefault());
  ov.addEventListener('dragstart', e => e.preventDefault());
  $('#vx', ov).onclick = close; $('#vx', ov).focus();
  if (canDownload) $('#vdl', ov).onclick = () => openFile('materials', m.path);
  const pages = $('#vpages', ov), info = $('#vinfo', ov), wm = wmText();
  const W = () => Math.max(260, Math.min(pages.clientWidth - 24, 1100));
  try {
    const blob = await q(sb.storage.from('materials').download(m.path));
    if (closed) return;
    if (/\.pdf$/i.test(m.title) || blob.type === 'application/pdf') {
      const lib = await loadPdfJs();
      pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, standardFontDataUrl: 'vendor/pdfjs/standard_fonts/' }).promise;
      if (closed) { pdf.destroy(); return; }
      info.textContent = pdf.numPages === 1 ? '1 σελίδα' : `${pdf.numPages} σελίδες`;
      const w = W(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      const v1 = (await pdf.getPage(1)).getViewport({ scale: 1 });
      const slots = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const d = document.createElement('div'); d.className = 'vpage'; d.style.width = w + 'px'; d.style.aspectRatio = `${v1.width} / ${v1.height}`; d.dataset.n = i;
        pages.appendChild(d); slots.push(d);
      }
      const draw = async d => {
        const pg = await pdf.getPage(+d.dataset.n); if (closed) return;
        const v0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: w / v0.width * dpr });
        const cv = document.createElement('canvas'); cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
        const ctx = cv.getContext('2d'); await pg.render({ canvasContext: ctx, viewport: vp }).promise; if (closed) return;
        drawWatermark(ctx, cv.width, cv.height, wm); d.style.aspectRatio = `${v0.width} / ${v0.height}`; d.appendChild(cv); d.classList.add('ok');
      };
      io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); draw(e.target).catch(() => {}); } }), { root: pages, rootMargin: '1200px 0px' });
      slots.forEach(d => io.observe(d));
    } else if (/^image\//.test(blob.type) || /\.(png|jpe?g|webp|gif)$/i.test(m.title)) {
      const img = await createImageBitmap(blob); if (closed) return;
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0); drawWatermark(ctx, cv.width, cv.height, wm);
      const d = document.createElement('div'); d.className = 'vpage ok'; d.style.width = Math.min(W(), img.width) + 'px'; d.appendChild(cv); pages.appendChild(d); info.textContent = '';
    } else info.textContent = 'Αυτός ο τύπος αρχείου δεν προβάλλεται.';
  } catch (e) { if (!closed) info.textContent = errText(e); }
}
const safeName = n => (n || 'file').normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-80);
// συμπίεση φωτογραφιών κινητού πριν το ανέβασμα (μέγ. 1600 px, JPEG)
async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || file.size < 400 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}

// ---------------------------------------------------------------- router
const routes = [];
const route = (re, fn) => routes.push([re, fn]);
let navToken = 0;
function go(h) { if (location.hash === h) render(); else location.hash = h; }
function bindPreview() {
  const on = $('#prev-on'), ex = $('#prev-exit'), rs = $('#prev-reset'), hp = $('#prev-home');
  if (hp) hp.onclick = () => { try { sessionStorage.setItem(HOME_PREVIEW, '1'); } catch {} render(); };
  const cid = (location.hash.match(/#\/c\/([\w-]{36})/) || [])[1];
  if (on) on.onclick = () => { try { sessionStorage.setItem(PREVIEW_KEY, cid); } catch {} go('#/c/' + cid); };
  if (ex) ex.onclick = () => { try { sessionStorage.removeItem(PREVIEW_KEY); sessionStorage.removeItem(HOME_PREVIEW); } catch {} render(); };
  if (rs) rs.onclick = async () => { try { await q(sb.from('lesson_progress').delete().eq('class_id', cid).eq('user_id', me.id)); toast('Η πρόοδός σας μηδενίστηκε.'); render(); } catch (er) { toast(errText(er), true); } };
}
async function render() {
  const tok = ++navToken;
  const h = location.hash.replace(/^#/, '') || '/';
  renderNav(h);
  if (!configured) { app.innerHTML = notConfigured(); return; }
  if (recovering) { viewNewPassword(); return; }
  if (needsWelcome() && h !== '/deleted') { viewWelcome(); return; }
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) {
      if (session && me) refreshUnread().catch(() => {});
      try { await fn(...m.slice(1).map(x => x && decodeURIComponent(x)), tok); bindPreview(); if (tok === navToken) GC.page(h); }
      catch (e) { console.error(e); if (tok === navToken) app.innerHTML = msgBox('err', esc(errText(e))) + `<p><a href="#/">← Αρχική</a></p>`; }
      window.scrollTo(0, 0);
      return;
    }
  }
  app.innerHTML = `<div class="empty">Η σελίδα δεν βρέθηκε. <a href="#/">Αρχική</a></div>`;
}
const stale = tok => tok !== navToken;
function needLogin() { if (!session) { go('#/login'); return true; } return false; }

let unread = 0;
function renderNav(h) {
  const nav = $('#nav'), acad = $('#nav-acad');
  if (acad) {
    acad.classList.toggle('on', !!(session && me) && h === '/');
    acad.innerHTML = 'Academy' + (unread ? `<span class="badge" title="Νέα μηνύματα">${unread}</span>` : '');
  }
  if (!nav) return;
  const first = session && me ? esc(me.full_name.split(' ')[0]) : '';
  nav.innerHTML = session && me
    ? `<span class="umenu"><a class="me ${/^\/(me|profile|admin)/.test(h) ? 'on' : ''}" href="#/me" id="mebtn" aria-haspopup="true" aria-expanded="false" title="Ο λογαριασμός μου">👤 ${first} ▾</a>
      <div class="udrop" id="udrop" hidden><small>Συνδεδεμένος ως <b>${first}</b></small><a href="#/me">🏠 Ο πίνακάς μου</a>${isTeacher() ? '<a href="#/me/stats">📊 Στατιστικά</a>' : ''}<a href="#/me/settings">⚙️ Ρυθμίσεις</a><hr><a href="#/" id="mout">↩ Αποσύνδεση</a></div></span>` : '';
  const mb = $('#mebtn'), dd = $('#udrop');
  if (mb) {
    mb.onclick = e => { e.preventDefault(); dd.hidden = !dd.hidden; mb.setAttribute('aria-expanded', String(!dd.hidden)); };
    $$('a', dd).forEach(a => a.addEventListener('click', () => { dd.hidden = true; }));
    $('#mout').onclick = e => { e.preventDefault(); dd.hidden = true; sb.auth.signOut(); };
  }
}
document.addEventListener('click', e => { const dd = $('#udrop'); if (dd && !dd.hidden && !e.target.closest('.umenu')) dd.hidden = true; });
document.addEventListener('keydown', e => { const dd = $('#udrop'); if (e.key === 'Escape' && dd) dd.hidden = true; });
function notConfigured() {
  return `<div class="panel stack"><h1>Η Academy δεν έχει ρυθμιστεί ακόμη</h1>
    <p>Συμπληρώστε το <code>academy/config.js</code> με το URL και το «anon public» κλειδί του Supabase project (δείτε τον οδηγό εγκατάστασης).</p></div>`;
}
async function refreshUnread() {
  if (!session || !me || !F.messages) { unread = 0; return; }
  const { count } = await sb.from('messages').select('id', { count: 'exact', head: true }).is('read_at', null).neq('sender_id', me.id);
  unread = count || 0; renderNav(location.hash.replace(/^#/, '') || '/');
}

// ================================================================ AUTH
route(/^\/login$/, async () => {
  if (session) return go('#/');
  app.innerHTML = `<div class="hero"><div class="panel">
    <h1>Σύνδεση</h1>
    <form class="f" id="fm" novalidate>
      <label>Email<input type="email" name="email" autocomplete="email" required></label>
      <label>Κωδικός<input type="password" name="password" autocomplete="current-password" required></label>
      <div id="out"></div>
      <div class="row"><button class="btn primary" type="submit">Σύνδεση</button><span class="spacer"></span><a href="#/forgot">Ξεχάσατε τον κωδικό;</a></div>
    </form>
    <p class="muted small" style="margin-top:14px">Δεν έχετε λογαριασμό; <a href="#/register">Εγγραφή</a></p>
  </div>${intro()}</div>`;
  $('#fm').onsubmit = async e => {
    e.preventDefault(); const f = e.target, b = $('button[type=submit]', f); b.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    b.disabled = false;
    if (error) $('#out').innerHTML = msgBox('err', esc(errText(error)));
  };
});

route(/^\/register$/, async () => {
  if (session) return go('#/');
  const pending = sessionStorage.getItem('csl-join');
  app.innerHTML = `<div class="hero"><div class="panel">
    <h1>Εγγραφή</h1>
    ${pending ? msgBox('info', `Μετά την εγγραφή θα αποκτήσετε πρόσβαση στην ενότητα με κωδικό <b>${esc(pending)}</b>.`) : ''}
    <form class="f" id="fm" novalidate>
      <label>Ονοματεπώνυμο<input type="text" name="name" autocomplete="name" maxlength="80" required>
        <span class="hint">Εμφανίζεται μόνο στον λογαριασμό σας.</span></label>
      <label>Email<input type="email" name="email" autocomplete="email" required></label>
      <label>Κωδικός<input type="password" name="password" autocomplete="new-password" minlength="8" required>
        <span class="hint">Τουλάχιστον 8 χαρακτήρες.</span></label>
      <label class="chk"><input type="checkbox" name="consent" required> <span>Διάβασα την <a href="privacy.html" target="_blank">πολιτική απορρήτου</a> και συμφωνώ με την επεξεργασία των στοιχείων μου για τη λειτουργία της Academy.</span></label>
      <p class="muted small">Η εγγραφή είναι δωρεάν και μπορείτε να διαγράψετε τον λογαριασμό σας όποτε θέλετε.</p>
      <div id="out"></div>
      <div><button class="btn accent" type="submit">Δημιουργία λογαριασμού</button></div>
    </form>
  </div>${intro()}</div>`;
  $('#fm').onsubmit = async e => {
    e.preventDefault(); const f = e.target, out = $('#out');
    const name = f.elements.namedItem('name').value.trim(), email = f.email.value.trim(), pw = f.password.value;
    if (!name) return out.innerHTML = msgBox('err', 'Συμπληρώστε το ονοματεπώνυμο.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return out.innerHTML = msgBox('err', 'Μη έγκυρο email.');
    if (pw.length < 8) return out.innerHTML = msgBox('err', 'Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες.');
    if (!f.consent.checked) return out.innerHTML = msgBox('err', 'Χρειάζεται η συγκατάθεσή σας στην πολιτική απορρήτου.');
    const b = $('button[type=submit]', f); b.disabled = true;
    const { data, error } = await sb.auth.signUp({ email, password: pw, options: {
      data: { full_name: name, consent: 'true' }, emailRedirectTo: location.origin + location.pathname } });
    b.disabled = false;
    if (error) return out.innerHTML = msgBox('err', esc(errText(error)));
    if (!data.session) {
      app.innerHTML = `<div class="panel stack"><h1>Σχεδόν έτοιμοι!</h1>
        <p>Στείλαμε email επιβεβαίωσης στο <b>${esc(email)}</b>. Πατήστε τον σύνδεσμο που περιέχει και μετά συνδεθείτε.</p>
        <p class="muted small">Δεν το βλέπετε; Ελέγξτε τα ανεπιθύμητα (spam).</p><p><a class="btn" href="#/login">Σύνδεση</a></p></div>`;
    }
  };
});

route(/^\/forgot$/, async () => {
  app.innerHTML = `<div class="panel" style="max-width:520px"><h1>Επαναφορά κωδικού</h1>
    <form class="f" id="fm"><label>Email<input type="email" name="email" required></label><div id="out"></div>
    <div><button class="btn primary">Αποστολή συνδέσμου</button></div></form></div>`;
  $('#fm').onsubmit = async e => {
    e.preventDefault(); const email = e.target.email.value.trim();
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    $('#out').innerHTML = error ? msgBox('err', esc(errText(error))) : msgBox('ok', 'Αν υπάρχει λογαριασμός με αυτό το email, θα λάβετε σύνδεσμο επαναφοράς.');
  };
});

// λογαριασμοί που δημιούργησε ο διαχειριστής: δικός τους κωδικός + συγκατάθεση στην πρώτη σύνδεση
const needsWelcome = () => !!(session && me && !isTeacher() && (!me.consent_at || (session.user.user_metadata || {}).must_change_password));
function viewWelcome() {
  const mustPw = !!(session.user.user_metadata || {}).must_change_password, needC = !me.consent_at;
  app.innerHTML = `<div class="panel" style="max-width:560px"><h1>Καλώς ήρθατε στην Academy</h1>
    <p class="muted">Ο λογαριασμός <b>${esc(session.user.email)}</b> δημιουργήθηκε από τον διαχειριστή. Πριν συνεχίσετε${mustPw ? ', ορίστε τον δικό σας κωδικό' : ''}:</p>
    <form class="f" id="fw">
      <label>Ονοματεπώνυμο<input name="fullname" maxlength="80" required value="${esc(me.full_name === session.user.email.split('@')[0] ? '' : me.full_name)}" placeholder="π.χ. Γιώργος Παπαδόπουλος" autocomplete="name"></label>
      ${mustPw ? `<label>Νέος κωδικός<input type="password" name="pw" minlength="8" autocomplete="new-password" required></label>
      <label>Επανάληψη κωδικού<input type="password" name="pw2" minlength="8" autocomplete="new-password" required></label>` : ''}
      ${needC ? `<label class="chk"><input type="checkbox" name="consent" required> <span>Διάβασα την <a href="privacy.html" target="_blank">πολιτική απορρήτου</a> και συμφωνώ με την επεξεργασία των στοιχείων μου για τη λειτουργία της Academy.</span></label>` : ''}
      <div id="out"></div>
      <div class="row"><button class="btn primary">Συνέχεια</button><span class="spacer"></span><button type="button" class="link small" id="wno">Δεν θέλω λογαριασμό — διαγραφή</button></div>
    </form></div>`;
  $('#fw').onsubmit = async e => {
    e.preventDefault(); const f = e.target, out = $('#out');
    const name = f.elements.namedItem('fullname').value.trim();
    if (!name) return out.innerHTML = msgBox('err', 'Συμπληρώστε το ονοματεπώνυμο.');
    let pw = null;
    if (mustPw) {
      pw = f.pw.value;
      if (pw.length < 8) return out.innerHTML = msgBox('err', 'Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες.');
      if (/^(.)\1+$/.test(pw) || /^(12345678|123456789|87654321|password)$/i.test(pw)) return out.innerHTML = msgBox('err', 'Επιλέξτε έναν λιγότερο προβλέψιμο κωδικό.');
      if (pw !== f.pw2.value) return out.innerHTML = msgBox('err', 'Οι δύο κωδικοί δεν ταιριάζουν.');
    }
    if (needC && !f.consent.checked) return out.innerHTML = msgBox('err', 'Χρειάζεται η συγκατάθεσή σας στην πολιτική απορρήτου.');
    const btn = f.querySelector('button.primary'); btn.disabled = true;
    try {
      const upd = { data: { must_change_password: false, full_name: name } }; if (pw) upd.password = pw;
      const r = await sb.auth.updateUser(upd); if (r.error) throw r.error;
      session.user = r.data.user;
      await q(sb.from('profiles').update({ full_name: name }).eq('id', me.id));
      if (needC) await q(sb.rpc('give_consent'));
      await loadMe(); toast('Ο λογαριασμός σας είναι έτοιμος.'); go('#/');
    } catch (er) { btn.disabled = false; out.innerHTML = msgBox('err', esc(errText(er))); }
  };
  $('#wno').onclick = async () => {
    if (!confirm('Οριστική διαγραφή του λογαριασμού σας;')) return;
    try { await q(sb.rpc('delete_my_account')); location.hash = '#/deleted'; await sb.auth.signOut({ scope: 'local' }); }
    catch (er) { $('#out').innerHTML = msgBox('err', esc(errText(er))); }
  };
}

function viewNewPassword() {
  app.innerHTML = `<div class="panel" style="max-width:520px"><h1>Νέος κωδικός</h1>
    <form class="f" id="fm"><label>Νέος κωδικός<input type="password" name="pw" minlength="8" autocomplete="new-password" required></label><div id="out"></div>
    <div><button class="btn primary">Αποθήκευση</button></div></form></div>`;
  $('#fm').onsubmit = async e => {
    e.preventDefault(); const pw = e.target.pw.value;
    if (pw.length < 8) return $('#out').innerHTML = msgBox('err', 'Τουλάχιστον 8 χαρακτήρες.');
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) return $('#out').innerHTML = msgBox('err', esc(errText(error)));
    recovering = false; toast('Ο κωδικός άλλαξε.'); go('#/me');
  };
}

function intro() {
  return `<div class="panel stack"><h2>Τι είναι η Academy</h2>
    <p>Μαθησιακό υλικό για βασικά και προχωρημένα θέματα ψύξης και κλιματισμού, οργανωμένο σε ενότητες:</p>
    <ul><li>βίντεο και φύλλα εργασίας για κάθε θέμα,</li>
    <li>σύνδεσμοι στις διαδραστικές προσομοιώσεις,</li>
    <li>ερωτήσεις αυτοελέγχου,</li>
    ${F.assignments ? '<li>ασκήσεις με προσωπική ανατροφοδότηση,</li>' : ''}
    ${F.messages ? '<li>απευθείας μηνύματα με τον εκπαιδευτή,</li>' : ''}
    <li>όλα σε ένα σημείο, από υπολογιστή ή κινητό.</li></ul>
    <p class="muted small">Με μια δωρεάν εγγραφή έχετε πρόσβαση σε όλο το υλικό.</p></div>`;
}

route(/^\/deleted$/, async () => {
  app.innerHTML = `<div class="panel"><h1>Ο λογαριασμός διαγράφηκε</h1><p>Όλα τα δεδομένα σας αφαιρέθηκαν οριστικά. Ευχαριστούμε που χρησιμοποιήσατε την Academy.</p><p><a href="../">Προσομοιώσεις Cooling Systems Lab →</a></p></div>`;
});

route(/^\/join\/([A-Za-z0-9]{4,12})$/, async code => {
  if (!session) { sessionStorage.setItem('csl-join', code.toUpperCase()); return go('#/register'); }
  const cid = await q(sb.rpc('join_class', { code }));
  sessionStorage.removeItem('csl-join'); toast('Αποκτήσατε πρόσβαση στην ενότητα.'); go('#/c/' + cid);
});

// ================================================================ ΠΡΟΦΙΛ / GDPR
route(/^\/(?:profile|me\/settings)$/, async () => {
  if (needLogin()) return;
  app.innerHTML = meLayout('set', `<h1 style="margin-top:0">Ρυθμίσεις</h1><div class="two"><div class="stack">
    <div class="panel"><h2>Στοιχεία</h2><form class="f" id="fn">
      <label>Ονοματεπώνυμο<input type="text" name="name" maxlength="80" value="${esc(me.full_name)}" required></label>
      <p class="muted small">Email: ${esc(me.email)} · Ρόλος: ${isTeacher() ? 'Διαχειριστής' : 'Χρήστης'} · Μέλος από ${fmtDay(me.created_at)}</p>
      <div class="row"><button class="btn primary">Αποθήκευση</button><span class="spacer"></span><button type="button" class="btn" id="logout">Αποσύνδεση</button></div></form></div>
    <div class="panel"><h2>Αλλαγή κωδικού</h2><form class="f" id="fp">
      <label>Νέος κωδικός<input type="password" name="pw" minlength="8" autocomplete="new-password" required></label>
      <div><button class="btn">Αλλαγή</button></div></form></div>
  </div><div class="stack">
    <div class="panel stack"><h2>Τα δεδομένα μου</h2>
      <p class="small">Μπορείτε να κατεβάσετε όλα όσα έχουμε αποθηκεύσει για εσάς ή να διαγράψετε οριστικά τον λογαριασμό σας. <a href="privacy.html" target="_blank">Πολιτική απορρήτου</a></p>
      <div><button class="btn" id="exp">Λήψη δεδομένων (JSON)</button></div>
      <hr style="border:0;border-top:1px solid var(--line-2)">
      <p class="small"><b>Διαγραφή λογαριασμού:</b> σβήνονται οριστικά το προφίλ, οι υποβολές, τα αρχεία και τα μηνύματά σας.</p>
      <div><button class="btn danger" id="del">Διαγραφή λογαριασμού</button></div><div id="dout"></div>
    </div></div></div>`);
  $('#logout').onclick = () => sb.auth.signOut();
  $('#fn').onsubmit = async e => {
    e.preventDefault(); const n = e.target.elements.namedItem('name').value.trim(); if (!n) return;
    try { await q(sb.from('profiles').update({ full_name: n }).eq('id', me.id)); me.full_name = n; renderNav(location.hash.replace(/^#/, '')); toast('Αποθηκεύτηκε.'); }
    catch (er) { toast(errText(er), true); }
  };
  $('#fp').onsubmit = async e => {
    e.preventDefault(); const pw = e.target.pw.value;
    if (pw.length < 8) return toast('Τουλάχιστον 8 χαρακτήρες.', true);
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) toast(errText(error), true); else { e.target.reset(); toast('Ο κωδικός άλλαξε.'); }
  };
  $('#exp').onclick = async () => {
    try {
      const [profile, enrollments, submissions, messages, progress, activity] = await Promise.all([
        q(sb.from('profiles').select('*').eq('id', me.id).single()),
        q(sb.from('enrollments').select('joined_at, classes(name)').eq('user_id', me.id)),
        q(sb.from('submissions').select('*, assignments(title)').eq('student_id', me.id)),
        q(sb.from('messages').select('*').or(`student_id.eq.${me.id},sender_id.eq.${me.id}`)),
        q(sb.from('lesson_progress').select('completed_at, score, lessons(title)').eq('user_id', me.id)),
        q(sb.from('activity_events').select('kind, label, ref, created_at').eq('user_id', me.id).order('created_at').limit(5000))]);
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), email: me.email, profile, enrollments, progress, activity, submissions, messages }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'academy-ta-dedomena-mou.json'; a.click();
    } catch (er) { toast(errText(er), true); }
  };
  $('#del').onclick = async () => {
    const t = prompt('Η διαγραφή είναι οριστική. Πληκτρολογήστε ΔΙΑΓΡΑΦΗ για επιβεβαίωση:');
    if ((t || '').trim().toUpperCase() !== 'ΔΙΑΓΡΑΦΗ') return;
    try {
      const subs = await q(sb.from('submissions').select('file_path').eq('student_id', me.id).not('file_path', 'is', null));
      if (subs.length) await sb.storage.from('submissions').remove(subs.map(s => s.file_path));
      await q(sb.rpc('delete_my_account'));
      location.hash = '#/deleted';
      await sb.auth.signOut({ scope: 'local' });
    } catch (er) { $('#dout').innerHTML = msgBox('err', esc(errText(er))); }
  };
});

// ================================================================ ΑΡΧΙΚΗ / ΠΙΝΑΚΑΣ
route(/^\/?$/, async tok => {
  if (!session) {
    const catHTML = await catalogPanel({});
    if (session) return;
    app.innerHTML = landingHTML(catHTML); bindCatalog();
    return;
  }
  if (!me) await loadMe();
  const first = esc((me.full_name || '').split(' ')[0]);
  let catHTML, cta;
  if (isTeacher() && !homePreview()) {
    catHTML = await catalogPanel({ counts: await interestCounts() });
    cta = `<a class="btn accent big" href="#/me">Ο πίνακάς μου →</a>`;
  } else {
    const D = await studentBase();
    catHTML = await catalogPanel({ mine: D.mine, access: D.acc, prog: D.prog });
    cta = D.resume ? `<a class="btn accent big" href="${D.resume.href}">Συνέχισε: ${esc(D.resume.title)} →</a><a class="btn big" href="#/me">Ο πίνακάς μου</a>`
      : `<a class="btn accent big" href="#/me">Ο πίνακάς μου →</a>`;
  }
  if (stale(tok)) return;
  const lead = isTeacher() && !homePreview() ? `Καλώς ήρθες ξανά, <b>${first}</b>! Οι ενότητές σου και η ζήτηση των μαθημάτων είναι στον πίνακά σου· εδώ όλος ο κατάλογος όπως τον βλέπουν οι χρήστες.`
    : `Καλώς ήρθες ξανά, <b>${first}</b>! Συνέχισε από εκεί που σταμάτησες ή εξερεύνησε όλο τον κατάλογο.`;
  app.innerHTML = pvBanner() + landingHTML(catHTML, { lead, cta });
  bindCatalog();
});
// «Ο πίνακάς μου»
route(/^\/me$/, async tok => {
  if (needLogin()) return;
  if (!me) await loadMe();
  return isTeacher() && !homePreview() ? teacherHome(tok) : studentHome(tok);
});

async function unreadPanel() {
  if (!F.messages) return '';
  const ms = await q(sb.from('messages').select('class_id,student_id,created_at,classes(name),student:profiles!messages_student_id_fkey(full_name)')
    .is('read_at', null).neq('sender_id', me.id).order('created_at', { ascending: false }));
  if (!ms.length) return '';
  const g = new Map();
  ms.forEach(m => { const k = m.class_id + '/' + m.student_id; if (!g.has(k)) g.set(k, { ...m, n: 0 }); g.get(k).n++; });
  return `<div class="panel" style="border-color:var(--orange)"><h2>Νέα μηνύματα</h2><ul class="list">${[...g.values()].map(m =>
    `<li><a class="item" href="#/c/${m.class_id}/chat${isTeacher() ? '/' + m.student_id : ''}"><span class="spacer"><b>${esc(isTeacher() ? (m.student?.full_name || '') : 'Από τον εκπαιδευτή')}</b><br><span class="muted small">${esc(m.classes?.name || '')} · ${fmtDay(m.created_at)}</span></span><span class="badge">${m.n}</span></a></li>`).join('')}</ul></div>`;
}

// θέση μιας ενότητας στον κατάλογο (τομέας, επίπεδο, όνομα, περιγραφή)
function catOf(classId, key) {
  for (const t of TRACKS) for (const [i, l] of t.levels.entries()) for (const c of l.courses)
    if ((classId && (c.classId === classId || c.linkedId === classId)) || (key && c.key === key)) return { c, t, i, l };
  return null;
}
// Ποια μαθήματα του καταλόγου έχουν ενότητα: RPC catalog_status (update_09). Ένα μάθημα εμφανίζεται «Διαθέσιμο»
// μόλις η ενότητά του (ανοιχτή) έχει τουλάχιστον ένα δημοσιευμένο μάθημα. Χωρίς το RPC → classId του catalog.js.
// Κάρτες μαθημάτων που φτιάχνει ο εκπαιδευτής από την Academy (πίνακας catalog_courses, update_12): μπαίνουν στο επίπεδο που διάλεξε
let customAt = 0;
async function loadCustom(force) {
  if (!TRACKS.length) return false;
  if (!force && customAt && Date.now() - customAt < 60000) return false;
  let rows = [], ov = {};
  try { const r = await sb.from('catalog_courses').select('*').order('created_at'); if (!r.error) rows = r.data || []; } catch (e) { }
  try { const r = await sb.from('catalog_overrides').select('*'); if (!r.error) (r.data || []).forEach(x => ov[x.key] = x); } catch (e) { }
  let trs = [];   // τομείς (σχολές) που φτιάχνει ο εκπαιδευτής από την Academy
  try { const r = await sb.from('catalog_tracks').select('*').order('created_at'); if (!r.error) trs = r.data || []; } catch (e) { }
  for (let i = TRACKS.length - 1; i >= 0; i--) if (TRACKS[i].custom) TRACKS.splice(i, 1);
  trs.forEach(x => TRACKS.push({ key: x.key, name: x.name, short: x.short_name || x.name, headline: x.headline || '', custom: true, levels: [0, 1, 2, 3].map(() => ({ tag: '', courses: [] })) }));
  customAt = Date.now();
  for (const t of TRACKS) t.levels.forEach((l, i) => {
    if (!l._base) l._base = l.courses.slice();
    l._base.forEach(c => {   // αλλαγές ονόματος/περιγραφής από την Academy υπερισχύουν του catalog.js
      if (!c._o) c._o = { name: c.name, desc: c.desc || '' };
      const o = ov[c.key]; c.name = o && o.name ? o.name : c._o.name; c.desc = o && o.description != null ? o.description : c._o.desc;
    });
    l.courses = l._base.concat(rows.filter(x => x.track_key === t.key && x.level_index === i)
      .map(x => ({ key: x.key, name: x.name, desc: x.description || '', classId: '', sims: [], custom: true, cid: x.id })));
  });
  return true;
}
let catStat = null, catStatAt = 0;
async function loadCatStatus(force) {
  if (!TRACKS.length) return;
  if (await loadCustom(force)) force = true;
  if (!force && catStat !== null && Date.now() - catStatAt < 60000) return;
  let rows = null;
  try { const r = await sb.rpc('catalog_status'); if (!r.error) rows = r.data || []; } catch (e) { }
  catStat = rows || false; catStatAt = Date.now();
  const st = {}; (rows || []).forEach(r => st[r.course_key] = r);
  for (const t of TRACKS) for (const l of t.levels) for (const c of l.courses) {
    if (c.staticId === undefined) c.staticId = c.classId || '';
    if (!rows) { c.classId = c.staticId; c.linkedId = c.staticId; c.nPub = null; continue; }
    const r = st[c.key];
    c.linkedId = r ? r.class_id : '';
    c.nPub = r ? r.lessons : 0;
    c.classId = r && r.lessons > 0 ? r.class_id : '';
  }
}
function classCards(list, extra) {
  if (!list.length) return '';
  return `<div class="grid">${list.map(c => `<a class="card" href="#/c/${c.id}"><h3>${esc(c.name)}</h3>
    ${c.description ? `<p class="muted small" style="margin:0 0 6px">${esc(c.description).slice(0, 160)}</p>` : ''}
    ${extra ? extra(c) : ''}</a>`).join('')}</div>`;
}

// ---------------------------------------------------------------- κατάλογος μαθημάτων (catalog.js)
// Διαθέσιμα μαθήματα (με ενότητα) + «Ετοιμάζεται» με προσομοιώσεις που υπάρχουν ήδη και «Ενημέρωσέ με».
const CAT = window.ACADEMY_CATALOG;
let simNames = null;
async function loadSimNames() {
  if (simNames) return simNames;
  try { simNames = Object.fromEntries((await (await fetch('sims.json')).json()).map(s => [s.id, s.t])); } catch (e) { simNames = {}; }
  return simNames;
}
async function myInterests() { try { return (await q(sb.from('course_interest').select('course_key').eq('user_id', me.id))).map(r => r.course_key); } catch (e) { return []; } }
async function interestCounts() {
  try { const c = {}; (await q(sb.from('course_interest').select('course_key'))).forEach(r => c[r.course_key] = (c[r.course_key] || 0) + 1); return c; } catch (e) { return {}; }
}
const NOTIFY_OFF = '🔔 Ενημέρωσέ με όταν ανοίξει', NOTIFY_ON = '✓ Θα ενημερωθείς';
// τομέας (track) που βλέπει ο χρήστης· θυμόμαστε την επιλογή του
const TRACKS = (CAT && CAT.tracks) || (CAT && (CAT.levels || CAT.semesters) ? [{ key: 'all', name: CAT.title, short: CAT.title, headline: 'Μάθε ψύξη & κλιματισμό', levels: CAT.levels || CAT.semesters }] : []);
let curTrack = (() => { try { return localStorage.getItem('csl-track') || ''; } catch (e) { return ''; } })();
const curT = () => TRACKS.find(t => t.key === curTrack) || TRACKS[0];
let catOpts = {};
async function catalogPanel(opts) {
  if (opts) catOpts = opts;
  if (!TRACKS.length) return '';
  await loadCatStatus();
  const T = curT(), LVN = (CAT && CAT.levelNames) || [];
  const lvName = (l, i) => (l && l.name) || LVN[i] || 'Επίπεδο ' + (i + 1);
  const names = await loadSimNames(), mine = new Set(catOpts.mine || []), counts = catOpts.counts || null;
  const acc = catOpts.access || null, pr = catOpts.prog || {}, extra = catOpts.extra || [], teach = catOpts.teach || null;
  const stateOf = c => !c.classId ? 'soon' : !acc ? 'open' : acc.has(c.classId) ? 'mine' : 'locked';
  // καρτέλα «Τα μαθήματά μου» (μόνο για συνδεδεμένο σπουδαστή)
  const allC = TRACKS.flatMap(t => t.levels.flatMap((l, i) => l.courses.map(c => ({ c, t, l, i }))));
  const nMyOpen = acc ? allC.filter(x => stateOf(x.c) === 'mine').length + extra.length : 0;
  const nWait = acc ? allC.filter(x => stateOf(x.c) === 'soon' && mine.has(x.c.key)).length : 0;
  const nDemand = teach && counts ? allC.filter(x => !x.c.classId && counts[x.c.key]).length : 0;
  // στην αρχική ανοίγει πρώτα η «δική μου» καρτέλα, εκτός αν ο χρήστης διάλεξε τομέα σε αυτή την επίσκεψη
  const isMine = catOpts.view === 'mine';   // «Ο πίνακάς μου»: μόνο τα δικά μου, ανά επίπεδο
  const card = (c, tag) => {
    if (teach && !tag) return teachCard(c);
    const open = !!c.classId, st = stateOf(c), sl = (c.sims || []).filter(k => names[k]);
    const sims = sl.slice(0, 2).map(k => `<a class="simlink" href="${esc(simHref(k))}" target="_blank" rel="noopener" title="${esc(names[k])}">◎ ${esc(names[k])}</a>`).join('')
      + (sl.length > 2 ? `<span class="simmore" title="${esc(sl.slice(2).map(k => names[k]).join(' · '))}">+${sl.length - 2}</span>` : '');
    const p = pr[c.classId] || { d: 0, t: 0 };
    const action = st === 'mine' ? `<a class="btn accent small" href="#/c/${esc(c.classId)}">${p.d && p.d === p.t ? 'Επανάληψη →' : p.d ? 'Συνέχισε →' : 'Ξεκίνα →'}</a>`
      : st === 'locked' ? `<button class="btn small joinlink">🔑 Έχω κωδικό τμήματος</button>`
      : open ? `<a class="btn accent small" href="${session ? '#/c/' + esc(c.classId) : '#/register'}">${session ? 'Ξεκίνα →' : 'Εγγραφή & ξεκίνα →'}</a>`
      : counts ? `<span class="pill info">🔔 ${counts[c.key] || 0} ενδιαφέρονται</span>`
      : session ? `<button class="btn small notify${mine.has(c.key) ? ' on' : ''}" data-k="${esc(c.key)}">${mine.has(c.key) ? NOTIFY_ON : NOTIFY_OFF}</button>`
      : `<a class="btn small" href="#/register">${NOTIFY_OFF}</a>`;
    const pill = tag && st === 'soon' && mine.has(c.key) ? '<span class="pill warn">🔔 Σε αναμονή</span>'
      : { mine: '<span class="pill ok">✓ Ανοιχτό για σένα</span>', locked: '<span class="pill info">🔒 Με κωδικό τμήματος</span>', open: '<span class="pill ok">Διαθέσιμο</span>', soon: '<span class="pill warn">Έρχεται σύντομα</span>' }[st];
    const bar = st === 'mine' && p.t ? progressBar(p.d, p.t, p.d === p.t ? '🎉 Ολοκληρώθηκε' : p.d ? 'Η πρόοδός σου' : 'Δεν ξεκίνησες ακόμη') : '';
    const href = st === 'mine' || (st === 'open' && session) ? `#/c/${esc(c.classId)}` : '';
    return `<div class="ccard${open ? ' open' : ''}${st === 'mine' ? ' mine' : ''}"${href ? ` data-href="${href}"` : ''}>${tag ? `<span class="mytag">${esc(tag)}</span>` : ''}${pill}
      <h3>${esc(c.name)}</h3><p class="muted small cdesc">${esc(c.desc || '')}</p>
      ${sims && !tag ? `<div class="simlinks"><span class="small muted">${open ? 'Προσομοιώσεις:' : 'Δοκίμασε ήδη τώρα:'}</span>${sims}</div>` : ''}
      ${bar}<div class="ccact">${action}</div></div>`;
  };
  // εκπαιδευτής: κάθε κάρτα του καταλόγου είναι επεξεργάσιμη (ενότητα του μαθήματος → μαθήματα & υλικό)
  const teachCard0 = c => {
    const k = teach.byKey[c.key] || teach.classes.find(x => x.id === c.linkedId || x.id === c.staticId);
    const nI = counts ? counts[c.key] || 0 : 0, intr = `<span class="pill info">🔔 ${nI} ενδιαφέρονται</span>`;
    if (k) {
      const nP = teach.pub[k.id] || 0, nA = teach.all[k.id] || 0;
      const pills = `${nP ? '<span class="pill ok">Διαθέσιμο στους χρήστες</span>' : '<span class="pill warn">Σε προετοιμασία</span>'}${k.is_open ? '' : `<span class="pill">Κλειστή · ${teach.cnt[k.id] || 0} μέλη</span>`}${teach.pc[k.id] ? `<span class="pill warn">${teach.pc[k.id]} προς βαθμολόγηση</span>` : ''}`;
      return `<div class="ccard open tcl${nP ? '' : ' prep'}" data-href="#/c/${esc(k.id)}"><div class="row" style="gap:6px">${pills}</div>
        <h3>${esc(c.name)}</h3><p class="muted small cdesc">${esc(c.desc || '')}</p>
        <p class="small muted tstat">📚 ${nA ? `${nP} δημοσιευμένα · ${nA - nP} πρόχειρα μαθήματα` : 'Δεν έχει μαθήματα ακόμη'} · ${intr}</p>
        <div class="ccact"><a class="btn accent small" href="#/c/${esc(k.id)}">Μαθήματα →</a><button class="btn small newl" data-c="${esc(k.id)}">+ Νέο μάθημα</button></div></div>`;
    }
    if (c.linkedId) return `<div class="ccard open" data-href="#/c/${esc(c.linkedId)}"><span class="pill ok">Διαθέσιμο</span><h3>${esc(c.name)}</h3><p class="muted small cdesc">${esc(c.desc || '')}</p>
        <p class="small muted tstat">Ενότητα άλλου εκπαιδευτή · ${intr}</p><div class="ccact"><a class="btn small" href="#/c/${esc(c.linkedId)}">Άνοιγμα →</a></div></div>`;
    return `<div class="ccard"><span class="pill">Χωρίς υλικό ακόμη</span><h3>${esc(c.name)}</h3><p class="muted small cdesc">${esc(c.desc || '')}</p>
        <p class="small muted tstat">${intr}</p>
        <div class="ccact"><button class="btn accent small mkcls" data-k="${esc(c.key)}">＋ Ξεκίνα την ενότητα</button></div></div>`;
  };
  const teachCard = c => { const h = teachCard0(c); return h.replace('<div class="ccact">', `<div class="ccact"><button class="btn small editcard" data-k="${esc(c.key)}" title="Επεξεργασία ονόματος και περιγραφής">✎</button>${c.custom ? `<button class="btn small delcard" data-k="${esc(c.key)}" title="Διαγραφή κάρτας">🗑</button>` : ''}`); };
  const section = (num, title, sub, cards, act) => `<section class="lvl"><div class="lvlhead"><span class="lvlnum">${num}</span><div class="spacer"><h3>${esc(title)}</h3>${sub ? `<p class="muted small">${esc(sub)}</p>` : ''}</div>
      ${act || ''}<span class="lvlnav"><button class="btn small" data-d="-1" aria-label="Προηγούμενα">‹</button><button class="btn small" data-d="1" aria-label="Επόμενα">›</button></span></div>
      <div class="rail">${cards}</div></section>`;
  const lg = (cls, label, txt) => `<span class="lgi"><span class="pill ${cls}">${label}</span> ${txt}</span>`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  let body;
  if (isMine && teach) {
    // εκπαιδευτής: οι ενότητές του ανά επίπεδο + μαθήματα του καταλόγου με ζήτηση
    const tcard = (k, tag) => {
      const m = catOf(k.id);
      const pills = `${k.is_open ? '<span class="pill ok">Ανοιχτή σε όλους</span>' : `<span class="pill">Κλειστή · ${teach.cnt[k.id] || 0} μέλη</span>`}${teach.pc[k.id] ? `<span class="pill warn">${teach.pc[k.id]} προς βαθμολόγηση</span>` : ''}${k.archived ? '<span class="pill">Αρχειοθετημένο</span>' : ''}`;
      return `<div class="ccard open tcl" data-href="#/c/${esc(k.id)}">${tag ? `<span class="mytag">${esc(tag)}</span>` : ''}<div class="row" style="gap:6px">${pills}</div>
        <h3>${esc(m ? m.c.name : k.name)}</h3><p class="muted small cdesc">${esc((m && m.c.desc) || k.description || '')}</p>
        <div class="ccact"><a class="btn accent small" href="#/c/${esc(k.id)}">Μαθήματα →</a><button class="btn small newl" data-c="${esc(k.id)}">+ Νέο μάθημα</button></div></div>`;
    };
    const L = [], other = [];
    teach.classes.forEach(k => { const m = catOf(k.id); if (m) (L[m.i] = L[m.i] || []).push({ k, m }); else other.push(k); });
    const dem = []; allC.forEach(x => { if (!x.c.classId && counts && counts[x.c.key]) (dem[x.i] = dem[x.i] || []).push(x); });
    dem.forEach(xs => xs && xs.sort((a, b) => counts[b.c.key] - counts[a.c.key]));
    const nLv = Math.max(L.length, dem.length);
    let secs = '';
    for (let i = 0; i < nLv; i++) {
      const a = L[i] || [], d = dem[i] || []; if (!a.length && !d.length) continue;
      const lv = (a[0] && a[0].m.l) || (d[0] && d[0].l);
      secs += section(i + 1, lvName(lv, i), `${plural(a.length, 'ενότητα', 'ενότητες')} · ${d.length} με ζήτηση`,
        a.map(x => tcard(x.k, `${x.m.t.short || x.m.t.name} · ${lvName(x.m.l, x.m.i)}`)).join('') + d.map(x => card(x.c, `${x.t.short || x.t.name} · ${lvName(x.l, x.i)}`)).join(''));
    }
    if (other.length) secs += section('+', 'Άλλες ενότητες', 'Εκτός καταλόγου', other.map(k => tcard(k, '')).join(''));
    body = `<div class="row between"><h2 style="margin:0">Οι ενότητές μου</h2><span class="pill">${plural(teach.classes.length, 'ενότητα', 'ενότητες')} · ${nDemand} μαθήματα με ζήτηση</span></div>
    <p class="muted small" style="margin:4px 0 0">Οι ενότητές σας ανά επίπεδο και, δίπλα τους, τα μαθήματα του καταλόγου που ζήτησαν οι χρήστες («🔔 N ενδιαφέρονται»). Ποιοι ακριβώς: 📊 Στατιστικά.</p>
    ${secs || `<div class="empty" style="margin-top:14px">Δεν έχετε ενότητες ακόμη. Φτιάξτε την πρώτη με «+ Ενότητα εκτός καταλόγου» ή από μια κάρτα του καταλόγου.</div>`}`;
  } else if (isMine) {
    const L = [];
    allC.forEach(x => { const st = stateOf(x.c); if (st === 'mine' || (st === 'soon' && mine.has(x.c.key))) (L[x.i] = L[x.i] || []).push({ ...x, st }); });
    L.forEach(xs => xs && xs.sort((a, b) => (a.st === 'mine' ? 0 : 1) - (b.st === 'mine' ? 0 : 1)));
    const secs = L.map((xs, i) => xs && xs.length ? section(i + 1, lvName(xs[0].l, i),
      `${plural(xs.filter(x => x.st === 'mine').length, 'ανοιχτό', 'ανοιχτά')} · ${xs.filter(x => x.st !== 'mine').length} σε αναμονή`,
      xs.map(x => card(x.c, `${x.t.short || x.t.name} · ${lvName(x.l, x.i)}`)).join('')) : '').join('')
      + (extra.length ? section('+', 'Άλλες ενότητες', 'Ενότητες του εκπαιδευτή σου εκτός καταλόγου',
        extra.map(k => card({ key: 'x-' + k.id, name: k.name, classId: k.id, desc: k.description || '', sims: [] }, 'Ενότητα')).join('')) : '');
    body = `<div class="row between"><h2 style="margin:0">Τα μαθήματά μου</h2><span class="pill">${plural(nMyOpen, 'ανοιχτό', 'ανοιχτά')} · ${nWait} σε αναμονή</span></div>
    <p class="muted small" style="margin:4px 0 0">Τα μαθήματα που είναι ανοιχτά για σένα και όσα ζήτησες να ενημερωθείς, ανά επίπεδο. Όλη η ύλη: <a href="#/">Academy → κατάλογος</a>.</p>
    <div class="catlegend small">${lg('ok', '✓ Ανοιχτό για σένα', 'παρακολούθησέ το τώρα')}${lg('warn', '🔔 Σε αναμονή', 'θα σε ενημερώσουμε όταν ανοίξει')}</div>
    ${secs || `<div class="empty" style="margin-top:14px">Δεν έχεις ακόμη μαθήματα εδώ. Δες τον <a href="#/">κατάλογο</a> και πάτα «🔔 Ενημέρωσέ με» στα μαθήματα που σε ενδιαφέρουν.</div>`}`;
  } else {
    const all = T.levels.flatMap(l => l.courses), nOpen = all.filter(c => c.classId).length;
    const nMine = acc ? all.filter(c => stateOf(c) === 'mine').length : 0, nLock = acc ? all.filter(c => stateOf(c) === 'locked').length : 0;
    const nLinked = teach ? all.filter(c => teach.byKey[c.key] || c.linkedId).length : 0;
    const summary = teach ? `${nLinked} με ενότητα · ${all.length - nLinked} χωρίς υλικό ακόμη` : acc ? [nMine ? `${plural(nMine, 'ανοιχτό', 'ανοιχτά')} για σένα` : '', nLock ? `${nLock} με κωδικό` : '', `${all.length - nOpen} έρχονται σύντομα`].filter(Boolean).join(' · ')
      : `${nOpen} διαθέσιμα · ${all.length - nOpen} έρχονται σύντομα`;
    const legend = teach ? `<div class="catlegend small">${lg('ok', 'Διαθέσιμο στους χρήστες', 'έχει δημοσιευμένα μαθήματα')}${lg('warn', 'Σε προετοιμασία', 'η ενότητα υπάρχει, δεν έχει ακόμη δημοσιευμένο μάθημα')}${lg('', 'Χωρίς υλικό ακόμη', '«＋ Ξεκίνα την ενότητα» για να την ετοιμάσεις')}</div>`
      : acc ? `<div class="catlegend small">${lg('ok', '✓ Ανοιχτό για σένα', 'μπορείς να το παρακολουθήσεις τώρα')}${nLock ? lg('info', '🔒 Με κωδικό τμήματος', 'θέλει κωδικό από τον εκπαιδευτή') : ''}${lg('warn', 'Έρχεται σύντομα', 'πάτα 🔔 για να ενημερωθείς')}</div>` : '';
    body = `${acc || teach ? `<p class="catkick">${teach ? 'Όλος ο κατάλογος — πατήστε ένα μάθημα για να το εμπλουτίσετε' : 'Κατάλογος μαθημάτων'}</p>` : ''}
    <div class="row between"><h2 style="margin:0">${esc(T.name)}</h2><span class="row" style="gap:6px">${teach && T.custom ? `<button class="btn small edittrack" data-k="${esc(T.key)}">✎ Τομέας</button><button class="btn small deltrack" data-k="${esc(T.key)}" title="Διαγραφή τομέα">🗑</button>` : ''}<span class="pill">${summary}</span></span></div>
    <p class="muted" style="margin:6px 0 0">${all.length} μαθήματα σε ${T.levels.length} επίπεδα, από τα βασικά ως το επαγγελματικό.</p>${legend}
    ${T.levels.map((l, i) => section(i + 1, lvName(l, i), l.tag || '', l.courses.map(c => card(c)).join(''), teach ? `<button class="btn small addcard" data-t="${esc(T.key)}" data-i="${i}">＋ Νέα κάρτα</button>` : '')).join('')}`;
  }
  const vis = teach ? TRACKS : TRACKS.filter(t => !t.custom || t.levels.some(l => l.courses.length));   // οι κενοί νέοι τομείς φαίνονται μόνο στον εκπαιδευτή
  const tabs = !isMine && (vis.length > 1 || teach) ? `<nav class="ttabs" role="tablist" aria-label="Τομέας">${vis.map(t => {
      const n = t.levels.reduce((a, l) => a + l.courses.length, 0), on = !isMine && t === T;
      return `<button role="tab" class="ttab${on ? ' on' : ''}" aria-selected="${on}" data-t="${esc(t.key)}"><b>${esc(t.short || t.name)}</b><span>${n} μαθήματα</span></button>`; }).join('')}${teach ? '<button class="ttab addtrack"><b>＋ Νέος τομέας</b><span>σχολή / κατεύθυνση</span></button>' : ''}</nav>` : '';
  if (isMine) return `<div class="panel" id="catalog">${body}</div>`;
  return `<div class="panel catalog${tabs ? ' hastabs' : ''}" id="catalog">${tabs}<div class="tbody">${body}</div></div>`;
}
// «＋ Ξεκίνα την ενότητα»: φτιάχνει την ενότητα ενός μαθήματος του καταλόγου (course_key) και ανοίγει τη σελίδα της
async function newCourseClass(key, btn) {
  const m = catOf(null, key); if (!m) return;
  if (!confirm(`Να δημιουργηθεί η ενότητα «${m.c.name}»;\n\nΘα είναι ανοιχτή σε όλους, αλλά οι χρήστες θα τη βλέπουν μόνο όταν δημοσιεύσετε το πρώτο μάθημα.`)) return;
  if (btn) btn.disabled = true;
  try {
    const c = await q(sb.from('classes').insert({ name: m.c.name, description: m.c.desc || '', is_open: true, owner: me.id, course_key: key }).select().single());
    await loadCatStatus(true); toast('Η ενότητα δημιουργήθηκε. Προσθέστε το πρώτο μάθημα.'); go('#/c/' + c.id);
  } catch (er) {
    const t = String(er && (er.message || er)).toLowerCase();
    toast(t.includes('course_key') && !t.includes('duplicate') ? 'Τρέξτε πρώτα το update_09_catalog_link.sql στο Supabase.' : t.includes('duplicate') ? 'Υπάρχει ήδη ενότητα για αυτό το μάθημα.' : errText(er), true);
  } finally { if (btn) btn.disabled = false; }
}
async function newLesson(cid) {
  try {
    const { count } = await sb.from('lessons').select('id', { count: 'exact', head: true }).eq('class_id', cid);
    const l = await q(sb.from('lessons').insert({ class_id: cid, title: 'Νέο μάθημα', position: (count || 0) + 1 }).select().single());
    go(`#/c/${cid}/lesson/${l.id}/edit`);
  } catch (er) { toast(errText(er), true); }
}
// προσωπικός χώρος: sidebar (Ο πίνακάς μου / Στατιστικά / Ρυθμίσεις)
function meLayout(on, inner, cls) {
  const T = isTeacher() && !homePreview(), first = (me.full_name || '?').split(' ')[0];
  const items = [['dash', '#/me', '🏠', 'Ο πίνακάς μου']].concat(T ? [['stats', '#/me/stats', '📊', 'Στατιστικά']] : [], [['set', '#/me/settings', '⚙️', 'Ρυθμίσεις']]);
  return `<div class="mewrap${cls ? ' ' + cls : ''}"><aside class="side" aria-label="Ο λογαριασμός μου"><div class="who"><span class="av">${esc(first[0].toUpperCase())}</span><div><b>${esc(first)}</b><small>${T ? 'Εκπαιδευτής' : 'Σπουδαστής'}</small></div></div>
    ${items.map(([k, h, i, t]) => `<a class="${k === on ? 'on' : ''}" href="${h}"${k === on ? ' aria-current="page"' : ''}>${i} ${t}</a>`).join('')}</aside><div class="mebody">${inner}</div></div>`;
}
const pvBanner = () => homePreview() ? `<div class="msg warn row between" style="margin-bottom:12px"><span>👁 <b>Προβολή ως χρήστης</b> — βλέπετε όπως ένας χρήστης (μόνο ανοιχτές ενότητες, χωρίς πρόχειρα). Η πρόοδος είναι η δική σας.</span><span class="row"><button class="btn small" id="prev-exit">Έξοδος προβολής</button></span></div>` : '';
// δεδομένα σπουδαστή: ενότητες, πρόοδος, δηλώσεις, «συνέχισε»
async function studentBase() {
  await loadCatStatus();
  const [lessons, myProg, classes, mine] = await Promise.all([
    q(sb.from('lessons').select('id,class_id,title,position').eq('published', true)),
    q(sb.from('lesson_progress').select('lesson_id,class_id,completed_at').eq('user_id', me.id)),
    q(sb.from('classes').select('id,name,description,is_open,archived').order('created_at')),
    myInterests()]);
  if (homePreview()) classes.splice(0, classes.length, ...classes.filter(c => c.is_open && !c.archived));
  const tot = {}, dn = {}; lessons.forEach(l => tot[l.class_id] = (tot[l.class_id] || 0) + 1);
  const pubIds = new Set(lessons.map(l => l.id)); myProg.filter(p => pubIds.has(p.lesson_id)).forEach(p => dn[p.class_id] = (dn[p.class_id] || 0) + 1);
  const prog = {}; classes.forEach(c => prog[c.id] = { d: dn[c.id] || 0, t: tot[c.id] || 0 });
  const extra = classes.filter(c => !catOf(c.id) && !c.archived);
  let resume = null; const cids = new Set(classes.map(c => c.id));
  for (const p of myProg.filter(p => pubIds.has(p.lesson_id) && cids.has(p.class_id)).sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0))) {
    const cid = p.class_id; if ((dn[cid] || 0) >= (tot[cid] || 0)) continue;
    const doneSet = new Set(myProg.filter(x => x.class_id === cid).map(x => x.lesson_id));
    const next = lessons.filter(l => l.class_id === cid && !doneSet.has(l.id)).sort((a, b) => a.position - b.position)[0];
    if (!next) continue;
    const m = catOf(cid);
    resume = { href: `#/c/${cid}/lesson/${next.id}`, title: next.title, cname: m ? m.c.name : (classes.find(c => c.id === cid) || {}).name || '', d: dn[cid] || 0, t: tot[cid] };
    break;
  }
  return { classes, acc: new Set(classes.map(c => c.id)), prog, extra, mine, resume };
}
// δημιουργία / επεξεργασία / διαγραφή κάρτας μαθήματος του καταλόγου (μόνο εκπαιδευτής)
async function refreshCatalog() {
  await loadCatStatus(true); const html = await catalogPanel(); const old = $('#catalog'); if (old) { old.outerHTML = html; bindCatalog(); }
}
const cardErr = er => /catalog_(courses|overrides|tracks)/i.test(String(er && (er.message || er))) ? 'Τρέξτε πρώτα το update_12_catalog_courses.sql και update_13_catalog_overrides.sql και update_14_catalog_tracks.sql στο Supabase.' : errText(er);
async function editCard(key, trackKey, lvl) {
  const m = key ? catOf(null, key) : null, row = m && m.c;
  const name = prompt(row ? 'Όνομα μαθήματος:' : 'Όνομα του νέου μαθήματος (θα μπει στο επίπεδο που πατήσατε):', row ? row.name : ''); if (name === null || !name.trim()) return;
  const desc = prompt('Σύντομη περιγραφή (προαιρετική):', row ? row.desc : ''); if (desc === null) return;
  try {
    if (row && !row.custom) {   // κάρτα του catalog.js: αποθηκεύουμε αλλαγή στη βάση (ή την αφαιρούμε αν επανήλθε η αρχική)
      if (name.trim() === row._o.name && desc.trim() === row._o.desc) await q(sb.from('catalog_overrides').delete().eq('key', row.key));
      else await q(sb.from('catalog_overrides').upsert({ key: row.key, name: name.trim(), description: desc.trim() }));
    }
    else if (row) await q(sb.from('catalog_courses').update({ name: name.trim(), description: desc.trim() }).eq('id', row.cid));
    else await q(sb.from('catalog_courses').insert({ key: 'c-' + Date.now().toString(36), track_key: trackKey, level_index: lvl, name: name.trim(), description: desc.trim() }));
    await refreshCatalog(); toast(row ? 'Η κάρτα ενημερώθηκε.' : 'Η κάρτα προστέθηκε. Πατήστε «＋ Ξεκίνα την ενότητα» για να την ετοιμάσετε.');
  } catch (er) { toast(cardErr(er), true); }
}
async function editTrack(key) {
  const t = key ? TRACKS.find(x => x.key === key) : null;
  const name = prompt(t ? 'Όνομα τομέα:' : 'Όνομα του νέου τομέα (π.χ. Μηχανικοί οχημάτων):', t ? t.name : ''); if (name === null || !name.trim()) return;
  const short = prompt('Σύντομο όνομα για την καρτέλα στα αριστερά (π.χ. Οχήματα):', t ? t.short : name.trim().slice(0, 24)); if (short === null) return;
  try {
    if (t) await q(sb.from('catalog_tracks').update({ name: name.trim(), short_name: short.trim() || name.trim() }).eq('key', t.key));
    else { const k = 't-' + Date.now().toString(36); await q(sb.from('catalog_tracks').insert({ key: k, name: name.trim(), short_name: short.trim() || name.trim(), headline: 'Μάθε ' + name.trim().toLowerCase() })); curTrack = k; try { localStorage.setItem('csl-track', k); } catch (e) { } }
    await refreshCatalog(); toast(t ? 'Ο τομέας ενημερώθηκε.' : 'Ο τομέας προστέθηκε. Πατήστε «＋ Νέα κάρτα» σε κάθε επίπεδο.');
  } catch (er) { toast(cardErr(er), true); }
}
async function delTrack(key) {
  const t = TRACKS.find(x => x.key === key); if (!t || !t.custom) return;
  const n = t.levels.reduce((a, l) => a + l.courses.length, 0);
  if (!confirm(`Να διαγραφεί ο τομέας «${t.name}»` + (n ? ` και οι ${n} κάρτες του;\n\nΟι ενότητες και τα μαθήματά τους ΔΕΝ διαγράφονται· θα εμφανίζονται στις «Άλλες ενότητες».` : ';'))) return;
  try {
    await q(sb.from('catalog_courses').delete().eq('track_key', key)); await q(sb.from('catalog_tracks').delete().eq('key', key));
    if (curTrack === key) { curTrack = ''; try { localStorage.removeItem('csl-track'); } catch (e) { } }
    await refreshCatalog(); toast('Ο τομέας διαγράφηκε.');
  } catch (er) { toast(cardErr(er), true); }
}
async function delCard(key) {
  const m = catOf(null, key); if (!m || !m.c.custom) return;
  if (!confirm(`Να διαγραφεί η κάρτα «${m.c.name}» από τον κατάλογο;` + (m.c.linkedId ? '\n\nΗ ενότητά της και τα μαθήματά της ΔΕΝ διαγράφονται· θα εμφανίζεται στις «Άλλες ενότητες».' : ''))) return;
  try { await q(sb.from('catalog_courses').delete().eq('id', m.c.cid)); await refreshCatalog(); toast('Η κάρτα διαγράφηκε.'); }
  catch (er) { toast(cardErr(er), true); }
}
function bindCatalog() {
  $$('#catalog .ttab:not(.addtrack)').forEach(b => b.onclick = async () => {
    curTrack = b.dataset.t; try { localStorage.setItem('csl-track', curTrack); } catch (e) { }
    const html = await catalogPanel(); const old = $('#catalog'); if (!old) return;
    old.outerHTML = html; const h = $('#lhHead'); if (h) h.textContent = curT().headline || '';
    bindCatalog();
  });
  $$('#catalog .lvl').forEach(sec => {
    const rail = $('.rail', sec), nav = $('.lvlnav', sec);
    const upd = () => { nav.hidden = rail.scrollWidth <= rail.clientWidth + 4; };
    $$('button', nav).forEach(b => b.onclick = () => rail.scrollBy({ left: +b.dataset.d * Math.max(260, rail.clientWidth * .8), behavior: 'smooth' }));
    upd(); window.addEventListener('resize', upd);
  });
  $$('#catalog .ccard[data-href]').forEach(el => el.onclick = e => { if (!e.target.closest('a,button')) go(el.dataset.href); });
  $$('#catalog button.newl').forEach(b => b.onclick = () => newLesson(b.dataset.c));
  $$('#catalog button.addtrack').forEach(b => b.onclick = () => editTrack(null));
  $$('#catalog button.edittrack').forEach(b => b.onclick = () => editTrack(b.dataset.k));
  $$('#catalog button.deltrack').forEach(b => b.onclick = () => delTrack(b.dataset.k));
  $$('#catalog button.addcard').forEach(b => b.onclick = () => editCard(null, b.dataset.t, +b.dataset.i));
  $$('#catalog button.editcard').forEach(b => b.onclick = () => editCard(b.dataset.k));
  $$('#catalog button.delcard').forEach(b => b.onclick = () => delCard(b.dataset.k));
  $$('#catalog button.mkcls').forEach(b => b.onclick = () => newCourseClass(b.dataset.k, b));
  $$('#catalog .joinlink').forEach(b => b.onclick = () => {
    const d = $('#joinbox'); if (!d) { try { sessionStorage.setItem('csl-openjoin', '1'); } catch (e) { } return go('#/me'); } d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => d.querySelector('input')?.focus(), 300);
  });
  $$('#catalog button.notify').forEach(b => b.onclick = async () => {
    if (homePreview()) { toast('Σε προβολή ως χρήστης το «Ενημέρωσέ με» δεν αποθηκεύεται.'); return; }
    const k = b.dataset.k, on = b.classList.contains('on'); b.disabled = true;
    try {
      if (on) await q(sb.from('course_interest').delete().eq('user_id', me.id).eq('course_key', k));
      else await q(sb.from('course_interest').insert({ user_id: me.id, course_key: k }));
      const m = new Set(catOpts.mine || []); on ? m.delete(k) : m.add(k); catOpts.mine = [...m];
      $$(`#catalog button.notify[data-k="${k}"]`).forEach(x => { x.classList.toggle('on', !on); x.textContent = on ? NOTIFY_OFF : NOTIFY_ON; });
      if (!on) toast('Θα ενημερωθείς όταν ανοίξει το μάθημα.');
      if (catOpts.view === 'mine') { const html = await catalogPanel(); const old = $('#catalog'); if (old) { old.outerHTML = html; bindCatalog(); } }
    } catch (er) { toast(errText(er), true); } finally { b.disabled = false; }
  });
}

const ICO = {
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>',
  cap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/><path d="M22 9v6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>',
  flake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M12 2l-2 2M12 2l2 2M12 22l-2-2M12 22l2-2"/></svg>'
};
function landingHTML(catHTML, who) {
  return `<div class="land">
  <section class="lhero">
    <div class="lhtext">
      <span class="lhkicker">${ICO.flake}Cooling Systems Lab Academy</span>
      <h1><span class="hbar" id="lhHead">${esc((curT() || {}).headline || 'Μάθε ψύξη & κλιματισμό')}</span></h1>
      ${who ? `<p class="lhlead">${who.lead}</p>` : `<p class="lhlead"><b class="orange">Δωρεάν</b> μαθήματα με τον δικό σου ρυθμό, δεμένα με τις διαδραστικές προσομοιώσεις του Cooling Systems Lab.</p>`}
      <ul class="ticks"><li>Βίντεο ανακεφαλαίωσης σε κάθε μάθημα</li><li>Φύλλα εργασίας με λύσεις</li><li>Διαδραστικές ασκήσεις για το σπίτι ή την τάξη</li><li>Αυτοέλεγχος και η πρόοδός σου σε κάθε βήμα</li></ul>
    </div>
    <div class="lhimg"><img src="img/hero_photo.jpg" alt="Εκπαιδευτής και σπουδαστής μπροστά σε ψυκτική μονάδα">
      <span class="lsticker"><small>100%</small>ΔΩΡΕΑΝ</span>
      <div class="lhcta">${who ? who.cta : `<a class="btn accent big" href="#/register">Δωρεάν εγγραφή</a><a class="btn big" href="#/login"><span class="lg">Έχω ήδη λογαριασμό</span><span class="sm">Σύνδεση</span></a>`}</div>
    </div>
  </section>
  ${catHTML}
</div>`;
}

async function studentHome(tok) {
  const [D, asgs, subs, anns] = await Promise.all([studentBase(),
    F.assignments ? q(sb.from('assignments').select('id,title,due_at,class_id,allow_late,classes(name)').order('due_at', { ascending: true, nullsFirst: false })) : none(),
    F.assignments ? q(sb.from('submissions').select('assignment_id,status,points,graded_at,feedback,assignments(title,max_points,class_id)').eq('student_id', me.id)) : none(),
    F.announcements ? q(sb.from('announcements').select('id,title,created_at,class_id,classes(name)').order('created_at', { ascending: false }).limit(5)) : none()]);
  const unreadHTML = await unreadPanel();
  const catHTML = await catalogPanel({ view: 'mine', mine: D.mine, access: D.acc, prog: D.prog, extra: D.extra });
  if (stale(tok)) return;
  const R = D.resume, resume = R ? `<a class="resume" href="${R.href}"><div class="rt"><small>Συνέχισε από εκεί που σταμάτησες</small><b>${esc(R.cname)} — ${esc(R.title)}</b>${progressBar(R.d, R.t, 'Η πρόοδός σου')}</div><span class="btn accent">Συνέχισε →</span></a>` : '';
  const done = new Set(subs.map(s => s.assignment_id));
  const todo = asgs.filter(a => !done.has(a.id));
  const graded = subs.filter(s => s.status === 'returned').sort((a, b) => new Date(b.graded_at) - new Date(a.graded_at)).slice(0, 5);
  const panels = [
    F.assignments ? `<div class="panel"><h2>Εκκρεμείς εργασίες</h2>
      ${todo.length ? `<ul class="list">${todo.map(a => `<li><a class="item" href="#/c/${a.class_id}/asg/${a.id}"><span class="spacer"><b>${esc(a.title)}</b><br><span class="muted small">${esc(a.classes?.name || '')}</span></span>${duePill(a)}</a></li>`).join('')}</ul>` : `<p class="muted">Καμία εκκρεμότητα.</p>`}
    </div>` : '',
    unreadHTML,
    F.assignments ? `<div class="panel"><h2>Ανατροφοδότηση</h2>
      ${graded.length ? `<ul class="list">${graded.map(s => `<li><a class="item" href="#/c/${s.assignments.class_id}/asg/${s.assignment_id}"><span class="spacer">${esc(s.assignments.title)}</span><span class="pill ok">${s.points != null ? num(s.points) + '/' + num(s.assignments.max_points) : 'Σχόλια'}</span></a></li>`).join('')}</ul>` : `<p class="muted small">Δεν υπάρχει ακόμη.</p>`}
    </div>` : '',
    F.announcements ? `<div class="panel"><h2>Ανακοινώσεις</h2>
      ${anns.length ? `<ul class="list">${anns.map(a => `<li><a class="item" href="#/c/${a.class_id}/ann"><span class="spacer"><b>${esc(a.title)}</b><br><span class="muted small">${esc(a.classes?.name || '')} · ${fmtDay(a.created_at)}</span></span></a></li>`).join('')}</ul>` : `<p class="muted small">Καμία ανακοίνωση.</p>`}
    </div>` : ''].filter(Boolean);
  app.innerHTML = meLayout('dash', `${pvBanner()}<h1 style="margin-top:0">Ο πίνακάς μου</h1>
  ${resume}
  ${panels.length ? `<div class="${panels.length > 1 ? 'two' : ''}">${panels.join('')}</div>` : ''}
  ${catHTML}
  <details id="joinbox" class="joinbox"><summary class="muted small">Έχεις κωδικό τμήματος από τον εκπαιδευτή σου;</summary>
    <form class="row" id="join" style="margin-top:8px"><input class="inp" name="code" placeholder="Κωδικός ενότητας" maxlength="12" style="max-width:220px;text-transform:uppercase" required><button class="btn">Είσοδος</button></form></details>`);
  if (catHTML) bindCatalog();
  try { if (sessionStorage.getItem('csl-openjoin')) { sessionStorage.removeItem('csl-openjoin'); const d = $('#joinbox'); d.open = true; d.scrollIntoView({ block: 'center' }); d.querySelector('input').focus(); } } catch (e) { }
  $('#join').onsubmit = async e => {
    e.preventDefault();
    try { const cid = await q(sb.rpc('join_class', { code: e.target.code.value })); toast('Αποκτήσατε πρόσβαση στην ενότητα.'); go('#/c/' + cid); }
    catch (er) { toast(errText(er), true); }
  };
}

function duePill(a, sub) {
  if (sub) {
    if (sub.status === 'returned') return `<span class="pill ok">Βαθμολογήθηκε${sub.points != null && a.max_points ? ' · ' + num(sub.points) + '/' + num(a.max_points) : ''}</span>`;
    const late = a.due_at && new Date(sub.submitted_at) > new Date(a.due_at);
    return `<span class="pill ${late ? 'warn' : 'info'}">Υποβλήθηκε${late ? ' (εκπρόθεσμα)' : ''}</span>`;
  }
  if (!a.due_at) return `<span class="pill">Χωρίς προθεσμία</span>`;
  const d = new Date(a.due_at), now = new Date();
  if (d < now) return `<span class="pill bad">Έληξε ${fmtDay(d)}</span>`;
  const days = (d - now) / 864e5;
  return `<span class="pill ${days < 3 ? 'warn' : ''}">Έως ${fmtDate(d)}</span>`;
}

async function teacherHome(tok) {
  const [classes, enr, pend] = await Promise.all([
    q(sb.from('classes').select('*').eq('owner', me.id).order('archived').order('created_at', { ascending: false })),
    q(sb.from('enrollments').select('class_id')),
    F.assignments ? q(sb.from('submissions').select('id,assignment_id,submitted_at,profiles(full_name),assignments(title,class_id)').is('graded_at', null).order('submitted_at')) : none()]);
  const unreadHTML = await unreadPanel();
  const cnt = {}; enr.forEach(e => cnt[e.class_id] = (cnt[e.class_id] || 0) + 1);
  const pc = {}; pend.forEach(p => pc[p.assignments.class_id] = (pc[p.assignments.class_id] || 0) + 1);
  const [counts, ov, ls] = await Promise.all([interestCounts(), sb.rpc('admin_overview').then(r => r.data || null, () => null),
    classes.length ? q(sb.from('lessons').select('class_id,published').in('class_id', classes.map(c => c.id))) : none()]);
  const pub = {}, all = {}; ls.forEach(l => { all[l.class_id] = (all[l.class_id] || 0) + 1; if (l.published) pub[l.class_id] = (pub[l.class_id] || 0) + 1; });
  const byKey = {}; classes.forEach(c => { if (c.course_key) byKey[c.course_key] = c; });
  const catHTML = await catalogPanel({ counts, teach: { classes, cnt, pc, pub, all, byKey } });
  if (stale(tok)) return;
  // ενότητες εκτός καταλόγου
  const other = classes.filter(c => !c.course_key && !catOf(c.id));
  const otherHTML = other.length ? `<div class="panel"><h2 style="margin-top:0">Άλλες ενότητες</h2><p class="muted small" style="margin:0 0 6px">Ενότητες που δεν αντιστοιχούν σε μάθημα του καταλόγου.</p>
    <div class="rail" style="flex-wrap:wrap;overflow:visible">${other.map(k => `<div class="ccard open tcl" data-href="#/c/${esc(k.id)}"><div class="row" style="gap:6px">${k.is_open ? '<span class="pill ok">Ανοιχτή σε όλους</span>' : `<span class="pill">Κλειστή · ${cnt[k.id] || 0} μέλη</span>`}${k.archived ? '<span class="pill">Αρχειοθετημένο</span>' : ''}</div>
      <h3>${esc(k.name)}</h3><p class="muted small cdesc">${esc(k.description || '')}</p><p class="small muted tstat">📚 ${pub[k.id] || 0} δημοσιευμένα · ${(all[k.id] || 0) - (pub[k.id] || 0)} πρόχειρα</p>
      <div class="ccact"><a class="btn accent small" href="#/c/${esc(k.id)}">Μαθήματα →</a><button class="btn small newl" data-c="${esc(k.id)}">+ Νέο μάθημα</button></div></div>`).join('')}</div></div>` : '';
  const nDecl = Object.values(counts).reduce((a, b) => a + b, 0), nDC = Object.keys(counts).length, k = ov && ov.kpi;
  const tiles = `<div class="tiles sm">${k ? tile(k.users, 'χρήστες', `+${k.new7} σε 7 μέρες`) + tile(k.active7, 'ενεργοί (7 ημέρες)') : ''}${tile(nDecl, 'δηλώσεις 🔔', nDC ? `σε ${nDC} μαθήματα` : '')}${F.assignments ? tile(pend.length, 'προς βαθμολόγηση') : (k ? tile(k.completions, 'ολοκληρώσεις μαθημάτων') : '')}</div>`;
  const panels = [unreadHTML, F.assignments ? `<div class="panel"><h2>Προς βαθμολόγηση</h2>
    ${pend.length ? `<ul class="list">${pend.slice(0, 12).map(p => `<li><a class="item" href="#/c/${p.assignments.class_id}/asg/${p.assignment_id}/grade/${p.id}"><span class="spacer"><b>${esc(p.profiles?.full_name || '')}</b><br><span class="muted small">${esc(p.assignments.title)} · ${fmtDay(p.submitted_at)}</span></span></a></li>`).join('')}</ul>` : `<p class="muted small">Όλα βαθμολογημένα.</p>`}
  </div>` : ''].filter(Boolean);
  const acts = `<div class="tacts"><button class="btn" id="prev-home">👁 Προβολή ως χρήστης</button><a class="btn accent" href="#/new-class" title="Για κλειστά τμήματα ή υλικό που δεν ανήκει σε κάρτα του καταλόγου">+ Ενότητα εκτός καταλόγου</a></div>`;
  app.innerHTML = meLayout('dash', `<div class="thero" style="background-image:url(img/hero_teacher_bg.jpg)"><div class="thtxt"><div class="thbrand"><span>❄</span> Cooling Systems Lab Academy</div><h1 class="thbadge">Πίνακας καθηγητή</h1><p class="thhi">Καλώς ήρθες ξανά, <b>${esc((me.full_name || '').split(' ')[0])}</b>!</p><p class="thlead">Όλα τα εργαλεία που χρειάζεσαι για να οργανώσεις και να υποστηρίξεις τα μαθήματά σου.</p><ul class="thul"><li>Διαχείριση περιεχομένου και εργασιών</li><li>Παρακολούθηση προόδου και αξιολογήσεων</li><li>Επικοινωνία με μαθητές</li><li>Αναλυτικά στατιστικά και αναφορές</li></ul></div></div>${acts}
  <div class="tmain">${catHTML || (classes.length ? classCards(classes) : '<div class="empty">Δεν έχετε ενότητες ακόμη.</div>')}</div>
  <aside class="tside" aria-label="Σύνοψη">${tiles}${panels.join('')}</aside>
  ${otherHTML ? `<div class="tother">${otherHTML}</div>` : ''}`, 'tg');
  if (catHTML) bindCatalog();
  $$('.panel .ccard.tcl[data-href]').forEach(el => { if (!el.closest('#catalog')) el.onclick = e => { if (!e.target.closest('a,button')) go(el.dataset.href); }; });
  $$('.panel button.newl').forEach(b => { if (!b.closest('#catalog')) b.onclick = () => newLesson(b.dataset.c); });
}

route(/^\/new-class$/, async () => {
  if (needLogin()) return;
  if (!isTeacher()) return go('#/');
  app.innerHTML = `<div class="panel" style="max-width:640px"><h1>Ενότητα εκτός καταλόγου</h1><form class="f" id="fm">
    <label>Τίτλος<input type="text" name="name" maxlength="120" placeholder="π.χ. Βασικές αρχές θερμοδυναμικής" required></label>
    <label>Περιγραφή (προαιρετικά)<textarea name="desc" style="min-height:70px"></textarea></label>
    <label class="chk"><input type="checkbox" name="open" checked> <span>Ανοιχτή σε όλους τους εγγεγραμμένους χρήστες (χωρίς τσεκάρισμα: πρόσβαση μόνο με κωδικό)</span></label>
    <div class="row"><button class="btn primary">Δημιουργία</button><a href="#/me">Άκυρο</a></div></form></div>`;
  $('#fm').onsubmit = async e => {
    e.preventDefault();
    try { const c = await q(sb.from('classes').insert({ name: e.target.elements.namedItem('name').value.trim(), description: e.target.desc.value.trim(), is_open: e.target.open.checked, owner: me.id }).select().single()); go(c.is_open ? `#/c/${c.id}` : `#/c/${c.id}/students`); }
    catch (er) { toast(errText(er), true); }
  };
});

// ================================================================ ΤΜΗΜΑ
const PREVIEW_KEY = 'csl-preview', HOME_PREVIEW = 'csl-preview-home';
const homePreview = () => { try { return isTeacher() && sessionStorage.getItem(HOME_PREVIEW) === '1'; } catch { return false; } };
const inPreview = cid => { try { return sessionStorage.getItem(PREVIEW_KEY) === cid || homePreview(); } catch { return false; } };
async function loadClass(cid) {
  const c = await q(sb.from('classes').select('*').eq('id', cid).maybeSingle());
  if (!c) throw new Error('Η ενότητα δεν βρέθηκε ή δεν έχετε πρόσβαση.');
  c.owner_me = c.owner === me.id;
  c.preview = c.owner_me && inPreview(cid);     // ο διαχειριστής βλέπει όπως ένας χρήστης
  c.mine = c.owner_me && !c.preview;
  return c;
}
// μαθήματα όπως τα βλέπει ο χρήστης + πρόοδος + ποια είναι κλειδωμένα
async function lessonState(c) {
  let ls = await q(sb.from('lessons').select('id,title,summary,position,published,videos,recap_videos,sims,quiz').eq('class_id', c.id).order('position').order('created_at'));
  if (!c.mine) ls = ls.filter(l => l.published);
  const prog = await q(sb.from('lesson_progress').select('lesson_id,score,completed_at,user_id').eq('class_id', c.id));
  const mineP = prog.filter(p => p.user_id === me.id);
  const done = new Map(mineP.map(p => [p.lesson_id, p]));
  let blocked = false;
  ls.forEach(l => {
    l.done = done.get(l.id) || null;
    l.locked = !c.mine && c.sequential && blocked;
    if (!l.done && l.published) blocked = true;
    l.completions = prog.filter(p => p.lesson_id === l.id && p.user_id !== me.id).length;
  });
  const pub = ls.filter(l => l.published);
  const learners = new Set(prog.filter(p => p.user_id !== me.id).map(p => p.user_id)).size;
  return { ls, doneN: pub.filter(l => l.done).length, total: pub.length, learners };
}
function progressBar(done, total, label) {
  const pc = total ? Math.round(100 * done / total) : 0;
  return `<div class="prog"><div class="prog-top"><span>${label || 'Πρόοδος'}</span><b>${done}/${total} · ${pc}%</b></div>
    <div class="prog-bar" role="progressbar" aria-valuenow="${pc}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pc}%"></span></div></div>`;
}
const QUIZ_PASS = 0.7;   // ποσοστό σωστών για ολοκλήρωση μαθήματος με κουίζ
// καταγραφή δραστηριότητας χρήστη (όχι του διαχειριστή) — αθόρυβα, χωρίς να σταματά τη σελίδα
// ---------------------------------------------------------------- GoatCounter (ανώνυμα συνολικά στατιστικά, όπως στο κυρίως site)
// Δεν στέλνει ποτέ όνομα, email ή αναγνωριστικό χρήστη· ο διαχειριστής δεν μετριέται.
const GC = {
  q: [], tries: 0, timer: null, last: '',
  send(o) {
    if (!document.querySelector('script[data-goatcounter]') || isTeacher()) return;
    this.q.push(o); this.flush();
  },
  flush() {
    const gc = window.goatcounter;
    if (gc && gc.count) { while (this.q.length) { try { gc.count(this.q.shift()); } catch {} } return; }
    if (this.timer || this.tries > 40) return;
    this.tries++; this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 750);
  },
  page(h) {
    // μόνο δημόσιες σελίδες περιεχομένου· όχι λογαριασμός, διαχείριση, επεξεργασία
    if (/^\/(profile|admin|new-class|deleted)|\/(edit|settings|students|grade)$/.test(h)) return;
    const path = '/academy' + h;
    if (path === this.last) return; this.last = path;
    // τίτλος μόνο από ενότητες/μαθήματα (ποτέ από σελίδες που μπορεί να δείχνουν το όνομα του χρήστη)
    const t = h.startsWith('/c/') ? (($('#app h1') || {}).textContent || '').trim() : ({ '/': 'αρχική', '/login': 'σύνδεση', '/register': 'εγγραφή', '/forgot': 'ξέχασα τον κωδικό' })[h] || '';
    this.send({ path, title: 'Academy' + (t ? ': ' + t : '') });
  },
  event(kind, label) { this.send({ path: `academy-${kind}: ${label || ''}`.slice(0, 200), title: label || kind, event: true }); }
};
const GC_KIND = { material_download: 'αρχείο', video_open: 'βίντεο', sim_open: 'προσομοίωση', lesson_complete: 'ολοκλήρωση' };

function track(c, lessonId, kind, ref, label) {
  if (!c || c.owner_me || !session) return;
  if (GC_KIND[kind]) GC.event(GC_KIND[kind], label);
  sb.from('activity_events').insert({ lesson_id: lessonId, class_id: c.id, kind, ref: ref || null, label: label || null }).then(() => {}, () => {});
}
function classHead(c, tab) {
  const tabs = [['', 'Μαθήματα']];
  if (F.assignments) tabs.push(['asg', 'Εργασίες']);
  if (F.announcements) tabs.push(['ann', 'Ανακοινώσεις']);
  if (F.messages) tabs.push(['chat', 'Μηνύματα']);
  if (c.mine) tabs.push(['students', 'Πρόσβαση'], ['settings', 'Ρυθμίσεις']);
  return `${c.preview ? `<div class="msg warn row between" style="margin-bottom:12px"><span>👁 <b>Προβολή ως χρήστης</b> — βλέπετε την ενότητα όπως οι χρήστες (χωρίς πρόχειρα).</span><span class="row"><button class="btn small" id="prev-reset">Μηδενισμός προόδου μου</button><button class="btn small" id="prev-exit">Έξοδος προβολής</button></span></div>` : ''}
    <p class="small"><a href="#/me">← Ο πίνακάς μου</a></p>
    ${c.mine ? `<div style="float:right"><button class="btn small" id="prev-on">👁 Προβολή ως χρήστης</button></div>` : ''}
    <h1>${esc(c.name)}${c.archived ? ' <span class="pill">Αρχειοθετημένο</span>' : ''}</h1>
    ${c.description ? `<p class="muted" style="margin:0">${esc(c.description)}</p>` : ''}
    <nav class="tabs">${tabs.map(([k, t]) => `<a href="#/c/${c.id}${k ? '/' + k : ''}" class="${tab === k ? 'on' : ''}">${t}</a>`).join('')}</nav>`;
}

route(/^\/c\/([\w-]{36})(?:\/(asg|ann|students|settings))?$/, async (cid, tab, tok) => {
  if (needLogin()) return;
  tab = tab || '';
  const c = await loadClass(cid); if (stale(tok)) return;
  if (!c.mine && (tab === 'students' || tab === 'settings')) return go('#/c/' + cid);
  if ((tab === 'asg' && !F.assignments) || (tab === 'ann' && !F.announcements)) return go('#/c/' + cid);
  const body = await ({ '': tabLessons, asg: tabAssignments, ann: tabAnnouncements, students: tabStudents, settings: tabSettings })[tab](c, tok);
  if (stale(tok) || body == null) return;
  app.innerHTML = classHead(c, tab) + body.html;
  body.bind && body.bind();
});

// ================================================================ ΑΝΤΙΓΡΑΦΗ ΜΑΘΗΜΑΤΩΝ / ΕΝΟΤΗΤΩΝ
// Αντιγράφει μαθήματα (με τα αρχεία τους) σε άλλη ενότητα. Τα αντίγραφα μπαίνουν στο τέλος, με την ίδια σειρά.
async function copyLessons(lessonIds, targetCid, publish, onProgress) {
  const res = { n: 0, errors: [] };
  if (!lessonIds.length) return res;
  const src = await q(sb.from('lessons').select('*').in('id', lessonIds).order('position').order('created_at'));
  const last = await q(sb.from('lessons').select('position').eq('class_id', targetCid).order('position', { ascending: false }).limit(1));
  let pos = last.length ? (last[0].position || 0) : 0;
  for (const [i, l] of src.entries()) {
    onProgress && onProgress(`Αντιγραφή ${i + 1}/${src.length}: ${l.title}…`);
    let nl;
    try {
      nl = await q(sb.from('lessons').insert({ class_id: targetCid, position: ++pos, title: l.title, summary: l.summary, videos: l.videos,
        recap_videos: l.recap_videos || [], sims: l.sims, quiz: l.quiz, published: !!publish }).select().single());
      res.n++;
    } catch (er) { res.errors.push(`«${l.title}»: ${errText(er)}`); continue; }   // συνεχίζει με τα επόμενα
    const mats = await q(sb.from('materials').select('*').eq('item_id', l.id).order('created_at'));
    for (const m of mats) {
      const path = `${targetCid}/${nl.id}/${m.path.split('/').pop()}`;
      try {
        const cp = await sb.storage.from('materials').copy(m.path, path);
        if (cp.error) {   // εναλλακτικά: λήψη και νέο ανέβασμα
          const blob = await q(sb.storage.from('materials').download(m.path));
          await q(sb.storage.from('materials').upload(path, blob, { contentType: blob.type || 'application/octet-stream', upsert: true }));
        }
        await q(sb.from('materials').insert({ class_id: targetCid, item_id: nl.id, title: m.title, path, size: m.size, allow_download: !!m.allow_download }));
      } catch (er) { res.errors.push(`«${l.title}» — αρχείο «${m.title}»: ${errText(er)}`); }
    }
  }
  return res;
}
const copyReport = r => r.errors.length
  ? msgBox('warn', `<b>Αντιγράφηκαν ${r.n} μαθήματα, αλλά ${r.errors.length} στοιχεία απέτυχαν:</b><ul style="margin:6px 0 0;padding-left:18px">${r.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>Μπορείτε να τα ξαναδοκιμάσετε με «Εισαγωγή από άλλη ενότητα».`)
  : '';
async function myOtherClasses(exceptId) {
  return (await q(sb.from('classes').select('id,name,archived').eq('owner', me.id).order('created_at'))).filter(x => x.id !== exceptId);
}

async function tabLessons(c) {
  const st = await lessonState(c), ls = st.ls;
  const next = ls.find(l => l.published && !l.done && !l.locked);
  const card = (l, i) => {
    const meta = `<div class="row small muted" style="margin-top:8px">${(l.recap_videos || []).length ? '<span>🎬 ανασκόπηση</span>' : ''}${l.videos.length ? `<span>▶ ${l.videos.length} βίντεο</span>` : ''}${l.sims.length ? `<span>◎ ${l.sims.length} προσομοιώσεις</span>` : ''}${parseQuiz(l.quiz).length ? `<span>✎ αυτοέλεγχος</span>` : ''}</div>`;
    const status = c.mine ? (!l.published ? '<span class="pill warn">Πρόχειρο</span>' : `<span class="pill">${l.completions} ολοκλήρωσαν</span>`)
      : l.done ? '<span class="pill ok">✓ Ολοκληρώθηκε</span>' : l.locked ? '<span class="pill">🔒 Κλειδωμένο</span>' : l === next ? '<span class="pill info">Επόμενο</span>' : '';
    const inner = `<div class="row between"><span class="muted small">Μάθημα ${i + 1}</span>${status}</div>
      <h3>${esc(l.title)}</h3><p class="muted small" style="margin:0">${esc((l.summary || '').replace(/\*\*/g, '')).slice(0, 140)}${(l.summary || '').length > 140 ? '…' : ''}</p>${meta}`;
    return l.locked ? `<div class="card locked" title="Ολοκληρώστε πρώτα τα προηγούμενα μαθήματα">${inner}</div>`
      : `<a class="card ${l === next ? 'next' : ''} ${l.done ? 'done' : ''}" href="#/c/${c.id}/lesson/${l.id}">${inner}</a>`;
  };
  return {
    html: `${c.mine ? `<div class="row" style="margin-bottom:12px"><button class="btn accent" id="newl">+ Νέο μάθημα</button><button class="btn" id="impl">⧉ Εισαγωγή από άλλη ενότητα</button>${ls.length > 1 ? '<button class="btn" id="reord">↕ Αλλαγή σειράς</button>' : ''}<span class="muted small">Τα πρόχειρα δεν τα βλέπουν οι χρήστες.${st.learners ? ` · ${st.learners} χρήστες έχουν ολοκληρώσει τουλάχιστον ένα μάθημα.` : ''}</span></div>`
      : st.total ? `<div class="panel" style="margin-bottom:14px">${progressBar(st.doneN, st.total, 'Η πρόοδός μου')}
        ${next ? `<div class="row" style="margin-top:10px"><a class="btn accent" href="#/c/${c.id}/lesson/${next.id}">${st.doneN ? 'Συνέχεια' : 'Ξεκινήστε'}: ${esc(next.title)} →</a></div>` : st.doneN === st.total ? '<p style="margin:10px 0 0"><b>🎉 Ολοκληρώσατε όλη την ενότητα!</b></p>' : ''}</div>` : ''}
    <div id="imppanel"></div>
    ${ls.length ? `<div class="grid">${ls.map(card).join('')}</div>`
      : `<div class="empty">${c.mine ? 'Δεν υπάρχουν μαθήματα ακόμη.' : 'Δεν υπάρχουν ακόμη μαθήματα σε αυτή την ενότητα.'}</div>`}`,
    bind: () => {
      const b = $('#newl'); if (!b) return;
      b.onclick = async () => {
        try { const l = await q(sb.from('lessons').insert({ class_id: c.id, title: 'Νέο μάθημα', position: ls.length + 1 }).select().single()); go(`#/c/${c.id}/lesson/${l.id}/edit`); }
        catch (er) { toast(errText(er), true); }
      };
      $('#impl').onclick = () => importPanel(c);
      const ro = $('#reord'); if (ro) ro.onclick = () => reorderPanel(c, ls);
    }
  };
}

function reorderPanel(c, ls) {
  const box = $('#imppanel'); if (box.dataset.mode === 'reord' && box.innerHTML) { box.innerHTML = ''; box.dataset.mode = ''; return; }
  box.dataset.mode = 'reord';
  let order = ls.map(l => l.id); const byId = Object.fromEntries(ls.map(l => [l.id, l])); const del = new Set();
  box.innerHTML = `<div class="panel" style="margin-bottom:14px"><h2>Σειρά μαθημάτων</h2>
    <p class="muted small">Σύρετε κάθε μάθημα στη θέση που θέλετε (ή χρησιμοποιήστε τα βελάκια ▲▼). Με 🗑 σημειώνετε μαθήματα για διαγραφή (↶ για αναίρεση). Τίποτα δεν αλλάζει πριν πατήσετε «Αποθήκευση». Η αρίθμηση «Μάθημα N» ενημερώνεται αυτόματα.</p>
    <ol class="reorder" id="rol"></ol>
    <div class="row" style="margin-top:10px"><button class="btn primary" id="rosave">Αποθήκευση</button><button class="btn" id="rox">Άκυρο</button><span class="muted small" id="rost"></span></div></div>`;
  const ol = $('#rol'); let drag = null;
  const draw = () => {
    let k = 0;
    ol.innerHTML = order.map((id, i) => { const l = byId[id], d = del.has(id); return `<li draggable="true" data-id="${id}" class="${d ? 'del' : ''}"><span class="grip" aria-hidden="true">⋮⋮</span><span class="ro-n">${d ? '' : ++k + '.'}</span><span class="ro-t">${esc(l.title)}${l.published ? '' : ' <span class="pill warn">Πρόχειρο</span>'}</span>
      <button type="button" class="btn small" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Πάνω">▲</button><button type="button" class="btn small" data-dn="${i}" ${i < order.length - 1 ? '' : 'disabled'} aria-label="Κάτω">▼</button>${d ? `<button type="button" class="btn small" data-undel="${id}" title="Αναίρεση διαγραφής" aria-label="Αναίρεση διαγραφής">↶</button>` : `<button type="button" class="btn small ro-del" data-del="${id}" title="Διαγραφή μαθήματος" aria-label="Διαγραφή μαθήματος">🗑</button>`}</li>`; }).join('');
    $$('[data-del]', ol).forEach(b => b.onclick = () => { del.add(b.dataset.del); draw(); });
    $$('[data-undel]', ol).forEach(b => b.onclick = () => { del.delete(b.dataset.undel); draw(); });
    $('#rosave').textContent = del.size ? `Αποθήκευση (διαγραφή ${del.size})` : 'Αποθήκευση';
    $$('li', ol).forEach(li => {
      li.ondragstart = e => { drag = li.dataset.id; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', drag); };
      li.ondragend = () => { li.classList.remove('dragging'); $$('li', ol).forEach(x => x.classList.remove('over-top', 'over-bot')); };
      li.ondragover = e => { if (!drag) return; e.preventDefault(); const r = li.getBoundingClientRect(), top = e.clientY < r.top + r.height / 2;
        $$('li', ol).forEach(x => x.classList.remove('over-top', 'over-bot')); li.classList.add(top ? 'over-top' : 'over-bot'); };
      li.ondrop = e => { e.preventDefault(); if (!drag || drag === li.dataset.id) return; const r = li.getBoundingClientRect(), top = e.clientY < r.top + r.height / 2;
        order = order.filter(x => x !== drag); let j = order.indexOf(li.dataset.id) + (top ? 0 : 1); order.splice(j, 0, drag); drag = null; draw(); };
    });
    $$('[data-up]', ol).forEach(b => b.onclick = () => { const i = +b.dataset.up; [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw(); ol.querySelector(`[data-up="${i - 1}"]`)?.focus(); });
    $$('[data-dn]', ol).forEach(b => b.onclick = () => { const i = +b.dataset.dn; [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw(); ol.querySelector(`[data-dn="${i + 1}"]`)?.focus(); });
  };
  draw();
  $('#rox').onclick = () => { box.innerHTML = ''; box.dataset.mode = ''; };
  $('#rosave').onclick = async () => {
    if (del.size && !confirm(`Οριστική διαγραφή ${del.size} μαθήματος/ων μαζί με τα αρχεία τους;\n\n${[...del].map(id => '• ' + byId[id].title).join('\n')}`)) return;
    const btn = $('#rosave'); btn.disabled = true; $('#rost').textContent = 'Αποθήκευση…';
    try {
      for (const id of del) {
        const mats = await q(sb.from('materials').select('path').eq('item_id', id));
        if (mats.length) await sb.storage.from('materials').remove(mats.map(m => m.path));
        await q(sb.from('materials').delete().eq('item_id', id));
        await q(sb.from('lessons').delete().eq('id', id));
      }
      const ch = order.filter(id => !del.has(id)).map((id, i) => ({ id, pos: i + 1 })).filter(x => byId[x.id].position !== x.pos);
      for (const x of ch) await q(sb.from('lessons').update({ position: x.pos }).eq('id', x.id));
      toast(del.size ? `Διαγράφηκαν ${del.size} μαθήματα. Η σειρά αποθηκεύτηκε.` : ch.length ? 'Η σειρά αποθηκεύτηκε.' : 'Καμία αλλαγή.'); box.dataset.mode = ''; render();
    } catch (er) { btn.disabled = false; $('#rost').textContent = ''; toast(errText(er), true); }
  };
}

async function importPanel(c) {
  const box = $('#imppanel'); if (box.innerHTML && box.dataset.mode !== 'reord') { box.innerHTML = ''; box.dataset.mode = ''; return; }
  box.dataset.mode = 'imp';
  const others = await myOtherClasses(c.id);
  if (!others.length) { box.innerHTML = msgBox('info', 'Δεν έχετε άλλες ενότητες για εισαγωγή.') + '<div style="height:12px"></div>'; return; }
  const ls = await q(sb.from('lessons').select('id,class_id,title,position,published').in('class_id', others.map(o => o.id)).order('position').order('created_at'));
  const have = new Set((await q(sb.from('lessons').select('title').eq('class_id', c.id))).map(x => x.title.trim()));
  box.innerHTML = `<div class="panel" style="margin-bottom:14px"><h2>Εισαγωγή μαθημάτων από άλλη ενότητα</h2>
    <p class="muted small">Επιλέξτε μαθήματα. Αντιγράφονται με όλο το περιεχόμενο (σύνοψη, βίντεο, προσομοιώσεις, αυτοέλεγχο, αρχεία) στο τέλος αυτής της ενότητας. Τα πρωτότυπα δεν αλλάζουν.</p>
    ${others.map(o => { const mine = ls.filter(l => l.class_id === o.id); return `<details class="impcls" ${others.length === 1 || mine.some(l => have.has(l.title.trim())) ? 'open' : ''}><summary><b>${esc(o.name)}</b> <span class="muted small">(${mine.length} μαθήματα)</span></summary>
      ${mine.length ? `<label class="chk small" style="margin:6px 0"><input type="checkbox" data-all="${o.id}"> <b>Όλα</b></label>${mine.some(l => have.has(l.title.trim())) && mine.some(l => !have.has(l.title.trim())) ? ` <button type="button" class="btn small" data-miss="${o.id}">Επιλογή μόνο όσων λείπουν</button>` : ''}
      ${mine.map((l, i) => `<label class="chk"><input type="checkbox" name="impl" value="${l.id}" data-cls="${o.id}" ${have.has(l.title.trim()) ? 'data-have="1"' : ''}> <span>${i + 1}. ${esc(l.title)}${l.published ? '' : ' <span class="pill warn">Πρόχειρο</span>'}${have.has(l.title.trim()) ? ' <span class="pill ok">υπάρχει ήδη εδώ</span>' : ''}</span></label>`).join('')}
      `
        : '<p class="muted small">Χωρίς μαθήματα.</p>'}</details>`; }).join('')}
    <label class="chk" style="margin-top:10px"><input type="checkbox" id="imppub"> <span>Δημοσίευση αμέσως (αλλιώς μπαίνουν ως πρόχειρα για έλεγχο)</span></label>
    <div class="row" style="margin-top:10px"><button class="btn primary" id="impgo">Αντιγραφή επιλεγμένων</button><button class="btn" id="impx">Άκυρο</button><span class="muted small" id="impst"></span></div></div>`;
  $$('[data-all]', box).forEach(a => a.onchange = () => $$(`input[data-cls="${a.dataset.all}"]`, box).forEach(x => x.checked = a.checked));
  $$('[data-miss]', box).forEach(a => a.onclick = () => $$(`input[data-cls="${a.dataset.miss}"]`, box).forEach(x => x.checked = !x.dataset.have));
  $('#impx').onclick = () => box.innerHTML = '';
  $('#impgo').onclick = async () => {
    const ids = $$('input[name=impl]:checked', box).map(x => x.value);
    if (!ids.length) return toast('Επιλέξτε τουλάχιστον ένα μάθημα.', true);
    const btn = $('#impgo'); btn.disabled = true;
    try {
      const r = await copyLessons(ids, c.id, $('#imppub').checked, t => $('#impst').textContent = t);
      if (!r.errors.length) { toast(`Αντιγράφηκαν ${r.n} μαθήματα.`); return render(); }
      await render(); $('#imppanel').innerHTML = copyReport(r) + '<div style="height:12px"></div>';
    }
    catch (er) { toast(errText(er), true); btn.disabled = false; $('#impst').textContent = ''; }
  };
}

async function tabAssignments(c) {
  const [as, subs, nst] = await Promise.all([
    q(sb.from('assignments').select('*').eq('class_id', c.id).order('due_at', { ascending: true, nullsFirst: false }).order('created_at')),
    q(sb.from('submissions').select('assignment_id,status,points,submitted_at,graded_at,student_id')),
    c.mine ? q(sb.from('enrollments').select('user_id').eq('class_id', c.id)) : Promise.resolve([])]);
  const mySub = {}, stats = {};
  subs.forEach(s => {
    if (s.student_id === me.id) mySub[s.assignment_id] = s;
    const st = stats[s.assignment_id] = stats[s.assignment_id] || { n: 0, g: 0 }; st.n++; if (s.graded_at) st.g++;
  });
  return {
    html: `${c.mine ? `<div class="row" style="margin-bottom:12px"><button class="btn accent" id="newa">+ Νέα εργασία</button></div>` : ''}
    ${as.length ? `<div class="panel"><ul class="list">${as.map(a => `<li><a class="item" href="#/c/${c.id}/asg/${a.id}">
      <span class="spacer"><b>${esc(a.title)}</b>${!a.published ? ' <span class="pill warn">Πρόχειρο</span>' : ''}<br><span class="muted small">${a.due_at ? 'Προθεσμία: ' + fmtDate(a.due_at) : 'Χωρίς προθεσμία'} · ${num(a.max_points)} μονάδες</span></span>
      ${c.mine ? `<span class="pill ${(stats[a.id]?.n || 0) > (stats[a.id]?.g || 0) ? 'warn' : ''}">${stats[a.id]?.n || 0}/${nst.length} υποβολές · ${stats[a.id]?.g || 0} βαθμολογημένες</span>` : duePill(a, mySub[a.id])}
    </a></li>`).join('')}</ul></div>` : `<div class="empty">Δεν υπάρχουν εργασίες ακόμη.</div>`}`,
    bind: () => {
      const b = $('#newa'); if (!b) return;
      b.onclick = async () => {
        try { const a = await q(sb.from('assignments').insert({ class_id: c.id, title: 'Νέα εργασία' }).select().single()); go(`#/c/${c.id}/asg/${a.id}/edit`); }
        catch (er) { toast(errText(er), true); }
      };
    }
  };
}

async function tabAnnouncements(c) {
  const anns = await q(sb.from('announcements').select('*').eq('class_id', c.id).order('created_at', { ascending: false }));
  return {
    html: `${c.mine ? `<div class="panel" style="margin-bottom:14px"><h2>Νέα ανακοίνωση</h2><form class="f" id="fa">
      <label>Τίτλος<input type="text" name="title" maxlength="160" required></label>
      <label>Κείμενο<textarea name="body" style="min-height:80px"></textarea></label>
      <div><button class="btn primary">Δημοσίευση</button></div></form></div>` : ''}
    ${anns.length ? anns.map(a => `<div class="panel"><div class="row between"><h3 style="margin:0">${esc(a.title)}</h3>
      <span class="row"><span class="muted small">${fmtDate(a.created_at)}</span>${c.mine ? `<button class="btn small danger" data-del="${a.id}">Διαγραφή</button>` : ''}</span></div>
      <div class="text" style="margin-top:6px">${rich(a.body)}</div></div>`).join('') : `<div class="empty">Καμία ανακοίνωση.</div>`}`,
    bind: () => {
      const f = $('#fa');
      if (f) f.onsubmit = async e => {
        e.preventDefault();
        try { await q(sb.from('announcements').insert({ class_id: c.id, title: f.elements.namedItem('title').value.trim(), body: f.body.value.trim() })); toast('Δημοσιεύτηκε.'); render(); }
        catch (er) { toast(errText(er), true); }
      };
      $$('[data-del]').forEach(b => b.onclick = async () => {
        if (!confirm('Διαγραφή ανακοίνωσης;')) return;
        try { await q(sb.from('announcements').delete().eq('id', b.dataset.del)); render(); } catch (er) { toast(errText(er), true); }
      });
    }
  };
}

async function tabStudents(c) {
  const [enr, as, subs] = await Promise.all([
    q(sb.from('enrollments').select('user_id,joined_at,profiles(full_name)').eq('class_id', c.id)),
    F.assignments ? q(sb.from('assignments').select('id,title,max_points').eq('class_id', c.id).order('due_at', { ascending: true, nullsFirst: false }).order('created_at')) : none(),
    F.assignments ? q(sb.from('submissions').select('assignment_id,student_id,points,graded_at')) : none()]);
  const ids = new Set(as.map(a => a.id));
  const byS = {}; subs.filter(s => ids.has(s.assignment_id)).forEach(s => (byS[s.student_id] = byS[s.student_id] || []).push(s));
  enr.sort((a, b) => (a.profiles?.full_name || '').localeCompare(b.profiles?.full_name || '', 'el'));
  const link = location.origin + location.pathname + '#/join/' + c.join_code;
  return {
    html: `${c.is_open ? msgBox('ok', '<b>Ανοιχτή ενότητα:</b> τη βλέπει κάθε εγγεγραμμένος χρήστης, χωρίς κωδικό. Για πρόσβαση μόνο με κωδικό, αλλάξτε το στις <a href="#/c/' + c.id + '/settings">Ρυθμίσεις</a>.') + '<div style="height:14px"></div>' : ''}
    <div class="two"><div class="panel"><h2>Μέλη με κωδικό (${enr.length})</h2>
      ${enr.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Όνομα</th><th>Εγγραφή</th>${F.assignments ? '<th>Υποβολές</th>' : ''}<th></th></tr></thead><tbody>
      ${enr.map(e => `<tr><td>${esc(e.profiles?.full_name || '—')}</td><td>${fmtDay(e.joined_at)}</td>${F.assignments ? `<td>${(byS[e.user_id] || []).length}/${as.length}</td>` : ''}
        <td>${F.messages ? `<a class="btn small" href="#/c/${c.id}/chat/${e.user_id}">Μήνυμα</a> ` : ''}<button class="btn small danger" data-rm="${e.user_id}">Αφαίρεση</button></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty">${c.is_open ? 'Δεν χρειάζονται μέλη σε ανοιχτή ενότητα.' : 'Κανείς ακόμη. Δώστε τον κωδικό ή τον σύνδεσμο σε όσους θέλετε να έχουν πρόσβαση.'}</div>`}
    </div><div class="stack"><div class="panel stack"><h2>Πρόσκληση</h2>
      <p class="small">${c.is_open ? 'Ο κωδικός χρειάζεται μόνο αν κλείσετε την ενότητα.' : 'Οι χρήστες κάνουν μόνοι τους εγγραφή και αποκτούν πρόσβαση με τον κωδικό:'}</p>
      <div class="row"><span class="code" id="code">${esc(c.join_code)}</span><button class="btn small" id="regen">Νέος κωδικός</button></div>
      <p class="small">ή με τον σύνδεσμο:</p>
      <div class="row"><input class="inp" readonly value="${esc(link)}" id="lnk"><button class="btn small" id="copy">Αντιγραφή</button></div>
      <p class="muted small">Με νέο κωδικό, ο παλιός παύει να ισχύει (όσοι μπήκαν ήδη παραμένουν).</p></div>
      ${F.assignments ? `<div class="panel stack"><h2>Βαθμολόγιο</h2><p class="small">Λήψη όλων των βαθμών της ενότητας σε αρχείο για Excel.</p>
      <div><button class="btn" id="csv">Λήψη CSV</button></div></div>` : ''}</div></div>`,
    bind: () => {
      $('#copy').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Αντιγράφηκε.'); } catch { $('#lnk').select(); } };
      $('#regen').onclick = async () => {
        if (!confirm('Να δημιουργηθεί νέος κωδικός;')) return;
        try { const code = await q(sb.rpc('gen_code')); await q(sb.from('classes').update({ join_code: code }).eq('id', c.id)); render(); }
        catch (er) { toast(errText(er), true); }
      };
      $$('[data-rm]').forEach(b => b.onclick = async () => {
        if (!confirm('Αφαίρεση μέλους από την ενότητα; (Οι υποβολές του παραμένουν.)')) return;
        try { await q(sb.from('enrollments').delete().eq('class_id', c.id).eq('user_id', b.dataset.rm)); render(); } catch (er) { toast(errText(er), true); }
      });
      if ($('#csv')) $('#csv').onclick = () => {
        const cell = v => { v = String(v ?? ''); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        const rows = [['Σπουδαστής', ...as.map(a => `${a.title} (/${num(a.max_points)})`)]];
        enr.forEach(e => rows.push([e.profiles?.full_name || '', ...as.map(a => { const s = (byS[e.user_id] || []).find(x => x.assignment_id === a.id); return s ? (s.points != null ? num(s.points) : 'υποβλήθηκε') : ''; })]));
        const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = safeName(c.name) + '-vathmoi.csv'; a.click();
      };
    }
  };
}

async function tabSettings(c) {
  return {
    html: `<div class="panel" style="max-width:680px"><h2>Ρυθμίσεις ενότητας</h2><form class="f" id="fs">
      <label>Τίτλος<input type="text" name="name" maxlength="120" value="${esc(c.name)}" required></label>
      <label>Περιγραφή<textarea name="desc" style="min-height:70px">${esc(c.description)}</textarea></label>
      <label class="chk"><input type="checkbox" name="open" ${c.is_open ? 'checked' : ''}> <span>Ανοιχτή σε όλους τους εγγεγραμμένους χρήστες (αλλιώς πρόσβαση μόνο με κωδικό)</span></label>
      <label class="chk"><input type="checkbox" name="seq" ${c.sequential ? 'checked' : ''}> <span>Διαδοχικά μαθήματα: κάθε μάθημα ξεκλειδώνει όταν ολοκληρωθεί το προηγούμενο</span></label>
      <label class="chk"><input type="checkbox" name="arch" ${c.archived ? 'checked' : ''}> <span>Αρχειοθετημένο (οι χρήστες δεν έχουν πλέον πρόσβαση· εσείς κρατάτε όλο το υλικό)</span></label>
      <div><button class="btn primary">Αποθήκευση</button></div></form></div>
      <div class="panel" style="max-width:680px"><h2>Αντίγραφο ενότητας</h2>
      <p class="small">Δημιουργεί νέα ενότητα με τις ίδιες ρυθμίσεις και αντίγραφα όλων των μαθημάτων και των αρχείων τους (π.χ. για άλλο μάθημα με παρόμοια ύλη). Τα αντίγραφα μπαίνουν ως πρόχειρα, για να τα ελέγξετε πριν τα δημοσιεύσετε.</p>
      <form class="row" id="fdup"><input class="inp" name="dname" value="${esc(c.name)} (αντίγραφο)" maxlength="120" style="flex:1;min-width:220px"><button class="btn">⧉ Δημιουργία αντιγράφου</button></form><p class="muted small" id="dupst"></p></div>
      <div class="panel" style="max-width:680px"><h2>Διαγραφή ενότητας</h2>
      <p class="small">Διαγράφονται οριστικά όλα τα μαθήματα, οι εργασίες, οι υποβολές, τα αρχεία και τα μηνύματα της ενότητας.</p>
      <button class="btn danger" id="delc">Διαγραφή ενότητας</button></div>`,
    bind: () => {
      $('#fs').onsubmit = async e => {
        e.preventDefault(); const f = e.target;
        try { await q(sb.from('classes').update({ name: f.elements.namedItem('name').value.trim(), description: f.desc.value.trim(), is_open: f.open.checked, sequential: f.seq.checked, archived: f.arch.checked }).eq('id', c.id)); toast('Αποθηκεύτηκε.'); render(); }
        catch (er) { toast(errText(er), true); }
      };
      $('#fdup').onsubmit = async e => {
        e.preventDefault(); const name = e.target.dname.value.trim(); if (!name) return;
        const btn = $('button', e.target); btn.disabled = true;
        try {
          const nc = await q(sb.from('classes').insert({ name, description: c.description, is_open: c.is_open, sequential: c.sequential, owner: me.id }).select().single());
          const ids = (await q(sb.from('lessons').select('id').eq('class_id', c.id))).map(x => x.id);
          const r = await copyLessons(ids, nc.id, false, t => $('#dupst').textContent = t);
          if (!r.errors.length) { toast(`Δημιουργήθηκε η «${name}» με ${r.n} μαθήματα (πρόχειρα).`); return go('#/c/' + nc.id); }
          $('#dupst').innerHTML = copyReport(r) + `<p><a class="btn" href="#/c/${nc.id}">Άνοιγμα της «${esc(name)}» →</a></p>`;
        } catch (er) { toast(errText(er), true); btn.disabled = false; $('#dupst').textContent = ''; }
      };
      $('#delc').onclick = async () => {
        const t = prompt(`Για επιβεβαίωση γράψτε τον τίτλο της ενότητας:\n${c.name}`);
        if ((t || '').trim() !== c.name.trim()) return;
        try {
          const mats = await q(sb.from('materials').select('path').eq('class_id', c.id));
          if (mats.length) await sb.storage.from('materials').remove(mats.map(m => m.path));
          const as = await q(sb.from('assignments').select('id').eq('class_id', c.id));
          if (as.length) {
            const fs = await q(sb.from('submissions').select('file_path').in('assignment_id', as.map(a => a.id)).not('file_path', 'is', null));
            if (fs.length) await sb.storage.from('submissions').remove(fs.map(x => x.file_path));
          }
          await q(sb.from('classes').delete().eq('id', c.id)); toast('Η ενότητα διαγράφηκε.'); go('#/me');
        } catch (er) { toast(errText(er), true); }
      };
    }
  };
}

// ================================================================ ΥΛΙΚΟ (αρχεία)
const EXT_COL = { pdf: '#D23A3A', ppt: '#E2672B', pptx: '#E2672B', doc: '#2B6CB0', docx: '#2B6CB0', xls: '#1C9A68', xlsx: '#1C9A68', zip: '#586C7D' };
function materialsList(mats, canEdit, owner) {
  if (!mats.length) return canEdit ? `<p class="muted small">Κανένα αρχείο.</p>` : '';
  const anyHidden = canEdit && mats.some(m => !VIEWABLE.test(m.title) && !m.allow_download);
  return `<ul class="files">${mats.map(m => {
    const ext = ((m.title.match(/\.(\w{2,4})$/) || [])[1] || 'file').toLowerCase();
    const name = m.title.replace(/\.\w{2,4}$/, '');
    const view = VIEWABLE.test(m.title), dl = owner || canEdit || m.allow_download, ok = view || dl;
    return `<li><span class="fext" style="background:${EXT_COL[ext] || '#586C7D'}">${esc(ext.slice(0, 4).toUpperCase())}</span>
      <button class="fname" ${ok ? '' : 'disabled'} data-open="${esc(m.path)}" data-title="${esc(m.title)}" data-view="${view ? 1 : ''}" data-dl="${dl ? 1 : ''}" title="${view ? 'Προβολή' : ok ? 'Λήψη' : 'Δεν είναι διαθέσιμο για προβολή'}: ${esc(m.title)}">${esc(name)}</button>
      <span class="fsize">${fmtSize(m.size)}</span>
      ${!canEdit && view && m.allow_download ? `<button class="fdl" data-dlonly="${esc(m.path)}" data-title="${esc(m.title)}" title="Λήψη: ${esc(m.title)}" aria-label="Λήψη: ${esc(m.title)}">⬇</button>` : ''}
      ${canEdit ? `<label class="fallow" title="Επιτρέπεται στους χρήστες να το κατεβάσουν"><input type="checkbox" data-allow="${m.id}" ${m.allow_download ? 'checked' : ''}> Λήψη</label><button class="btn small danger" data-delmat="${m.id}" data-path="${esc(m.path)}">Αφαίρεση</button>` : ''}</li>`; }).join('')}</ul>
    ${anyHidden ? `<p class="small" style="color:#a3513f;margin:6px 0 0">⚠ Τα αρχεία Word/PowerPoint κ.λπ. δεν προβάλλονται στον browser. Ανεβάστε τα ως PDF ή τσεκάρετε «Λήψη».</p>` : ''}
    ${canEdit ? '<p class="muted small" style="margin:6px 0 0">Τα αρχεία ανοίγουν σε προβολή μόνο για ανάγνωση, με υδατογράφημα «CoolingSystemsLab». Με «Λήψη» επιτρέπεται και το κατέβασμα.</p>' : ''}`;
}
function bindMaterials(cid, itemId, canEdit, onOpen, owner) {
  const box = $('#mats');
  const refresh = async () => {   // ανανεώνει μόνο τη λίστα, ώστε να μη χάνονται αλλαγές της φόρμας
    const mats = await q(sb.from('materials').select('*').eq('item_id', itemId).order('created_at'));
    if (box) { box.innerHTML = materialsList(mats, canEdit, owner); wire(); }
  };
  const wire = () => {
    $$('[data-open]').forEach(b => b.onclick = () => {
      if (onOpen) onOpen(b.dataset.open, b.dataset.title);
      if (b.dataset.view) viewFile({ path: b.dataset.open, title: b.dataset.title }, !!b.dataset.dl);
      else if (b.dataset.dl) openFile('materials', b.dataset.open);
    });
    $$('[data-dlonly]').forEach(b => b.onclick = () => { if (onOpen) onOpen(b.dataset.dlonly, b.dataset.title); openFile('materials', b.dataset.dlonly); });
    $$('[data-allow]').forEach(x => x.onchange = async () => {
      try { await q(sb.from('materials').update({ allow_download: x.checked }).eq('id', x.dataset.allow)); toast(x.checked ? 'Επιτρέπεται η λήψη.' : 'Μόνο προβολή.'); await refresh(); }
      catch (er) { x.checked = !x.checked; toast(errText(er), true); }
    });
    $$('[data-delmat]').forEach(b => b.onclick = async () => {
      if (!confirm('Αφαίρεση αρχείου;')) return;
      try { await sb.storage.from('materials').remove([b.dataset.path]); await q(sb.from('materials').delete().eq('id', b.dataset.delmat)); await refresh(); }
      catch (er) { toast(errText(er), true); }
    });
  };
  wire();
  const up = $('#upmat');
  if (up) up.onchange = async () => {
    const files = [...up.files]; if (!files.length) return;
    up.disabled = true; const st = $('#upst');
    try {
      for (const f of files) {
        if (f.size > 20 * 1048576) { toast(`Το «${f.name}» ξεπερνά τα 20 MB.`, true); continue; }
        st.textContent = 'Ανέβασμα: ' + f.name + '…';
        const path = `${cid}/${itemId}/${Date.now()}-${safeName(f.name)}`;
        await q(sb.storage.from('materials').upload(path, f, { contentType: f.type || 'application/octet-stream' }));
        await q(sb.from('materials').insert({ class_id: cid, item_id: itemId, title: f.name, path, size: f.size }));
      }
      await refresh();
    } catch (er) { toast(errText(er), true); }
    up.disabled = false; up.value = ''; st.textContent = '';
  };
}
const uploadBox = () => `<label class="btn small" style="cursor:pointer">+ Προσθήκη αρχείων<input type="file" id="upmat" multiple hidden></label> <span class="muted small" id="upst"></span>`;

// ================================================================ ΜΑΘΗΜΑ
route(/^\/c\/([\w-]{36})\/lesson\/([\w-]{36})(\/edit)?$/, async (cid, lid, edit, tok) => {
  if (needLogin()) return;
  const [c, l, mats, as] = await Promise.all([loadClass(cid),
    q(sb.from('lessons').select('*').eq('id', lid).maybeSingle()),
    q(sb.from('materials').select('*').eq('item_id', lid).order('created_at')),
    F.assignments ? q(sb.from('assignments').select('id,title,due_at,published').eq('lesson_id', lid)) : none()]);
  if (stale(tok)) return;
  if (!l || (!c.mine && !l.published)) throw new Error('Το μάθημα δεν βρέθηκε.');
  if (edit && c.mine) return lessonEdit(c, l, mats);
  const st = await lessonState(c); if (stale(tok)) return;
  const idx = st.ls.findIndex(x => x.id === l.id), me_l = st.ls[idx] || {};
  const nextL = st.ls.slice(idx + 1).find(x => x.published);
  const prevL = st.ls.slice(0, idx).reverse().find(x => x.published);
  if (me_l.locked) {
    const first = st.ls.find(x => x.published && !x.done);
    app.innerHTML = `<p class="small"><a href="#/c/${c.id}">← ${esc(c.name)}</a></p>
      <div class="panel stack" style="max-width:640px"><h1>🔒 ${esc(l.title)}</h1>
      <p>Το μάθημα ξεκλειδώνει όταν ολοκληρώσετε τα προηγούμενα.</p>
      ${first ? `<p><a class="btn accent" href="#/c/${c.id}/lesson/${first.id}">Συνέχεια: ${esc(first.title)} →</a></p>` : ''}</div>`;
    return;
  }
  const hasQuiz = parseQuiz(l.quiz).length > 0;
  const doneBox = () => {
    const d = (st.ls[idx] || {}).done;
    if (c.mine) return `<div class="panel"><h2>Ολοκλήρωση</h2><p class="muted small">${me_l.completions || 0} χρήστες ολοκλήρωσαν αυτό το μάθημα.${hasQuiz ? ` Για ολοκλήρωση απαιτούνται ${Math.round(QUIZ_PASS * 100)}% σωστές απαντήσεις στον αυτοέλεγχο.` : ' Ο χρήστης το ολοκληρώνει με ένα κουμπί (δεν υπάρχει αυτοέλεγχος).'}</p></div>`;
    return `<div class="panel" id="donebox">${d
      ? `<p style="margin:0 0 10px"><span class="pill ok">✓ Ολοκληρώθηκε</span> <span class="muted small">${fmtDate(d.completed_at)}${d.score != null ? ` · σκορ ${Math.round(d.score * 100)}%` : ''}</span></p>
         ${nextL ? `<a class="btn accent" href="#/c/${c.id}/lesson/${nextL.id}">Επόμενο μάθημα: ${esc(nextL.title)} →</a>` : `<p style="margin:0"><b>🎉 Ολοκληρώσατε όλα τα μαθήματα της ενότητας!</b></p>`}`
      : hasQuiz ? `<h2>Ολοκλήρωση μαθήματος</h2><p class="small" style="margin:0">Απαντήστε σωστά τουλάχιστον στο <b>${Math.round(QUIZ_PASS * 100)}%</b> των ερωτήσεων αυτοελέγχου και πατήστε «Έλεγχος απαντήσεων».${c.sequential && nextL ? ' Έτσι ξεκλειδώνει και το επόμενο μάθημα.' : ''}</p>`
      : `<h2>Ολοκλήρωση μαθήματος</h2><p class="small">Είδατε το υλικό;${c.sequential && nextL ? ' Ολοκληρώστε το για να ξεκλειδώσει το επόμενο μάθημα.' : ''}</p><button class="btn accent" id="markdone">✓ Ολοκλήρωσα το μάθημα</button>`}</div>`;
  };
  const sims = l.sims.length ? `<div class="panel"><h2>Προσομοιώσεις</h2><div class="simcards">${l.sims.map(s => `<a class="simcard" href="${esc(simHref(s))}" target="_blank" rel="noopener">
      <img src="sims/${esc(s)}.jpg" alt="" loading="lazy" onerror="this.remove()"><span>◎ ${esc(simLabel(s))}</span></a>`).join('')}</div></div>` : '';
  app.innerHTML = `<p class="small"><a href="#/c/${c.id}">← ${esc(c.name)}</a></p>
    ${!c.mine && st.total ? `<div style="max-width:420px;margin-bottom:8px">${progressBar(st.doneN, st.total)}</div>` : ''}
    <div class="row between"><h1>${esc(l.title)}</h1>${c.mine ? `<a class="btn" href="#/c/${c.id}/lesson/${l.id}/edit">Επεξεργασία</a>` : ''}</div>
    ${!l.published ? msgBox('warn', 'Πρόχειρο — δεν είναι ορατό στους χρήστες.') : ''}
    <div class="two lesson-two" style="margin-top:12px"><div class="stack">
      ${l.summary ? `<div class="panel text"><h2>Σύνοψη</h2>${rich(l.summary)}</div>` : ''}
      ${l.videos.length ? `<div class="panel"><h2>Βίντεο</h2>${videoCards(l.videos)}</div>` : ''}
      ${sims}
      ${hasQuiz ? `<div class="panel" id="quiz"><h2>Αυτοέλεγχος</h2>${quizHTML(l.quiz)}</div>` : ''}
      <div id="donewrap">${doneBox()}</div>
    </div><div class="stack">
      ${mats.length || (l.recap_videos || []).length ? `<div class="panel"><h2>Υλικό</h2>${recapCards(l.recap_videos)}${mats.length ? `<div id="mats">${materialsList(mats, false, c.mine)}</div>` : ''}</div>` : ''}
      ${as.filter(a => a.published || c.mine).length ? `<div class="panel"><h2>Εργασίες</h2><ul class="list">${as.filter(a => a.published || c.mine).map(a => `<li><a href="#/c/${c.id}/asg/${a.id}">${esc(a.title)}</a>${a.due_at ? ` <span class="muted small">· έως ${fmtDate(a.due_at)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
      ${prevL || nextL ? `<div class="panel small"><div class="row between">${prevL ? `<a href="#/c/${c.id}/lesson/${prevL.id}">← ${esc(prevL.title)}</a>` : '<span></span>'}${nextL && (c.mine || !nextL.locked || me_l.done) ? `<a href="#/c/${c.id}/lesson/${nextL.id}">${esc(nextL.title)} →</a>` : nextL ? `<span class="muted">🔒 ${esc(nextL.title)}</span>` : ''}</div></div>` : ''}
    </div></div>`;
  bindMaterials(c.id, l.id, false, (path, title) => track(c, l.id, 'material_download', path, title), c.mine);
  $$('a.vid').forEach(a => a.addEventListener('click', () => track(c, l.id, 'video_open', a.href, 'YouTube ' + (ytId(a.href) || ''))));
  $$('a.recap').forEach(a => a.addEventListener('click', () => track(c, l.id, 'video_open', a.href, 'Ανασκόπηση: ' + l.title)));
  $$('a.simcard').forEach(a => a.addEventListener('click', () => track(c, l.id, 'sim_open', a.getAttribute('href'), a.textContent.replace('◎', '').trim())));
  try { const k = 'csl-v-' + l.id; if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); track(c, l.id, 'lesson_view', null, l.title); } } catch { track(c, l.id, 'lesson_view', null, l.title); }
  const complete = async score => {
    if (c.mine || (st.ls[idx] || {}).done) return;
    try {
      const row = await q(sb.from('lesson_progress').upsert({ lesson_id: l.id, class_id: c.id, score }).select().single());
      track(c, l.id, 'lesson_complete', null, l.title);
      await render();   // ανανέωση μπάρας προόδου και συνδέσμων «επόμενο»
      toast(nextL ? 'Μπράβο! Το επόμενο μάθημα ξεκλείδωσε.' : 'Μπράβο! Ολοκληρώσατε την ενότητα.');
    } catch (er) { toast(errText(er), true); }
  };
  const qz = $('#quiz');
  if (qz) bindQuiz(qz, l.quiz, (sc, n) => {
    if (c.mine || (st.ls[idx] || {}).done) return;
    if (sc / n >= QUIZ_PASS) complete(sc / n);
    else toast(`Χρειάζονται τουλάχιστον ${Math.ceil(QUIZ_PASS * n)} σωστές. Ξαναδοκιμάστε!`, true);
  });
  const md = $('#markdone'); if (md) md.onclick = () => complete(null);
});

function simPicker(selected) {
  const sel = new Set(selected);
  return `<div class="simpick">${SIMS.map(s => `<fieldset><legend>${esc(s.t)}</legend>
    ${s.s.length > 1 ? s.s.map(([id, lab]) => `<label><input type="checkbox" name="sim" value="${s.id}.${id}" ${sel.has(s.id + '.' + id) ? 'checked' : ''}> ${esc(lab)}</label>`).join('')
      : `<label><input type="checkbox" name="sim" value="${s.id}" ${sel.has(s.id) ? 'checked' : ''}> ${esc(s.s[0] ? s.s[0][1] : s.t)}</label>`}</fieldset>`).join('')}</div>`;
}

function lessonEdit(c, l, mats) {
  app.innerHTML = `<p class="small"><a href="#/c/${c.id}/lesson/${l.id}">← Προβολή μαθήματος</a></p><h1>Επεξεργασία μαθήματος</h1>
  <div class="two"><form class="f panel" id="fl">
    <label>Τίτλος<input type="text" name="title" maxlength="160" value="${esc(l.title)}" required></label>
    <label>Σειρά<input type="number" name="pos" value="${l.position}" style="max-width:120px"></label>
    <label>Σύνοψη<textarea name="summary" style="min-height:180px">${esc(l.summary)}</textarea>
      <span class="hint">Κενή γραμμή = νέα παράγραφος· **έντονα**· οι σύνδεσμοι γίνονται αυτόματα clickable.</span></label>
    <label>Βίντεο ανασκόπησης μαθήματος<textarea name="recap" style="min-height:52px" placeholder="https://youtu.be/...">${esc((l.recap_videos || []).join('\n'))}</textarea>
      <span class="hint">Τα βίντεο ~10 λεπτών με την ανασκόπηση των διαφανειών. Εμφανίζονται πρώτα στο «Υλικό». Δεκτός και σύνδεσμος του YouTube Studio.</span></label>
    <label>Άλλα βίντεο YouTube<textarea name="videos" style="min-height:70px" placeholder="https://youtu.be/...">${esc(l.videos.join('\n'))}</textarea>
      <span class="hint">Ένας σύνδεσμος ανά γραμμή (κανονικά βίντεο ή shorts). Ανοίγουν στο YouTube.</span></label>
    <div><b style="font-size:13.5px;color:var(--navy)">Προσομοιώσεις</b>${simPicker(l.sims)}</div>
    <label>Ερωτήσεις αυτοελέγχου<textarea name="quiz" style="min-height:160px" placeholder="? Πόση πίεση ασκούν 10 m νερού;\n- 0,1 bar\n* 1 bar\n- 10 bar\n> p = ρ·g·h ≈ 998·9,81·10 Pa ≈ 0,98 bar">${esc(l.quiz)}</textarea>
      <span class="hint">«?» ερώτηση · «-» λάθος επιλογή · «*» σωστή · «>» επεξήγηση (προαιρετική). Οι απαντήσεις δεν αποθηκεύονται.</span></label>
    <label class="chk"><input type="checkbox" name="pub" ${l.published ? 'checked' : ''}> <span>Δημοσιευμένο (ορατό στους χρήστες)</span></label>
    <div class="row"><button class="btn primary">Αποθήκευση</button><span class="spacer"></span><button type="button" class="btn" id="copyl">⧉ Αντιγραφή σε άλλη ενότητα</button><button type="button" class="btn danger" id="dell">Διαγραφή μαθήματος</button></div>
    <div id="copybox"></div>
  </form><div class="stack"><div class="panel"><h2>Υλικό (φύλλα εργασίας κ.λπ.)</h2>
    <p class="muted small">Ιδιωτικά αρχεία: τα βλέπουν μόνο όσοι έχουν πρόσβαση στην ενότητα, όταν το μάθημα είναι δημοσιευμένο. Έως 20 MB το καθένα.</p>
    <div id="mats">${materialsList(mats, true)}</div><div style="margin-top:8px">${uploadBox()}</div></div>
    ${quizHelp()}</div></div>`;
  bindMaterials(c.id, l.id, true);
  $('#fl').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    const vids = f.videos.value.split('\n').map(s => s.trim()).filter(Boolean);
    const recap = f.recap.value.split('\n').map(s => s.trim()).filter(Boolean);
    const bad = [...recap, ...vids].filter(v => !ytId(v));
    if (bad.length) return toast('Μη έγκυρος σύνδεσμος YouTube: ' + bad[0], true);
    try {
      await q(sb.from('lessons').update({ title: f.elements.namedItem('title').value.trim(), position: +f.pos.value || 0, summary: f.summary.value,
        videos: vids, recap_videos: recap.map(v => 'https://www.youtube.com/watch?v=' + ytId(v)), sims: $$('input[name=sim]:checked', f).map(x => x.value), quiz: f.quiz.value, published: f.pub.checked }).eq('id', l.id));
      toast('Αποθηκεύτηκε.'); go(`#/c/${c.id}/lesson/${l.id}`);
    } catch (er) { toast(errText(er), true); }
  };
  $('#copyl').onclick = async () => {
    const box = $('#copybox'); if (box.innerHTML) { box.innerHTML = ''; return; }
    const others = await myOtherClasses(c.id);
    if (!others.length) { box.innerHTML = msgBox('info', 'Δεν έχετε άλλη ενότητα. Φτιάξτε πρώτα μία από «Οι ενότητές μου».'); return; }
    box.innerHTML = `<div class="msg info" style="margin-top:12px"><div class="row"><span>Αντιγραφή του μαθήματος (με τα αρχεία του) στην ενότητα:</span>
      <select class="inp" id="copyto" style="max-width:280px">${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select>
      <button type="button" class="btn primary small" id="copygo">Αντιγραφή</button></div>
      <p class="small" style="margin:6px 0 0">Αποθηκεύστε πρώτα τυχόν αλλαγές. Το αντίγραφο μπαίνει ως πρόχειρο στο τέλος της ενότητας.</p></div>`;
    $('#copygo').onclick = async () => {
      const to = $('#copyto').value; $('#copygo').disabled = true;
      try { const r = await copyLessons([l.id], to, false); if (r.errors.length) { $('#copybox').innerHTML = copyReport(r); return; } toast('Αντιγράφηκε.'); go('#/c/' + to); }
      catch (er) { toast(errText(er), true); $('#copygo').disabled = false; }
    };
  };
  $('#dell').onclick = async () => {
    if (!confirm('Οριστική διαγραφή μαθήματος και των αρχείων του;')) return;
    try { if (mats.length) await sb.storage.from('materials').remove(mats.map(m => m.path)); await q(sb.from('materials').delete().eq('item_id', l.id));
      await q(sb.from('lessons').delete().eq('id', l.id)); go('#/c/' + c.id); } catch (er) { toast(errText(er), true); }
  };
}
const quizHelp = () => `<div class="panel small"><h3>Παράδειγμα ερωτήσεων</h3><pre style="white-space:pre-wrap;margin:0;font-size:12.5px">? Τι δείχνει το μανόμετρο;
- Απόλυτη πίεση
* Μανομετρική πίεση
> Απόλυτη = μανομετρική + ατμοσφαιρική.

? 10 m στήλης νερού ≈ ;
- 0,1 bar
* 1 bar
- 10 bar</pre></div>`;

// ================================================================ ΕΡΓΑΣΙΑ
route(/^\/c\/([\w-]{36})\/asg\/([\w-]{36})(?:\/(edit|grade))?(?:\/([\w-]{36}))?$/, async (cid, aid, mode, sid, tok) => {
  if (needLogin()) return;
  if (!F.assignments) return go('#/c/' + cid);
  const [c, a, mats] = await Promise.all([loadClass(cid),
    q(sb.from('assignments').select('*, lessons(id,title)').eq('id', aid).maybeSingle()),
    q(sb.from('materials').select('*').eq('item_id', aid).order('created_at'))]);
  if (stale(tok)) return;
  if (!a) throw new Error('Η εργασία δεν βρέθηκε.');
  if (mode === 'edit' && c.mine) return asgEdit(c, a, mats);
  if (mode === 'grade' && c.mine) return asgGrade(c, a, sid, tok);
  const head = `<p class="small"><a href="#/c/${c.id}/asg">← Εργασίες · ${esc(c.name)}</a></p>
    <div class="row between"><h1>${esc(a.title)}</h1>${c.mine ? `<span class="row"><a class="btn" href="#/c/${c.id}/asg/${a.id}/edit">Επεξεργασία</a><a class="btn primary" href="#/c/${c.id}/asg/${a.id}/grade">Υποβολές</a></span>` : ''}</div>
    ${!a.published ? msgBox('warn', 'Πρόχειρο — δεν είναι ορατό στους χρήστες.') : ''}
    <div class="row small muted" style="margin:6px 0 12px"><span>${a.due_at ? 'Προθεσμία: <b>' + fmtDate(a.due_at) + '</b>' : 'Χωρίς προθεσμία'}</span><span>· ${num(a.max_points)} μονάδες</span>
    ${a.lessons ? `<span>· Μάθημα: <a href="#/c/${c.id}/lesson/${a.lessons.id}">${esc(a.lessons.title)}</a></span>` : ''}</div>`;
  const info = `<div class="panel text"><h2>Οδηγίες</h2>${rich(a.instructions) || '<p class="muted">—</p>'}
    ${mats.length ? `<h3 style="margin-top:12px">Συνημμένα</h3><div id="mats">${materialsList(mats, false)}</div>` : ''}</div>`;
  if (c.mine) { app.innerHTML = head + info; bindMaterials(c.id, a.id); return; }
  const sub = await q(sb.from('submissions').select('*').eq('assignment_id', a.id).eq('student_id', me.id).maybeSingle());
  if (stale(tok)) return;
  app.innerHTML = head + `<div class="two">${info}<div class="panel" id="subp">${submissionPanel(a, sub)}</div></div>`;
  bindMaterials(c.id, a.id);
  bindSubmission(c, a, sub);
});

function submissionPanel(a, s) {
  const past = a.due_at && new Date() > new Date(a.due_at);
  if (s && s.graded_at) {
    return `<h2>Η υποβολή μου</h2><p><span class="pill ok">Βαθμολογήθηκε</span></p>
      ${s.points != null ? `<p style="font-size:26px;font-weight:800;color:var(--navy);margin:6px 0">${num(s.points)} <span class="muted" style="font-size:16px">/ ${num(a.max_points)}</span></p>` : ''}
      ${s.feedback ? `<div class="msg info text"><b>Σχόλια εκπαιδευτή</b>${rich(s.feedback)}</div>` : ''}
      <h3 style="margin-top:14px">Η απάντησή μου</h3><div class="text">${rich(s.body) || '<p class="muted">—</p>'}</div>
      ${s.file_path ? `<p>📎 <button class="link" data-sfile="${esc(s.file_path)}">${esc(s.file_name || 'αρχείο')}</button></p>` : ''}
      <p class="muted small">Υποβλήθηκε ${fmtDate(s.submitted_at)}</p>`;
  }
  if (past && !a.allow_late && !s) return `<h2>Υποβολή</h2>${msgBox('err', 'Η προθεσμία έληξε και δεν δέχεται εκπρόθεσμες υποβολές.')}`;
  return `<h2>${s ? 'Η υποβολή μου' : 'Υποβολή'}</h2>
    ${s ? msgBox('ok', `Υποβλήθηκε ${fmtDate(s.submitted_at)}${s.updated_at && new Date(s.updated_at) - new Date(s.submitted_at) > 2000 ? ' · τελευταία αλλαγή ' + fmtDate(s.updated_at) : ''}. Μπορείτε να την αλλάξετε μέχρι να βαθμολογηθεί.`) : ''}
    ${past ? msgBox('warn', 'Η προθεσμία έληξε — η υποβολή θα σημειωθεί ως εκπρόθεσμη.') : ''}
    <form class="f" id="fsub" style="margin-top:10px">
      <label>Απάντηση<textarea name="body" style="min-height:160px" maxlength="20000">${esc(s ? s.body : '')}</textarea></label>
      ${s && s.file_path ? `<p class="small">📎 <button type="button" class="link" data-sfile="${esc(s.file_path)}">${esc(s.file_name)}</button> · <label class="chk" style="display:inline-flex"><input type="checkbox" name="rmfile"> αφαίρεση</label></p>` : ''}
      <label>${s && s.file_path ? 'Αντικατάσταση αρχείου' : 'Αρχείο (προαιρετικά)'}<input type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf">
        <span class="hint">Φωτογραφία ή PDF, έως 5 MB. Οι φωτογραφίες από κινητό μικραίνουν αυτόματα.</span></label>
      <div id="sout"></div>
      <div class="row"><button class="btn accent">${s ? 'Ενημέρωση υποβολής' : 'Υποβολή'}</button>${s ? '<span class="spacer"></span><button type="button" class="btn danger small" id="unsub">Απόσυρση</button>' : ''}</div>
    </form>`;
}

function bindSubmission(c, a, s) {
  $$('[data-sfile]').forEach(b => b.onclick = () => openFile('submissions', b.dataset.sfile));
  const f = $('#fsub'); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault(); const out = $('#sout'), btn = $('button.accent', f);
    let file = f.file.files[0];
    const body = f.body.value.trim();
    if (!body && !file && !(s && s.file_path && !(f.rmfile && f.rmfile.checked))) return out.innerHTML = msgBox('err', 'Γράψτε μια απάντηση ή επισυνάψτε αρχείο.');
    btn.disabled = true; out.innerHTML = msgBox('info', 'Αποστολή…');
    try {
      const row = { body };
      const oldPath = s && s.file_path;
      if (file) {
        if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type)) throw new Error('Επιτρέπονται μόνο φωτογραφίες (JPG/PNG/WebP) ή PDF.');
        file = await shrinkImage(file);
        if (file.size > 5 * 1048576) throw new Error('Το αρχείο ξεπερνά τα 5 MB.');
        const path = `${a.id}/${me.id}/${Date.now()}-${safeName(file.name)}`;
        await q(sb.storage.from('submissions').upload(path, file, { contentType: file.type }));
        Object.assign(row, { file_path: path, file_name: file.name, file_size: file.size });
      } else if (f.rmfile && f.rmfile.checked) Object.assign(row, { file_path: null, file_name: null, file_size: null });
      if (s) await q(sb.from('submissions').update(row).eq('id', s.id));
      else await q(sb.from('submissions').insert({ assignment_id: a.id, ...row }));
      if (oldPath && row.file_path !== undefined && row.file_path !== oldPath) await sb.storage.from('submissions').remove([oldPath]);
      toast('Η υποβολή καταχωρήθηκε.'); render();
    } catch (er) { out.innerHTML = msgBox('err', esc(errText(er))); btn.disabled = false; }
  };
  const un = $('#unsub');
  if (un) un.onclick = async () => {
    if (!confirm('Απόσυρση της υποβολής;')) return;
    try { if (s.file_path) await sb.storage.from('submissions').remove([s.file_path]); await q(sb.from('submissions').delete().eq('id', s.id)); render(); }
    catch (er) { toast(errText(er), true); }
  };
}

const toLocalInput = d => { if (!d) return ''; const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };

async function asgEdit(c, a, mats) {
  const ls = await q(sb.from('lessons').select('id,title').eq('class_id', c.id).order('position').order('created_at'));
  app.innerHTML = `<p class="small"><a href="#/c/${c.id}/asg/${a.id}">← Προβολή εργασίας</a></p><h1>Επεξεργασία εργασίας</h1>
  <div class="two"><form class="f panel" id="fa">
    <label>Τίτλος<input type="text" name="title" maxlength="160" value="${esc(a.title)}" required></label>
    <label>Οδηγίες<textarea name="ins" style="min-height:200px">${esc(a.instructions)}</textarea></label>
    <label>Μάθημα<select name="lesson"><option value="">—</option>${ls.map(l => `<option value="${l.id}" ${a.lesson_id === l.id ? 'selected' : ''}>${esc(l.title)}</option>`).join('')}</select></label>
    <div class="row"><label>Προθεσμία<input type="datetime-local" name="due" value="${toLocalInput(a.due_at)}"></label>
    <label>Μονάδες<input type="number" name="max" min="1" step="0.5" value="${num(a.max_points).replace(',', '.')}" style="max-width:120px"></label></div>
    <label class="chk"><input type="checkbox" name="late" ${a.allow_late ? 'checked' : ''}> <span>Δεκτές εκπρόθεσμες υποβολές</span></label>
    <label class="chk"><input type="checkbox" name="pub" ${a.published ? 'checked' : ''}> <span>Δημοσιευμένη (ορατή στους σπουδαστές)</span></label>
    <div class="row"><button class="btn primary">Αποθήκευση</button><span class="spacer"></span><button type="button" class="btn danger" id="dela">Διαγραφή εργασίας</button></div>
  </form><div class="panel"><h2>Συνημμένα</h2><p class="muted small">Π.χ. το φύλλο εργασίας σε PDF. Ιδιωτικά για όσους έχουν πρόσβαση στην ενότητα.</p>
    <div id="mats">${materialsList(mats, true)}</div><div style="margin-top:8px">${uploadBox()}</div></div></div>`;
  bindMaterials(c.id, a.id, true);
  $('#fa').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    try {
      await q(sb.from('assignments').update({ title: f.elements.namedItem('title').value.trim(), instructions: f.ins.value, lesson_id: f.lesson.value || null,
        due_at: f.due.value ? new Date(f.due.value).toISOString() : null, max_points: +f.max.value || 10, allow_late: f.late.checked, published: f.pub.checked }).eq('id', a.id));
      toast('Αποθηκεύτηκε.'); go(`#/c/${c.id}/asg/${a.id}`);
    } catch (er) { toast(errText(er), true); }
  };
  $('#dela').onclick = async () => {
    if (!confirm('Οριστική διαγραφή εργασίας, συνημμένων και όλων των υποβολών;')) return;
    try {
      if (mats.length) await sb.storage.from('materials').remove(mats.map(m => m.path));
      const fs = await q(sb.from('submissions').select('file_path').eq('assignment_id', a.id).not('file_path', 'is', null));
      if (fs.length) await sb.storage.from('submissions').remove(fs.map(x => x.file_path));
      await q(sb.from('materials').delete().eq('item_id', a.id));
      await q(sb.from('assignments').delete().eq('id', a.id)); go(`#/c/${c.id}/asg`);
    } catch (er) { toast(errText(er), true); }
  };
}

async function asgGrade(c, a, subId, tok) {
  const [enr, subs] = await Promise.all([
    q(sb.from('enrollments').select('user_id,profiles(full_name)').eq('class_id', c.id)),
    q(sb.from('submissions').select('*, profiles(full_name)').eq('assignment_id', a.id))]);
  if (stale(tok)) return;
  const byS = {}; subs.forEach(s => byS[s.student_id] = s);
  const people = enr.map(e => ({ id: e.user_id, name: e.profiles?.full_name || '—' }));
  subs.forEach(s => { if (!people.find(p => p.id === s.student_id)) people.push({ id: s.student_id, name: (s.profiles?.full_name || '—') + ' (εκτός ενότητας)' }); });
  people.sort((x, y) => x.name.localeCompare(y.name, 'el'));
  const cur = subs.find(s => s.id === subId);
  const st = s => !s ? '<span class="pill">Δεν υπέβαλε</span>' : s.graded_at ? `<span class="pill ok">${s.points != null ? num(s.points) + '/' + num(a.max_points) : 'Σχόλια'}</span>`
    : `<span class="pill ${a.due_at && new Date(s.submitted_at) > new Date(a.due_at) ? 'warn' : 'info'}">Προς βαθμολόγηση</span>`;
  app.innerHTML = `<p class="small"><a href="#/c/${c.id}/asg/${a.id}">← ${esc(a.title)}</a></p><h1>Υποβολές: ${esc(a.title)}</h1>
  <p class="muted small">${subs.length} από ${enr.length} υπέβαλαν · ${subs.filter(s => s.graded_at).length} βαθμολογημένες</p>
  <div class="two"><div class="panel tablewrap"><table class="t"><thead><tr><th>Σπουδαστής</th><th>Υποβολή</th><th>Κατάσταση</th></tr></thead><tbody>
    ${people.map(p => { const s = byS[p.id]; return `<tr class="${s ? 'click' : ''} ${cur && s && cur.id === s.id ? 'sel' : ''}" ${s ? `data-go="${s.id}"` : ''}><td>${esc(p.name)}</td><td>${s ? fmtDate(s.submitted_at) : ''}</td><td>${st(s)}</td></tr>`; }).join('')}
  </tbody></table></div>
  <div class="panel" id="gp">${cur ? '' : '<p class="muted">Επιλέξτε μια υποβολή από τη λίστα.</p>'}</div></div>`;
  $$('[data-go]').forEach(r => r.onclick = () => go(`#/c/${c.id}/asg/${a.id}/grade/${r.dataset.go}`));
  if (!cur) return;
  const gp = $('#gp'); const isImg = /\.(jpe?g|png|webp)$/i.test(cur.file_path || '');
  const late = a.due_at && new Date(cur.submitted_at) > new Date(a.due_at);
  gp.innerHTML = `<h2>${esc(cur.profiles?.full_name || '')}</h2>
    <p class="muted small">Υποβλήθηκε ${fmtDate(cur.submitted_at)}${late ? ' · <b style="color:var(--warn)">εκπρόθεσμα</b>' : ''}</p>
    <div class="text panel" style="background:var(--soft)">${rich(cur.body) || '<p class="muted">(χωρίς κείμενο)</p>'}</div>
    ${cur.file_path ? `<p>📎 <button class="link" data-sfile="${esc(cur.file_path)}">${esc(cur.file_name || 'αρχείο')}</button> <span class="muted small">${cur.file_size ? fmtSize(cur.file_size) : ''}</span></p>${isImg ? '<img class="preview" id="pv" alt="Συνημμένη φωτογραφία">' : ''}` : ''}
    <form class="f" id="fg" style="margin-top:12px">
      <label>Βαθμός (0–${num(a.max_points)})<input type="number" name="pts" min="0" max="${a.max_points}" step="0.5" value="${cur.points ?? ''}" style="max-width:140px"></label>
      <label>Σχόλια προς τον σπουδαστή<textarea name="fb" style="min-height:120px">${esc(cur.feedback || '')}</textarea></label>
      <div class="row"><button class="btn accent" name="ret">${cur.graded_at ? 'Ενημέρωση βαθμού' : 'Βαθμολόγηση & επιστροφή'}</button>
      ${cur.graded_at ? '<button type="button" class="btn" id="reopen">Επαναφορά για διόρθωση</button>' : ''}</div>
      <p class="muted small">Ο σπουδαστής βλέπει βαθμό και σχόλια μόλις πατήσετε το κουμπί. Με «Επαναφορά» μπορεί να αλλάξει ξανά την υποβολή του.</p>
    </form>`;
  $$('[data-sfile]', gp).forEach(b => b.onclick = () => openFile('submissions', b.dataset.sfile));
  if (isImg) signedUrl('submissions', cur.file_path).then(u => { const i = $('#pv'); if (i) i.src = u; }).catch(() => {});
  $('#fg').onsubmit = async e => {
    e.preventDefault(); const f = e.target; const p = f.pts.value === '' ? null : +f.pts.value;
    if (p != null && (p < 0 || p > a.max_points)) return toast(`Ο βαθμός πρέπει να είναι 0–${num(a.max_points)}.`, true);
    try {
      await q(sb.from('submissions').update({ points: p, feedback: f.fb.value.trim() || null, status: 'returned' }).eq('id', cur.id));
      toast('Αποθηκεύτηκε.');
      const next = people.map(x => byS[x.id]).find(s => s && !s.graded_at && s.id !== cur.id);
      go(`#/c/${c.id}/asg/${a.id}/grade${next ? '/' + next.id : ''}`);
    } catch (er) { toast(errText(er), true); }
  };
  const ro = $('#reopen');
  if (ro) ro.onclick = async () => {
    try { await q(sb.from('submissions').update({ status: 'submitted' }).eq('id', cur.id)); toast('Η υποβολή άνοιξε ξανά.'); render(); }
    catch (er) { toast(errText(er), true); }
  };
}

// ================================================================ ΜΗΝΥΜΑΤΑ
route(/^\/c\/([\w-]{36})\/chat(?:\/([\w-]{36}))?$/, async (cid, sid, tok) => {
  if (needLogin()) return;
  if (!F.messages) return go('#/c/' + cid);
  const c = await loadClass(cid); if (stale(tok)) return;
  if (!c.mine) sid = me.id;
  if (c.mine && !sid) {
    const [enr, msgs] = await Promise.all([
      q(sb.from('enrollments').select('user_id,profiles(full_name)').eq('class_id', c.id)),
      q(sb.from('messages').select('student_id,sender_id,read_at,created_at,body').eq('class_id', c.id).order('created_at', { ascending: false }))]);
    if (stale(tok)) return;
    const last = {}, un = {};
    msgs.forEach(m => { if (!last[m.student_id]) last[m.student_id] = m; if (!m.read_at && m.sender_id !== me.id) un[m.student_id] = (un[m.student_id] || 0) + 1; });
    enr.sort((x, y) => (last[y.user_id] ? new Date(last[y.user_id].created_at) : 0) - (last[x.user_id] ? new Date(last[x.user_id].created_at) : 0) || (x.profiles?.full_name || '').localeCompare(y.profiles?.full_name || '', 'el'));
    app.innerHTML = classHead(c, 'chat') + `<div class="panel">${enr.length ? `<ul class="list">${enr.map(e => `<li><a class="item" href="#/c/${c.id}/chat/${e.user_id}">
      <span class="spacer"><b>${esc(e.profiles?.full_name || '—')}</b>${un[e.user_id] ? `<span class="badge">${un[e.user_id]}</span>` : ''}<br>
      <span class="muted small">${last[e.user_id] ? esc(last[e.user_id].body.slice(0, 90)) + ' · ' + fmtDay(last[e.user_id].created_at) : 'Χωρίς μηνύματα'}</span></span></a></li>`).join('')}</ul>` : '<div class="empty">Δεν υπάρχουν σπουδαστές.</div>'}</div>`;
    return;
  }
  const other = c.mine ? await q(sb.from('profiles').select('full_name').eq('id', sid).maybeSingle()) : await q(sb.from('profiles').select('full_name').eq('id', c.owner).maybeSingle());
  if (stale(tok)) return;
  app.innerHTML = classHead(c, 'chat') + `<div class="panel" style="max-width:820px">
    ${c.mine ? `<p class="small"><a href="#/c/${c.id}/chat">← Όλες οι συνομιλίες</a></p>` : ''}
    <h2>${esc(other?.full_name || '')}</h2>
    ${!c.mine ? '<p class="muted small">Ιδιωτική συνομιλία με τον εκπαιδευτή — δεν τη βλέπουν οι συμφοιτητές σας.</p>' : ''}
    <div class="chat" id="chat"></div>
    <form class="row" id="fm" style="margin-top:10px;align-items:flex-end"><textarea class="inp" name="body" maxlength="4000" style="min-height:60px;flex:1" placeholder="Γράψτε μήνυμα…" required></textarea><button class="btn primary">Αποστολή</button></form></div>`;
  let shown = -1;
  const load = async () => {
    const msgs = await q(sb.from('messages').select('*').eq('class_id', c.id).eq('student_id', sid).order('created_at'));
    if (stale(tok)) return;
    if (msgs.length !== shown) {
      shown = msgs.length; const box = $('#chat');
      box.innerHTML = msgs.length ? msgs.map(m => `<div class="bubble ${m.sender_id === me.id ? 'me' : ''}"><div class="text">${rich(m.body)}</div><time>${fmtDate(m.created_at)}</time></div>`).join('')
        : '<p class="muted small">Δεν υπάρχουν μηνύματα ακόμη.</p>';
      box.scrollTop = box.scrollHeight;
      if (msgs.some(m => !m.read_at && m.sender_id !== me.id)) { await sb.rpc('mark_read', { cid: c.id, sid }); refreshUnread(); }
    }
  };
  await load();
  const f = $('#fm');
  f.body.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) f.requestSubmit(); };
  f.onsubmit = async e => {
    e.preventDefault(); const b = f.body.value.trim(); if (!b) return;
    try { await q(sb.from('messages').insert({ class_id: c.id, student_id: sid, body: b })); f.body.value = ''; await load(); }
    catch (er) { toast(errText(er), true); }
  };
  const iv = setInterval(() => { if (stale(tok)) return clearInterval(iv); if (document.visibilityState === 'visible') load().catch(() => {}); }, 15000);
});


// ================================================================ ΣΤΑΤΙΣΤΙΚΑ ΔΙΑΧΕΙΡΙΣΤΗ
const KIND = {
  lesson_view: ['👁', 'Άνοιξε μάθημα'], lesson_complete: ['✓', 'Ολοκλήρωσε μάθημα'],
  material_download: ['📄', 'Άνοιξε αρχείο'], video_open: ['▶', 'Άνοιξε βίντεο'], sim_open: ['◎', 'Άνοιξε προσομοίωση']
};
const tile = (v, label, sub) => `<div class="tile"><b>${v}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
const relDay = d => {
  if (!d) return '—';
  // ημερολογιακές μέρες στην τοπική ώρα (όχι «24ωρα»)
  const t = new Date(d), mid = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((mid(new Date()) - mid(t)) / 864e5);
  const hm = new Intl.DateTimeFormat('el-GR', { hour: '2-digit', minute: '2-digit' }).format(t);
  return days <= 0 ? `σήμερα ${hm}` : days === 1 ? `χθες ${hm}` : days < 30 ? `πριν ${days} μέρες` : fmtDay(d);
};
// ταξινόμηση πίνακα με κλικ στην κεφαλίδα (αριθμοί/ημερομηνίες: πρώτα τα μεγαλύτερα)
function sortable(table) {
  if (!table) return;
  const body = table.tBodies[0], ths = [...table.tHead.rows[0].cells];
  ths.forEach((th, i) => {
    th.classList.add('sortable'); th.tabIndex = 0; th.title = 'Ταξινόμηση';
    const num = th.classList.contains('n'), date = th.hasAttribute('data-d');
    const go = () => {
      const dir = th.getAttribute('aria-sort') === 'descending' ? 'ascending' : th.getAttribute('aria-sort') === 'ascending' ? 'descending' : (num || date ? 'descending' : 'ascending');
      ths.forEach(x => x.removeAttribute('aria-sort')); th.setAttribute('aria-sort', dir);
      const k = tr => { const td = tr.cells[i]; if (!td) return ''; const v = td.dataset.v !== undefined ? td.dataset.v : td.textContent.trim(); return num ? (parseFloat(v) || 0) : v; };
      const rows = [...body.rows].filter(r => !r.classList.contains('deleted')), tail = [...body.rows].filter(r => r.classList.contains('deleted'));
      const m = dir === 'ascending' ? 1 : -1;
      rows.sort((a, b) => { const x = k(a), y = k(b); if (!num && (x === '' || y === '')) return x === y ? 0 : x === '' ? 1 : -1; return (num ? x - y : String(x).localeCompare(String(y), 'el', { numeric: true, sensitivity: 'base' })) * m; });
      [...rows, ...tail].forEach(r => body.appendChild(r));
    };
    th.onclick = go; th.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
}
function dailyChart(daily) {
  const W = 720, H = 180, P = { l: 34, r: 8, t: 10, b: 24 };
  const max = Math.max(4, ...daily.map(d => d.events));
  const step = Math.pow(10, Math.floor(Math.log10(max))) * (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 2 : 1);
  const top = Math.ceil(max / step) * step;
  const bw = (W - P.l - P.r) / daily.length, y = v => P.t + (H - P.t - P.b) * (1 - v / top);
  const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
  return `<div class="chartwrap"><svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Ενέργειες χρηστών ανά ημέρα, τελευταίες 30 ημέρες">
    ${ticks.map(v => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${P.l - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${v}</text>`).join('')}
    ${daily.map((d, i) => { const x = P.l + i * bw + 1, h = H - P.b - y(d.events);
      return `<g class="bar" data-tip="${fmtDay(d.day)}: ${d.events} ενέργειες · ${d.users} χρήστες"><rect x="${P.l + i * bw}" y="${P.t}" width="${bw}" height="${H - P.t - P.b}" fill="transparent"/>
      ${d.events ? `<path d="M${x},${H - P.b} v${-(h - 3)} q0,-3 3,-3 h${bw - 8} q3,0 3,3 v${h - 3} z" class="mark"/>` : ''}</g>`; }).join('')}
    ${daily.map((d, i) => i % 5 === 0 || i === daily.length - 1 ? `<text x="${P.l + i * bw + bw / 2}" y="${H - 6}" class="ax" text-anchor="middle">${fmtDay(d.day)}</text>` : '').join('')}
  </svg><div class="tip" hidden></div></div>`;
}
function bindChart() {
  const w = $('.chartwrap'); if (!w) return; const tip = $('.tip', w);
  $$('.bar', w).forEach(g => {
    g.addEventListener('mousemove', e => { const r = w.getBoundingClientRect(); tip.textContent = g.dataset.tip; tip.hidden = false;
      tip.style.left = Math.min(r.width - 170, Math.max(0, e.clientX - r.left - 80)) + 'px'; tip.style.top = (e.clientY - r.top - 44) + 'px'; g.classList.add('on'); });
    g.addEventListener('mouseleave', () => { tip.hidden = true; g.classList.remove('on'); });
  });
}

route(/^\/(?:admin|me\/stats)$/, async tok => {
  if (needLogin()) return;
  if (!isTeacher()) return go('#/');
  const [o, intr, gone] = await Promise.all([q(sb.rpc('admin_overview')), sb.rpc('admin_interest').then(r => r.error ? null : (r.data || []), () => null),
    sb.rpc('admin_accounts').then(r => r.error ? null : (r.data || []), () => null)]);
  if (stale(tok)) return;
  const k = o.kpi, del = o.deleted || {};
  // ενδιαφέρον για μαθήματα που έρχονται (catalog.js): ομαδοποίηση ανά μάθημα
  const cName = key => { for (const t of TRACKS) for (const l of t.levels) for (const c of l.courses) if (c.key === key) return c.name; return key; };
  const byC = {}; (intr || []).forEach(r => (byC[r.course_key] = byC[r.course_key] || []).push(r));
  const cKeys = Object.keys(byC).sort((a, b) => byC[b].length - byC[a].length);
  const intrHTML = intr === null
    ? `<p class="muted small">Για να δείτε ποιοι ζήτησαν ενημέρωση, τρέξτε το <code>update_08_interest_list.sql</code> στο Supabase (SQL Editor).</p>`
    : !cKeys.length ? `<p class="muted small">Κανείς δεν έχει ζητήσει ακόμη ενημέρωση.</p>`
    : cKeys.map(key => `<details class="intr"><summary><b>${esc(cName(key))}</b> <span class="pill info">🔔 ${byC[key].length}</span></summary>
        <div class="row" style="margin:8px 0"><button class="btn small" data-copy="${esc(key)}">Αντιγραφή email</button><a class="btn small" href="mailto:?bcc=${encodeURIComponent(byC[key].map(r => r.email).join(','))}&subject=${encodeURIComponent('Άνοιξε το μάθημα: ' + cName(key))}">✉ Email (Bcc)</a></div>
        <div class="tablewrap"><table class="t"><thead><tr><th>Όνομα</th><th>Email</th><th>Δήλωση</th></tr></thead><tbody>
        ${byC[key].map(r => `<tr><td>${esc(r.full_name || '')}</td><td class="muted">${esc(r.email || '')}</td><td>${fmtDay(r.created_at)}</td></tr>`).join('')}</tbody></table></div></details>`).join('');
  const goneN = (gone || []).length, gone30 = (gone || []).filter(g => Date.now() - new Date(g.deleted_at) < 30 * 864e5).length;
  const delAny = (del.views || 0) + (del.completions || 0) + (del.downloads || 0) + (del.videos || 0) + (del.sims || 0);
  app.innerHTML = meLayout('stats', `<div class="row between"><h1 style="margin-top:0">📊 Στατιστικά</h1><button class="btn small" id="csvu">Λήψη χρηστών (CSV)</button></div>
  <div class="tiles">
    ${tile(k.users, 'εγγεγραμμένοι χρήστες', `+${k.new7} τις τελευταίες 7 μέρες${gone ? ` · ${goneN} διαγραφ${goneN === 1 ? 'ή' : 'ές'}${gone30 ? ` (${gone30} τον τελευταίο μήνα)` : ''}` : ''}`)}
    ${tile(k.active7, 'ενεργοί (7 ημέρες)', 'με τουλάχιστον μία ενέργεια')}
    ${tile(k.completions, 'ολοκληρώσεις μαθημάτων')}
    ${tile(k.downloads, 'ανοίγματα αρχείων')}
    ${tile(k.videos, 'ανοίγματα βίντεο')}
    ${tile(k.sims, 'ανοίγματα προσομοιώσεων')}
  </div>
  <div class="panel"><h2>Δραστηριότητα — τελευταίες 30 ημέρες</h2>${dailyChart(o.daily)}</div>
  <div class="panel"><h2>Ανά μάθημα</h2><p class="muted small" style="margin:0 0 6px">Πατήστε στον τίτλο μιας στήλης για ταξινόμηση.</p><div class="tablewrap"><table class="t" id="lt"><thead><tr><th>Μάθημα</th><th>Ενότητα</th><th class="n">Προβολές</th><th class="n">Μοναδικοί</th><th class="n">Ολοκληρώσεις</th><th class="n">Αρχεία</th><th class="n">Βίντεο</th><th class="n">Προσομ.</th></tr></thead><tbody>
    ${o.lessons.map(l => `<tr><td>${esc(l.title)}</td><td class="muted">${esc(l.class_name)}</td><td class="n">${l.views}</td><td class="n">${l.viewers}</td><td class="n">${l.completions}</td><td class="n">${l.downloads}</td><td class="n">${l.videos}</td><td class="n">${l.sims}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Δεν υπάρχουν δημοσιευμένα μαθήματα.</td></tr>'}
  </tbody></table></div></div>
  <div class="panel"><div class="row between"><h2 style="margin:0">🔔 Ενδιαφέρον για μαθήματα που έρχονται</h2>${cKeys.length ? '<button class="btn small" id="csvi">Λήψη (CSV)</button>' : ''}</div>
    <p class="muted small" style="margin:4px 0 8px">Ποιοι πάτησαν «Ενημέρωσέ με όταν ανοίξει». Όταν ανοίξει το μάθημα, στείλτε τους email με τους παραλήπτες σε Bcc.</p>${intrHTML}</div>
  <div class="panel"><div class="row between"><h2 style="margin:0">Χρήστες (${o.people.length})${goneN ? ` <span class="muted small">· ${goneN} διαγραμμένοι</span>` : ''}</h2><input class="inp" id="uq" placeholder="Αναζήτηση ονόματος ή email" style="max-width:280px"></div>
  <div class="tablewrap" style="margin-top:10px"><table class="t" id="pt"><thead><tr><th>Όνομα</th><th>Email</th><th data-d="1">Εγγραφή</th><th data-d="1">Διαγραφή</th><th data-d="1">Τελευταία δραστηριότητα</th><th class="n">Ολοκλ.</th><th class="n">Αρχεία</th><th class="n">Βίντεο</th><th class="n">Προσομ.</th></tr></thead><tbody id="ub">
    ${o.people.map(p => `<tr class="click" data-u="${p.id}" data-s="${esc((p.full_name + ' ' + p.email).toLowerCase())}"><td>${esc(p.full_name)}</td><td class="muted">${esc(p.email)}</td><td data-v="${esc(p.created_at || '')}">${fmtDay(p.created_at)}</td><td data-v="" class="muted">—</td><td data-v="${esc(p.last_activity || '')}">${relDay(p.last_activity)}</td><td class="n">${p.completions}</td><td class="n">${p.downloads}</td><td class="n">${p.videos}</td><td class="n">${p.sims}</td></tr>`).join('')}
    ${(gone || []).map(g => `<tr class="deleted" data-s=""><td style="white-space:nowrap"><i>Διαγραμμένος λογαριασμός</i></td><td class="muted">—</td><td data-v="${esc(g.signed_up_at || '')}">${fmtDay(g.signed_up_at)}</td><td data-v="${esc(g.deleted_at || '')}">${fmtDay(g.deleted_at)}</td><td data-v="" class="muted">—</td><td colspan="4"></td></tr>`).join('')}
    ${delAny ? `<tr class="click deleted" data-u="deleted" data-s=""><td colspan="5"><i>Διαγραμμένοι χρήστες (ανώνυμα)</i></td><td class="n">${del.completions}</td><td class="n">${del.downloads}</td><td class="n">${del.videos}</td><td class="n">${del.sims}</td></tr>` : ''}
  </tbody></table></div>
  <p class="muted small">Τα «βίντεο» μετρούν τα κλικ για άνοιγμα στο YouTube, όχι τον χρόνο παρακολούθησης. Όταν ένας χρήστης διαγράφει τον λογαριασμό του, η δραστηριότητά του παραμένει μόνο ανώνυμα στα σύνολα· κρατιούνται μόνο οι ημερομηνίες εγγραφής και διαγραφής, χωρίς όνομα ή email.${gone === null ? ' Για να εμφανίζονται οι διαγραφές, τρέξτε το <code>update_10_account_log.sql</code> στο Supabase (SQL Editor).' : ''}</p></div>`);
  bindChart();
  sortable($('#lt')); sortable($('#pt'));
  $$('#ub tr.click').forEach(r => r.onclick = () => go('#/admin/u/' + r.dataset.u));
  $('#uq').oninput = e => { const v = e.target.value.trim().toLowerCase(); $$('#ub tr').forEach(r => r.hidden = !!v && !(r.dataset.s || '').includes(v)); };
  $$('[data-copy]').forEach(b => b.onclick = async () => {
    const t = byC[b.dataset.copy].map(r => r.email).join(', ');
    try { await navigator.clipboard.writeText(t); toast('Αντιγράφηκαν ' + byC[b.dataset.copy].length + ' email.'); } catch (e) { prompt('Αντιγράψτε τα email:', t); }
  });
  if ($('#csvi')) $('#csvi').onclick = () => {
    const cell = v => { v = String(v ?? ''); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const rows = [['Μάθημα', 'Όνομα', 'Email', 'Δήλωση']];
    cKeys.forEach(key => byC[key].forEach(r => rows.push([cName(key), r.full_name, r.email, fmtDay(r.created_at)])));
    const blob = new Blob(['\ufeff' + rows.map(r => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'academy-endiaferon.csv'; a.click();
  };
  $('#csvu').onclick = () => {
    const cell = v => { v = String(v ?? ''); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const rows = [['Όνομα', 'Email', 'Εγγραφή', 'Διαγραφή', 'Τελευταία δραστηριότητα', 'Ολοκληρώσεις', 'Αρχεία', 'Βίντεο', 'Προσομοιώσεις']];
    o.people.forEach(p => rows.push([p.full_name, p.email, fmtDay(p.created_at), '', p.last_activity ? fmtDate(p.last_activity) : '', p.completions, p.downloads, p.videos, p.sims]));
    (gone || []).forEach(g => rows.push(['(διαγραμμένος λογαριασμός)', '', fmtDay(g.signed_up_at), fmtDay(g.deleted_at), '', '', '', '', '']));
    const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'academy-xristes.csv'; a.click();
  };
});

route(/^\/admin\/u\/([\w-]{36}|deleted)$/, async (uid, tok) => {
  if (needLogin()) return;
  if (!isTeacher()) return go('#/');
  const delUser = uid === 'deleted';
  const [ev, o] = await Promise.all([q(sb.rpc('admin_user_activity', { uid: delUser ? null : uid })), q(sb.rpc('admin_overview'))]);
  if (stale(tok)) return;
  const p = o.people.find(x => x.id === uid);
  const byDay = {}; ev.forEach(e => (byDay[fmtDay(e.created_at)] = byDay[fmtDay(e.created_at)] || []).push(e));
  app.innerHTML = `<p class="small"><a href="#/me/stats">← Στατιστικά</a></p>
    <h1>${delUser ? 'Διαγραμμένοι χρήστες (ανώνυμα)' : esc(p ? p.full_name : 'Χρήστης')}</h1>
    ${p ? `<p class="muted">${esc(p.email)} · εγγραφή ${fmtDate(p.created_at)} · τελευταία σύνδεση ${p.last_sign_in_at ? fmtDate(p.last_sign_in_at) : '—'}</p>
    <div class="tiles">${tile(p.completions, 'ολοκληρώσεις')}${tile(p.downloads, 'ανοίγματα αρχείων')}${tile(p.videos, 'ανοίγματα βίντεο')}${tile(p.sims, 'ανοίγματα προσομοιώσεων')}</div>` : ''}
    <div class="panel"><h2>Χρονολόγιο${ev.length >= 500 ? ' (τελευταίες 500 ενέργειες)' : ''}</h2>
    ${ev.length ? Object.entries(byDay).map(([d, list]) => `<h3 class="day">${d}</h3><ul class="list tl">${list.map(e => `<li class="row">
      <span class="ico">${(KIND[e.kind] || ['•'])[0]}</span><span class="spacer"><b>${(KIND[e.kind] || ['', e.kind])[1]}</b>${e.kind === 'lesson_view' || e.kind === 'lesson_complete' ? '' : `: ${esc(e.label || e.ref || '')}`}
      <br><span class="muted small">${esc(e.lesson || '')}${e.class_name ? ' · ' + esc(e.class_name) : ''}</span></span>
      <span class="muted small">${new Intl.DateTimeFormat('el-GR', { hour: '2-digit', minute: '2-digit' }).format(new Date(e.created_at))}</span></li>`).join('')}</ul>`).join('')
      : '<p class="muted">Καμία καταγεγραμμένη δραστηριότητα ακόμη.</p>'}</div>`;
});

// ================================================================ εκκίνηση
function social() {
  const s = $('#social'); if (!s) return; const l = [];
  if (CFG.youtube) l.push(`<a href="${esc(CFG.youtube)}" target="_blank" rel="noopener">YouTube</a>`);
  if (CFG.facebook) l.push(`<a href="${esc(CFG.facebook)}" target="_blank" rel="noopener">Facebook</a>`);
  s.innerHTML = l.join('');
}
async function boot() {
  social();
  if (!configured) return render();
  await simsReady;
  const { data } = await sb.auth.getSession();
  session = data.session;
  try { await loadMe(); } catch (e) { console.error(e); }
  sb.auth.onAuthStateChange(async (ev, s) => {
    if (ev === 'PASSWORD_RECOVERY') { recovering = true; session = s; return render(); }
    const changed = (s && s.user.id) !== (session && session.user.id);
    session = s;
    if (ev === 'SIGNED_OUT') { me = null; unread = 0; return location.hash === '#/deleted' ? render() : go('#/login'); }
    if (changed) {
      setTimeout(async () => {   // εκτός του callback (σύσταση supabase-js)
        try { await loadMe(); } catch (e) { console.error(e); }
        const pending = sessionStorage.getItem('csl-join');
        if (pending && session) go('#/join/' + pending); else go('#/me');
        refreshUnread();
      }, 0);
    }
  });
  window.addEventListener('hashchange', render);
  await render();
  refreshUnread();
  setInterval(() => { if (document.visibilityState === 'visible') refreshUnread(); }, 60000);
}
boot();
})();
