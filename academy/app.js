/* =====================================================================
   Cooling Systems Lab Academy — εφαρμογή (vanilla JS, Supabase)
   Διαδρομές (hash): #/  #/login  #/register  #/forgot  #/profile
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
  const m = String(u).match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function videoCards(list) {
  const v = (list || []).map(u => ({ u, id: ytId(u) })).filter(x => x.id);
  if (!v.length) return '';
  return `<div class="vids">${v.map(x => `<a class="vid" href="${esc(x.u)}" target="_blank" rel="noopener">
    <img src="https://i.ytimg.com/vi/${x.id}/mqdefault.jpg" alt="" loading="lazy"><span>▶ Άνοιγμα στο YouTube</span></a>`).join('')}</div>`;
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
function bindQuiz(root, src) {
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
async function render() {
  const tok = ++navToken;
  const h = location.hash.replace(/^#/, '') || '/';
  renderNav(h);
  if (!configured) { app.innerHTML = notConfigured(); return; }
  if (recovering) { viewNewPassword(); return; }
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) {
      if (session && me) refreshUnread().catch(() => {});
      try { await fn(...m.slice(1).map(x => x && decodeURIComponent(x)), tok); }
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
  const nav = $('#nav');
  if (!session || !me) {
    nav.innerHTML = `<a href="#/login" class="${h === '/login' ? 'on' : ''}">Σύνδεση</a><a href="#/register" class="${h === '/register' ? 'on' : ''}">Εγγραφή</a>`;
  } else {
    nav.innerHTML = `<a href="#/" class="${h === '/' ? 'on' : ''}">${isTeacher() ? 'Τα τμήματά μου' : 'Ο πίνακάς μου'}${unread ? `<span class="badge" title="Νέα μηνύματα">${unread}</span>` : ''}</a>
      <a href="#/profile" class="${h === '/profile' ? 'on' : ''}">${esc(me.full_name)}</a>
      <button type="button" id="logout">Αποσύνδεση</button>`;
    $('#logout').onclick = async () => { await sb.auth.signOut(); };
  }
}
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
    ${pending ? msgBox('info', `Μετά την εγγραφή θα μπείτε αυτόματα στο τμήμα με κωδικό <b>${esc(pending)}</b>.`) : ''}
    <form class="f" id="fm" novalidate>
      <label>Ονοματεπώνυμο<input type="text" name="name" autocomplete="name" maxlength="80" required>
        <span class="hint">Έτσι θα σας βλέπει ο εκπαιδευτής.</span></label>
      <label>Email<input type="email" name="email" autocomplete="email" required></label>
      <label>Κωδικός<input type="password" name="password" autocomplete="new-password" minlength="8" required>
        <span class="hint">Τουλάχιστον 8 χαρακτήρες.</span></label>
      <label class="chk"><input type="checkbox" name="consent" required> <span>Διάβασα την <a href="privacy.html" target="_blank">πολιτική απορρήτου</a> και συμφωνώ με την επεξεργασία των στοιχείων μου για τη λειτουργία της Academy.</span></label>
      <p class="muted small">Η Academy είναι προαιρετική. Η χρήση της δεν επηρεάζει καμία επίσημη αξιολόγηση.</p>
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

function viewNewPassword() {
  app.innerHTML = `<div class="panel" style="max-width:520px"><h1>Νέος κωδικός</h1>
    <form class="f" id="fm"><label>Νέος κωδικός<input type="password" name="pw" minlength="8" autocomplete="new-password" required></label><div id="out"></div>
    <div><button class="btn primary">Αποθήκευση</button></div></form></div>`;
  $('#fm').onsubmit = async e => {
    e.preventDefault(); const pw = e.target.pw.value;
    if (pw.length < 8) return $('#out').innerHTML = msgBox('err', 'Τουλάχιστον 8 χαρακτήρες.');
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) return $('#out').innerHTML = msgBox('err', esc(errText(error)));
    recovering = false; toast('Ο κωδικός άλλαξε.'); go('#/');
  };
}

function intro() {
  return `<div class="panel stack"><h2>Τι είναι η Academy</h2>
    <p>Ένας χώρος για τους σπουδαστές των μαθημάτων μου στην ψύξη και τον κλιματισμό:</p>
    <ul><li>σύνοψη κάθε μαθήματος με βίντεο και φύλλα εργασίας,</li>
    <li>σύνδεσμοι στις διαδραστικές προσομοιώσεις,</li>
    <li>ερωτήσεις αυτοελέγχου,</li>
    ${F.assignments ? '<li>ασκήσεις με προσωπική ανατροφοδότηση,</li>' : ''}
    ${F.messages ? '<li>απευθείας μηνύματα με τον εκπαιδευτή,</li>' : ''}
    <li>όλα σε ένα σημείο, από υπολογιστή ή κινητό.</li></ul>
    <p class="muted small">Για να μπείτε σε τμήμα χρειάζεστε τον κωδικό που θα σας δώσει ο εκπαιδευτής.</p></div>`;
}

route(/^\/deleted$/, async () => {
  app.innerHTML = `<div class="panel"><h1>Ο λογαριασμός διαγράφηκε</h1><p>Όλα τα δεδομένα σας αφαιρέθηκαν οριστικά. Ευχαριστούμε που χρησιμοποιήσατε την Academy.</p><p><a href="../">Προσομοιώσεις Cooling Systems Lab →</a></p></div>`;
});

route(/^\/join\/([A-Za-z0-9]{4,12})$/, async code => {
  if (!session) { sessionStorage.setItem('csl-join', code.toUpperCase()); return go('#/register'); }
  const cid = await q(sb.rpc('join_class', { code }));
  sessionStorage.removeItem('csl-join'); toast('Μπήκατε στο τμήμα.'); go('#/c/' + cid);
});

// ================================================================ ΠΡΟΦΙΛ / GDPR
route(/^\/profile$/, async () => {
  if (needLogin()) return;
  app.innerHTML = `<h1>Ο λογαριασμός μου</h1><div class="two"><div class="stack">
    <div class="panel"><h2>Στοιχεία</h2><form class="f" id="fn">
      <label>Ονοματεπώνυμο<input type="text" name="name" maxlength="80" value="${esc(me.full_name)}" required></label>
      <p class="muted small">Email: ${esc(me.email)} · Ρόλος: ${isTeacher() ? 'Εκπαιδευτής' : 'Σπουδαστής'} · Μέλος από ${fmtDay(me.created_at)}</p>
      <div><button class="btn primary">Αποθήκευση</button></div></form></div>
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
    </div></div></div>`;
  $('#fn').onsubmit = async e => {
    e.preventDefault(); const n = e.target.elements.namedItem('name').value.trim(); if (!n) return;
    try { await q(sb.from('profiles').update({ full_name: n }).eq('id', me.id)); me.full_name = n; renderNav('/profile'); toast('Αποθηκεύτηκε.'); }
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
      const [profile, enrollments, submissions, messages] = await Promise.all([
        q(sb.from('profiles').select('*').eq('id', me.id).single()),
        q(sb.from('enrollments').select('joined_at, classes(name)').eq('user_id', me.id)),
        q(sb.from('submissions').select('*, assignments(title)').eq('student_id', me.id)),
        q(sb.from('messages').select('*').or(`student_id.eq.${me.id},sender_id.eq.${me.id}`))]);
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), email: me.email, profile, enrollments, submissions, messages }, null, 2)], { type: 'application/json' });
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
    app.innerHTML = `<div class="hero"><div class="panel stack">
      <h1>Cooling Systems Lab Academy</h1>
      <p>Μαθήματα, ασκήσεις και ανατροφοδότηση για σπουδαστές ψύξης και κλιματισμού, δεμένα με τις διαδραστικές προσομοιώσεις του Cooling Systems Lab.</p>
      <div class="row"><a class="btn accent" href="#/register">Εγγραφή</a><a class="btn" href="#/login">Σύνδεση</a></div>
      <p class="muted small">Η συμμετοχή είναι προαιρετική και δωρεάν.</p></div>${intro()}</div>`;
    return;
  }
  if (!me) await loadMe();
  return isTeacher() ? teacherHome(tok) : studentHome(tok);
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

function classCards(list, extra) {
  if (!list.length) return '';
  return `<div class="grid">${list.map(c => `<a class="card" href="#/c/${c.id}"><h3>${esc(c.name)}</h3>
    ${c.description ? `<p class="muted small" style="margin:0 0 6px">${esc(c.description).slice(0, 160)}</p>` : ''}
    ${extra ? extra(c) : ''}</a>`).join('')}</div>`;
}

async function studentHome(tok) {
  const [classes, asgs, subs, anns] = await Promise.all([
    q(sb.from('classes').select('id,name,description').order('created_at')),
    F.assignments ? q(sb.from('assignments').select('id,title,due_at,class_id,allow_late,classes(name)').order('due_at', { ascending: true, nullsFirst: false })) : none(),
    F.assignments ? q(sb.from('submissions').select('assignment_id,status,points,graded_at,feedback,assignments(title,max_points,class_id)').eq('student_id', me.id)) : none(),
    F.announcements ? q(sb.from('announcements').select('id,title,created_at,class_id,classes(name)').order('created_at', { ascending: false }).limit(5)) : none()]);
  const unreadHTML = await unreadPanel();
  if (stale(tok)) return;
  const done = new Set(subs.map(s => s.assignment_id));
  const todo = asgs.filter(a => !done.has(a.id));
  const graded = subs.filter(s => s.status === 'returned').sort((a, b) => new Date(b.graded_at) - new Date(a.graded_at)).slice(0, 5);
  const side = F.assignments || F.announcements || unreadHTML;
  app.innerHTML = `<div class="row between"><h1>Γεια σας, ${esc(me.full_name.split(' ')[0])}</h1></div>
  <div class="${side ? 'two' : ''}"><div class="stack">
    <div class="panel"><h2>Τα τμήματά μου</h2>
      ${classes.length ? classCards(classes) : `<div class="empty">Δεν είστε ακόμη σε κάποιο τμήμα. Βάλτε τον κωδικό που σας έδωσε ο εκπαιδευτής.</div>`}
      <form class="row" id="join" style="margin-top:14px"><input class="inp" name="code" placeholder="Κωδικός τμήματος" maxlength="12" style="max-width:220px;text-transform:uppercase" required><button class="btn primary">Είσοδος σε τμήμα</button></form>
    </div>
    ${F.assignments ? `<div class="panel"><h2>Εκκρεμείς εργασίες</h2>
      ${todo.length ? `<ul class="list">${todo.map(a => `<li><a class="item" href="#/c/${a.class_id}/asg/${a.id}"><span class="spacer"><b>${esc(a.title)}</b><br><span class="muted small">${esc(a.classes?.name || '')}</span></span>${duePill(a)}</a></li>`).join('')}</ul>` : `<p class="muted">Καμία εκκρεμότητα.</p>`}
    </div>` : ''}
  </div>${side ? `<div class="stack">
    ${unreadHTML}
    ${F.assignments ? `<div class="panel"><h2>Ανατροφοδότηση</h2>
      ${graded.length ? `<ul class="list">${graded.map(s => `<li><a class="item" href="#/c/${s.assignments.class_id}/asg/${s.assignment_id}"><span class="spacer">${esc(s.assignments.title)}</span><span class="pill ok">${s.points != null ? num(s.points) + '/' + num(s.assignments.max_points) : 'Σχόλια'}</span></a></li>`).join('')}</ul>` : `<p class="muted small">Δεν υπάρχει ακόμη.</p>`}
    </div>` : ''}
    ${F.announcements ? `<div class="panel"><h2>Ανακοινώσεις</h2>
      ${anns.length ? `<ul class="list">${anns.map(a => `<li><a class="item" href="#/c/${a.class_id}/ann"><span class="spacer"><b>${esc(a.title)}</b><br><span class="muted small">${esc(a.classes?.name || '')} · ${fmtDay(a.created_at)}</span></span></a></li>`).join('')}</ul>` : `<p class="muted small">Καμία ανακοίνωση.</p>`}
    </div>` : ''}
  </div>` : ''}</div>`;
  $('#join').onsubmit = async e => {
    e.preventDefault();
    try { const cid = await q(sb.rpc('join_class', { code: e.target.code.value })); toast('Μπήκατε στο τμήμα.'); go('#/c/' + cid); }
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
  if (stale(tok)) return;
  const cnt = {}; enr.forEach(e => cnt[e.class_id] = (cnt[e.class_id] || 0) + 1);
  const pc = {}; pend.forEach(p => pc[p.assignments.class_id] = (pc[p.assignments.class_id] || 0) + 1);
  const side = F.assignments || unreadHTML;
  app.innerHTML = `<div class="row between"><h1>Τα τμήματά μου</h1><a class="btn accent" href="#/new-class">+ Νέο τμήμα</a></div>
  <div class="${side ? 'two' : ''}"><div class="panel">
    ${classes.length ? classCards(classes, c => `<div class="row"><span class="pill">${cnt[c.id] || 0} σπουδαστές</span>${pc[c.id] ? `<span class="pill warn">${pc[c.id]} προς βαθμολόγηση</span>` : ''}${c.archived ? '<span class="pill">Αρχειοθετημένο</span>' : ''}</div>`)
      : `<div class="empty">Δεν έχετε τμήματα ακόμη. Φτιάξτε το πρώτο και δώστε τον κωδικό στους σπουδαστές.</div>`}
  </div>${side ? `<div class="stack">${unreadHTML}${F.assignments ? `<div class="panel"><h2>Προς βαθμολόγηση</h2>
    ${pend.length ? `<ul class="list">${pend.slice(0, 12).map(p => `<li><a class="item" href="#/c/${p.assignments.class_id}/asg/${p.assignment_id}/grade/${p.id}"><span class="spacer"><b>${esc(p.profiles?.full_name || '')}</b><br><span class="muted small">${esc(p.assignments.title)} · ${fmtDay(p.submitted_at)}</span></span></a></li>`).join('')}</ul>` : `<p class="muted small">Όλα βαθμολογημένα.</p>`}
  </div>` : ''}</div>` : ''}</div>`;
}

route(/^\/new-class$/, async () => {
  if (needLogin()) return;
  if (!isTeacher()) return go('#/');
  app.innerHTML = `<div class="panel" style="max-width:640px"><h1>Νέο τμήμα</h1><form class="f" id="fm">
    <label>Όνομα<input type="text" name="name" maxlength="120" placeholder="π.χ. Θερμοδυναμική — Α΄ έτος 2026–27" required></label>
    <label>Περιγραφή (προαιρετικά)<textarea name="desc" style="min-height:70px"></textarea></label>
    <div class="row"><button class="btn primary">Δημιουργία</button><a href="#/">Άκυρο</a></div></form></div>`;
  $('#fm').onsubmit = async e => {
    e.preventDefault();
    try { const c = await q(sb.from('classes').insert({ name: e.target.elements.namedItem('name').value.trim(), description: e.target.desc.value.trim(), owner: me.id }).select().single()); go(`#/c/${c.id}/students`); }
    catch (er) { toast(errText(er), true); }
  };
});

// ================================================================ ΤΜΗΜΑ
async function loadClass(cid) {
  const c = await q(sb.from('classes').select('*').eq('id', cid).maybeSingle());
  if (!c) throw new Error('Το τμήμα δεν βρέθηκε ή δεν έχετε πρόσβαση.');
  c.mine = c.owner === me.id; return c;
}
function classHead(c, tab) {
  const tabs = [['', 'Μαθήματα']];
  if (F.assignments) tabs.push(['asg', 'Εργασίες']);
  if (F.announcements) tabs.push(['ann', 'Ανακοινώσεις']);
  if (F.messages) tabs.push(['chat', 'Μηνύματα']);
  if (c.mine) tabs.push(['students', 'Σπουδαστές'], ['settings', 'Ρυθμίσεις']);
  return `<p class="small"><a href="#/">← ${c.mine ? 'Τα τμήματά μου' : 'Ο πίνακάς μου'}</a></p>
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

async function tabLessons(c) {
  const ls = await q(sb.from('lessons').select('id,title,summary,position,published,videos,sims').eq('class_id', c.id).order('position').order('created_at'));
  return {
    html: `${c.mine ? `<div class="row" style="margin-bottom:12px"><button class="btn accent" id="newl">+ Νέο μάθημα</button><span class="muted small">Τα μη δημοσιευμένα μαθήματα δεν τα βλέπουν οι σπουδαστές.</span></div>` : ''}
    ${ls.length ? `<div class="grid">${ls.map((l, i) => `<a class="card" href="#/c/${c.id}/lesson/${l.id}">
      <div class="row between"><span class="muted small">Μάθημα ${i + 1}</span>${!l.published ? '<span class="pill warn">Πρόχειρο</span>' : ''}</div>
      <h3>${esc(l.title)}</h3><p class="muted small" style="margin:0">${esc((l.summary || '').replace(/\*\*/g, '')).slice(0, 140)}${(l.summary || '').length > 140 ? '…' : ''}</p>
      <div class="row small muted" style="margin-top:8px">${l.videos.length ? `<span>▶ ${l.videos.length} βίντεο</span>` : ''}${l.sims.length ? `<span>◎ ${l.sims.length} προσομοιώσεις</span>` : ''}</div></a>`).join('')}</div>`
      : `<div class="empty">${c.mine ? 'Δεν υπάρχουν μαθήματα ακόμη.' : 'Ο εκπαιδευτής δεν έχει δημοσιεύσει μαθήματα ακόμη.'}</div>`}`,
    bind: () => {
      const b = $('#newl'); if (!b) return;
      b.onclick = async () => {
        try { const l = await q(sb.from('lessons').insert({ class_id: c.id, title: 'Νέο μάθημα', position: ls.length + 1 }).select().single()); go(`#/c/${c.id}/lesson/${l.id}/edit`); }
        catch (er) { toast(errText(er), true); }
      };
    }
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
    html: `<div class="two"><div class="panel"><h2>Σπουδαστές (${enr.length})</h2>
      ${enr.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>Όνομα</th><th>Εγγραφή</th>${F.assignments ? '<th>Υποβολές</th>' : ''}<th></th></tr></thead><tbody>
      ${enr.map(e => `<tr><td>${esc(e.profiles?.full_name || '—')}</td><td>${fmtDay(e.joined_at)}</td>${F.assignments ? `<td>${(byS[e.user_id] || []).length}/${as.length}</td>` : ''}
        <td>${F.messages ? `<a class="btn small" href="#/c/${c.id}/chat/${e.user_id}">Μήνυμα</a> ` : ''}<button class="btn small danger" data-rm="${e.user_id}">Αφαίρεση</button></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty">Κανείς ακόμη. Δώστε στους σπουδαστές τον κωδικό ή τον σύνδεσμο.</div>`}
    </div><div class="stack"><div class="panel stack"><h2>Πρόσκληση</h2>
      <p class="small">Οι σπουδαστές κάνουν μόνοι τους εγγραφή και μπαίνουν με τον κωδικό:</p>
      <div class="row"><span class="code" id="code">${esc(c.join_code)}</span><button class="btn small" id="regen">Νέος κωδικός</button></div>
      <p class="small">ή με τον σύνδεσμο:</p>
      <div class="row"><input class="inp" readonly value="${esc(link)}" id="lnk"><button class="btn small" id="copy">Αντιγραφή</button></div>
      <p class="muted small">Με νέο κωδικό, ο παλιός παύει να ισχύει (όσοι μπήκαν ήδη παραμένουν).</p></div>
      ${F.assignments ? `<div class="panel stack"><h2>Βαθμολόγιο</h2><p class="small">Λήψη όλων των βαθμών του τμήματος σε αρχείο για Excel.</p>
      <div><button class="btn" id="csv">Λήψη CSV</button></div></div>` : ''}</div></div>`,
    bind: () => {
      $('#copy').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Αντιγράφηκε.'); } catch { $('#lnk').select(); } };
      $('#regen').onclick = async () => {
        if (!confirm('Να δημιουργηθεί νέος κωδικός;')) return;
        try { const code = await q(sb.rpc('gen_code')); await q(sb.from('classes').update({ join_code: code }).eq('id', c.id)); render(); }
        catch (er) { toast(errText(er), true); }
      };
      $$('[data-rm]').forEach(b => b.onclick = async () => {
        if (!confirm('Αφαίρεση σπουδαστή από το τμήμα; (Οι υποβολές του παραμένουν.)')) return;
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
    html: `<div class="panel" style="max-width:680px"><h2>Ρυθμίσεις τμήματος</h2><form class="f" id="fs">
      <label>Όνομα<input type="text" name="name" maxlength="120" value="${esc(c.name)}" required></label>
      <label>Περιγραφή<textarea name="desc" style="min-height:70px">${esc(c.description)}</textarea></label>
      <label class="chk"><input type="checkbox" name="arch" ${c.archived ? 'checked' : ''}> <span>Αρχειοθετημένο (οι σπουδαστές δεν έχουν πλέον πρόσβαση· εσείς κρατάτε όλο το υλικό)</span></label>
      <div><button class="btn primary">Αποθήκευση</button></div></form></div>
      <div class="panel" style="max-width:680px"><h2>Διαγραφή τμήματος</h2>
      <p class="small">Διαγράφονται οριστικά όλα τα μαθήματα, οι εργασίες, οι υποβολές, τα αρχεία και τα μηνύματα του τμήματος.</p>
      <button class="btn danger" id="delc">Διαγραφή τμήματος</button></div>`,
    bind: () => {
      $('#fs').onsubmit = async e => {
        e.preventDefault(); const f = e.target;
        try { await q(sb.from('classes').update({ name: f.elements.namedItem('name').value.trim(), description: f.desc.value.trim(), archived: f.arch.checked }).eq('id', c.id)); toast('Αποθηκεύτηκε.'); render(); }
        catch (er) { toast(errText(er), true); }
      };
      $('#delc').onclick = async () => {
        const t = prompt(`Για επιβεβαίωση γράψτε το όνομα του τμήματος:\n${c.name}`);
        if ((t || '').trim() !== c.name.trim()) return;
        try {
          const mats = await q(sb.from('materials').select('path').eq('class_id', c.id));
          if (mats.length) await sb.storage.from('materials').remove(mats.map(m => m.path));
          const as = await q(sb.from('assignments').select('id').eq('class_id', c.id));
          if (as.length) {
            const fs = await q(sb.from('submissions').select('file_path').in('assignment_id', as.map(a => a.id)).not('file_path', 'is', null));
            if (fs.length) await sb.storage.from('submissions').remove(fs.map(x => x.file_path));
          }
          await q(sb.from('classes').delete().eq('id', c.id)); toast('Το τμήμα διαγράφηκε.'); go('#/');
        } catch (er) { toast(errText(er), true); }
      };
    }
  };
}

// ================================================================ ΥΛΙΚΟ (αρχεία)
function materialsList(mats, canEdit) {
  if (!mats.length) return canEdit ? `<p class="muted small">Κανένα αρχείο.</p>` : '';
  return `<ul class="list">${mats.map(m => `<li class="row"><span class="spacer">📄 <button class="link" data-open="${esc(m.path)}">${esc(m.title)}</button> <span class="muted small">${fmtSize(m.size)}</span></span>
    ${canEdit ? `<button class="btn small danger" data-delmat="${m.id}" data-path="${esc(m.path)}">Αφαίρεση</button>` : ''}</li>`).join('')}</ul>`;
}
function bindMaterials(cid, itemId, canEdit) {
  const box = $('#mats');
  const refresh = async () => {   // ανανεώνει μόνο τη λίστα, ώστε να μη χάνονται αλλαγές της φόρμας
    const mats = await q(sb.from('materials').select('*').eq('item_id', itemId).order('created_at'));
    if (box) { box.innerHTML = materialsList(mats, canEdit); wire(); }
  };
  const wire = () => {
    $$('[data-open]').forEach(b => b.onclick = () => openFile('materials', b.dataset.open));
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
  if (!l) throw new Error('Το μάθημα δεν βρέθηκε.');
  if (edit && c.mine) return lessonEdit(c, l, mats);
  app.innerHTML = `<p class="small"><a href="#/c/${c.id}">← ${esc(c.name)}</a></p>
    <div class="row between"><h1>${esc(l.title)}</h1>${c.mine ? `<a class="btn" href="#/c/${c.id}/lesson/${l.id}/edit">Επεξεργασία</a>` : ''}</div>
    ${!l.published ? msgBox('warn', 'Πρόχειρο — δεν είναι ορατό στους σπουδαστές.') : ''}
    <div class="two" style="margin-top:12px"><div class="stack">
      ${l.summary ? `<div class="panel text"><h2>Σύνοψη</h2>${rich(l.summary)}</div>` : ''}
      ${l.videos.length ? `<div class="panel"><h2>Βίντεο</h2>${videoCards(l.videos)}</div>` : ''}
      ${parseQuiz(l.quiz).length ? `<div class="panel" id="quiz"><h2>Αυτοέλεγχος</h2>${quizHTML(l.quiz)}</div>` : ''}
    </div><div class="stack">
      ${l.sims.length ? `<div class="panel"><h2>Προσομοιώσεις</h2><div class="sims">${l.sims.map(s => `<a class="btn" href="${esc(simHref(s))}" target="_blank" rel="noopener">◎ ${esc(simLabel(s))}</a>`).join('')}</div></div>` : ''}
      ${mats.length ? `<div class="panel"><h2>Υλικό</h2><div id="mats">${materialsList(mats, false)}</div></div>` : ''}
      ${as.filter(a => a.published || c.mine).length ? `<div class="panel"><h2>Εργασίες</h2><ul class="list">${as.filter(a => a.published || c.mine).map(a => `<li><a href="#/c/${c.id}/asg/${a.id}">${esc(a.title)}</a>${a.due_at ? ` <span class="muted small">· έως ${fmtDate(a.due_at)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
    </div></div>`;
  bindMaterials(c.id, l.id);
  const qz = $('#quiz'); if (qz) bindQuiz(qz, l.quiz);
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
    <label>Βίντεο YouTube<textarea name="videos" style="min-height:70px" placeholder="https://youtu.be/...">${esc(l.videos.join('\n'))}</textarea>
      <span class="hint">Ένας σύνδεσμος ανά γραμμή (κανονικά βίντεο ή shorts). Ανοίγουν στο YouTube.</span></label>
    <div><b style="font-size:13.5px;color:var(--navy)">Προσομοιώσεις</b>${simPicker(l.sims)}</div>
    <label>Ερωτήσεις αυτοελέγχου<textarea name="quiz" style="min-height:160px" placeholder="? Πόση πίεση ασκούν 10 m νερού;\n- 0,1 bar\n* 1 bar\n- 10 bar\n> p = ρ·g·h ≈ 998·9,81·10 Pa ≈ 0,98 bar">${esc(l.quiz)}</textarea>
      <span class="hint">«?» ερώτηση · «-» λάθος επιλογή · «*» σωστή · «>» επεξήγηση (προαιρετική). Οι απαντήσεις δεν αποθηκεύονται.</span></label>
    <label class="chk"><input type="checkbox" name="pub" ${l.published ? 'checked' : ''}> <span>Δημοσιευμένο (ορατό στους σπουδαστές)</span></label>
    <div class="row"><button class="btn primary">Αποθήκευση</button><span class="spacer"></span><button type="button" class="btn danger" id="dell">Διαγραφή μαθήματος</button></div>
  </form><div class="stack"><div class="panel"><h2>Υλικό (φύλλα εργασίας κ.λπ.)</h2>
    <p class="muted small">Ιδιωτικά αρχεία: τα βλέπουν μόνο τα μέλη του τμήματος, όταν το μάθημα είναι δημοσιευμένο. Έως 20 MB το καθένα.</p>
    <div id="mats">${materialsList(mats, true)}</div><div style="margin-top:8px">${uploadBox()}</div></div>
    ${quizHelp()}</div></div>`;
  bindMaterials(c.id, l.id, true);
  $('#fl').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    const vids = f.videos.value.split('\n').map(s => s.trim()).filter(Boolean);
    const bad = vids.filter(v => !ytId(v));
    if (bad.length) return toast('Μη έγκυρος σύνδεσμος YouTube: ' + bad[0], true);
    try {
      await q(sb.from('lessons').update({ title: f.elements.namedItem('title').value.trim(), position: +f.pos.value || 0, summary: f.summary.value,
        videos: vids, sims: $$('input[name=sim]:checked', f).map(x => x.value), quiz: f.quiz.value, published: f.pub.checked }).eq('id', l.id));
      toast('Αποθηκεύτηκε.'); go(`#/c/${c.id}/lesson/${l.id}`);
    } catch (er) { toast(errText(er), true); }
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
    ${!a.published ? msgBox('warn', 'Πρόχειρο — δεν είναι ορατό στους σπουδαστές.') : ''}
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
  </form><div class="panel"><h2>Συνημμένα</h2><p class="muted small">Π.χ. το φύλλο εργασίας σε PDF. Ιδιωτικά για τα μέλη του τμήματος.</p>
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
  subs.forEach(s => { if (!people.find(p => p.id === s.student_id)) people.push({ id: s.student_id, name: (s.profiles?.full_name || '—') + ' (εκτός τμήματος)' }); });
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


// ================================================================ εκκίνηση
function social() {
  const s = $('#social'); const l = [];
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
        if (pending && session) go('#/join/' + pending); else go('#/');
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
