/* Γεννήτρια διαγωνισμάτων από τράπεζα θεμάτων (JSZip). Browser + Node. */
(function (root) {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const marker = tag => new RegExp('<w:p>(?:(?!</w:p>).)*?\\[\\[' + tag + '\\]\\](?:(?!</w:p>).)*?</w:p>', 's');

  function logoXml(rid, wEmu, hEmu) {
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + wEmu + '" cy="' + hEmu + '"/>' +
      '<wp:docPr id="9001" name="Logo"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="9001" name="logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/>' +
      '<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + wEmu + '" cy="' + hEmu + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>' +
      '<w:r><w:t xml:space="preserve">  </w:t></w:r>';
  }

  /* opts: {template: ArrayBuffer|Buffer, bank, ids:{A:[...10], B:[...5]}, sol:bool, fields:{TITLE,SCHOOL,PROGRAM,COURSE,TEACHER,DATE}, logo:{data:Uint8Array, ext:'png'|'jpeg', w, h}} */
  async function build(JSZip, opts) {
    const zip = await JSZip.loadAsync(opts.template);
    const byId = {}; opts.bank.items.forEach(it => byId[it.id] = it);
    let doc = await zip.file('word/document.xml').async('string');
    let n = 0;
    for (const part of ['A', 'B']) {
      n = 0;
      const xml = opts.ids[part].map(id => {
        const it = byId[id]; if (!it) throw new Error('Άγνωστο θέμα ' + id);
        n++; return (opts.sol ? it.s : it.x).split('{{N}}').join(String(n));
      }).join('');
      const re = marker('Q' + part);
      if (!re.test(doc)) throw new Error('marker Q' + part);
      doc = doc.replace(re, () => xml);
    }
    // μοναδικά ids σχεδίων
    let k = 1; doc = doc.replace(/(<wp:docPr\b[^>]*?\bid=")\d+"/g, (m, a) => a + (k++) + '"');
    doc = doc.replace(/(<pic:cNvPr\b[^>]*?\bid=")\d+"/g, (m, a) => a + '0"');
    const F = opts.fields || {};
    const DOTS = { PROGRAM: '……………………………………………………', TEACHER: '……………………………………………………', DATE: '……/……/…………   ……:…… – ……:……' };
    const tok = s => s.replace(/\{\{(\w+)\}\}/g, (m, key) => esc(F[key] || DOTS[key] || ''));
    zip.file('word/document.xml', tok(doc));
    zip.file('docProps/core.xml', tok(await zip.file('docProps/core.xml').async('string')));
    // κεφαλίδες
    const hdrs = Object.keys(zip.files).filter(p => /^word\/header\d+\.xml$/.test(p));
    let logoRel = '', logoRun = '';
    if (opts.logo) {
      const name = 'media/logo.' + opts.logo.ext;
      zip.file('word/' + name, opts.logo.data);
      logoRel = '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + name + '"/>';
      const hEmu = 540000, wEmu = Math.round(hEmu * (opts.logo.w || 1) / (opts.logo.h || 1));
      logoRun = logoXml('rIdLogo', Math.min(wEmu, 3600000), hEmu);
      let ct = await zip.file('[Content_Types].xml').async('string');
      if (ct.indexOf('Extension="' + opts.logo.ext + '"') < 0)
        ct = ct.replace('</Types>', '<Default Extension="' + opts.logo.ext + '" ContentType="image/' + (opts.logo.ext === 'png' ? 'png' : 'jpeg') + '"/></Types>');
      zip.file('[Content_Types].xml', ct);
    }
    for (const h of hdrs) {
      zip.file(h, tok((await zip.file(h).async('string')).replace('[[LOGO]]', logoRun)));
      const rp = h.replace('word/', 'word/_rels/') + '.rels';
      if (zip.file(rp)) zip.file(rp, (await zip.file(rp).async('string')).replace('[[LOGOREL]]', logoRel));
    }
    return zip;
  }

  /* Τυχαία επιλογή: μία παραλλαγή ανά θέση (διατηρεί τη δομή του διαγωνίσματος) */
  function randomPick(bank, rnd) {
    rnd = rnd || Math.random;
    const out = {};
    for (const part of ['A', 'B']) {
      out[part] = [];
      for (let p = 1; p <= bank.parts[part]; p++) {
        const c = bank.items.filter(it => it.part === part && it.pos === p);
        out[part].push(c[Math.floor(rnd() * c.length)].id);
      }
    }
    return out;
  }


  /* Παρουσίαση ανακεφαλαίωσης.
     opts: {template, recap, bank, ids:{A,B}, mode:'before'|'after', fields, rnd} */
  function recapItems(bank, recap, ids, mode, rnd) {
    rnd = rnd || Math.random;
    const used = new Set(ids.A.concat(ids.B)), out = [];
    const byId = {}; bank.items.forEach(it => byId[it.id] = it);
    for (const part of ['A', 'B']) ids[part].forEach((id, k) => {
      const it = byId[id]; if (!it) return;
      if (mode === 'after') { out.push({ id, exam: id, part, n: k + 1 }); return; }
      const c = bank.items.filter(x => x.part === part && x.pos === it.pos && !used.has(x.id) && recap.items[x.id]);
      if (!c.length) { out.push({ id: null, exam: id, part, n: k + 1 }); return; }
      const pick = c[Math.floor(rnd() * c.length)]; used.add(pick.id);
      out.push({ id: pick.id, exam: id, part, n: k + 1 });
    });
    return out;
  }
  async function buildRecap(JSZip, opts) {
    const zip = await JSZip.loadAsync(opts.template), R = opts.recap, F = Object.assign({}, opts.fields || {});
    ['COURSE', 'SCHOOL', 'TEACHER'].forEach(k => F[k + '_UP'] = (F[k] || '').toLocaleUpperCase('el-GR').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC'));
    const list = recapItems(opts.bank, R, opts.ids, opts.mode, opts.rnd);
    const bySlot = {}; list.filter(x => x.id).forEach(x => { const s = R.items[x.id].per; (bySlot[s] = bySlot[s] || []).push(x); });
    const PART = { A: 'ΜΕΡΟΣ Α΄', B: 'ΜΕΡΟΣ Β΄' };
    const seq = [];   // {file} ή {xml, img}
    for (const e of R.plan) {
      if (e.f) { seq.push({ file: e.f }); continue; }
      (bySlot[e.slot] || []).forEach(x => {
        const it = R.items[x.id];
        const head = opts.mode === 'after' ? `ΘΕΜΑ ΔΙΑΓΩΝΙΣΜΑΤΟΣ · ${PART[x.part]} · ΕΡΩΤΗΣΗ ${x.n}` : `ΘΕΜΑ ΤΥΠΟΥ ΕΞΕΤΑΣΗΣ · ${PART[x.part]}`;
        const pern = e.slot === 'mix' ? String(Math.max(...R.plan.filter(z => /^p\d$/.test(z.slot || '')).map(z => +z.slot.slice(1)))) : e.slot.slice(1);
        x.per = e.slot; x.title = it.title; x.slides = [];
        it.slides.forEach(s => (x.slides.push({ k: s.k, idx: seq.length + 1 }), seq.push({ xml: R.base.replace(/\{\{PERN\}\}/g, pern).replace('{{BODY}}', () => s.body).replace('{{TITLE}}', () => esc(it.title) + (s.cont ? ' (συνέχεια)' : ''))
          .replace('{{KICK}}', () => (s.k === 's' ? 'ΛΥΣΗ · ' : '') + head), img: s.img })));
      });
    }
    // presentation.xml / rels / content types
    let pres = await zip.file('ppt/presentation.xml').async('string');
    let prels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
    let ct = await zip.file('[Content_Types].xml').async('string');
    const t2rid = {}; prels.replace(/<Relationship\b[^>]*>/g, m => { const id = (m.match(/Id="([^"]+)"/) || [])[1], t = (m.match(/Target="([^"]+)"/) || [])[1]; if (t) t2rid['ppt/' + t] = id; return m; });
    const oldIds = {}; (pres.match(/<p:sldId\b[^>]*\/>/g) || []).forEach(m => { const rid = m.match(/r:id="([^"]+)"/)[1]; oldIds[rid] = m.match(/\bid="(\d+)"/)[1]; });
    let nid = 30000, g = 0, lst = '';
    const N = seq.length;
    for (let i = 0; i < N; i++) {
      const s = seq[i], pg = `${i + 1} / ${N}`;
      if (s.file) {
        const rid = t2rid[s.file];
        lst += `<p:sldId id="${oldIds[rid]}" r:id="${rid}"/>`;
        zip.file(s.file, tok((await zip.file(s.file).async('string')), F, pg));
      } else {
        g++;
        const name = `slideG${g}.xml`, rid = `rIdG${g}`;
        zip.file('ppt/slides/' + name, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + tok(s.xml, F, pg));
        const rel = `<Relationship Id="rIdL" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="${R.layout}"/>` +
          s.img.map((m, k) => `<Relationship Id="rIdI${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${m}"/>`).join('');
        zip.file('ppt/slides/_rels/' + name + '.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`);
        prels = prels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/${name}"/></Relationships>`);
        ct = ct.replace('</Types>', `<Override PartName="/ppt/slides/${name}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
        lst += `<p:sldId id="${nid++}" r:id="${rid}"/>`;
      }
    }
    pres = pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, () => `<p:sldIdLst>${lst}</p:sldIdLst>`);
    zip.file('ppt/presentation.xml', pres); zip.file('ppt/_rels/presentation.xml.rels', prels); zip.file('[Content_Types].xml', ct);
    const usedImg = new Set(); seq.forEach(x => (x.img || []).forEach(m => usedImg.add(m)));
    Object.keys(zip.files).filter(p => /^ppt\/media\/rb\d+\.\w+$/.test(p) && !usedImg.has(p.split('/').pop())).forEach(p => zip.remove(p));
    for (const p of Object.keys(zip.files).filter(p => /^ppt\/notesSlides\/.*\.xml$|^docProps\/core\.xml$/.test(p)))
      zip.file(p, tok(await zip.file(p).async('string'), F, ''));
    zip.recapMap = list; zip.recapSlides = seq.length;
    return zip;
  }
  function tok(s, F, pg) {
    const DOTS = { PROGRAM: '', TEACHER: '', SCHOOL: '', TEACHER_UP: '', SCHOOL_UP: '' };
    return s.replace(/\{\{PG\}\}/g, pg).replace(/\{\{(\w+)\}\}/g, (m, k) => esc(F[k] != null && F[k] !== '' ? F[k] : (DOTS[k] != null ? DOTS[k] : '')));
  }

  /* Αναφορά Word: αντιστοιχία θεμάτων διαγωνίσματος ↔ διαφανειών της παρουσίασης */
  const PERNAMES = {
    thermo: { p1: 'Περίοδος 1 — Μονάδες, ύλη, μάζα & όγκος', p2: 'Περίοδος 2 — Πυκνότητα, ενέργεια & ισχύς', p3: 'Περίοδος 3 — Πίεση, μανόμετρα & υδροστατική', p4: 'Περίοδος 4 — Θερμότητα, θερμοκρασία & κλίμακες', mix: 'Μεικτά θέματα (πριν την τελική προετοιμασία)' },
    thermofluids: { p1: 'Περίοδος 1 — Θερμότητα, θερμοκρασία & αέρια', p2: 'Περίοδος 2 — Θερμοδυναμικά αξιώματα & ψυκτικός κύκλος', p3: 'Περίοδος 3 — Μεταφορά θερμότητας', mix: 'Γενική ανασκόπηση & μεικτές ασκήσεις' } };
  async function buildReport(JSZip, opts) {   // opts: {map, nSlides, bank, recap, fields, mode, files:{exam, recap}}
    const F = opts.fields || {}, byId = {}; opts.bank.items.forEach(it => byId[it.id] = it);
    const PN = PERNAMES[opts.recap.course] || {};
    const gist = t => { t = String(t || ''); const m = t.match(/^\s*Να (?:επιλέξετε|υπογραμμίσετε|συμπληρώσετε|αντιστοιχίσετε)[^.;:]*[.;:]\s*(?:Μία επιλογή[^.]*\.\s*)?/); return m && t.length - m[0].length > 15 ? t.slice(m[0].length) : t; };
    const cut = (t, n) => (t = String(t || '').replace(/\s+/g, ' ').trim()).length > n ? t.slice(0, n - 1) + '…' : t;
    const run = (t, o) => { o = o || {}; return `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.c ? `<w:color w:val="${o.c}"/>` : ''}<w:sz w:val="${o.sz || 20}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`; };
    const par = (runs, o) => { o = o || {}; return `<w:p><w:pPr><w:spacing w:before="${o.before || 0}" w:after="${o.after == null ? 80 : o.after}"/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>${runs}</w:p>`; };
    const W = [1500, 4300, 4300, 1700, 2600];
    const cell = (content, w, fill) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}<w:tcMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/></w:tcMar></w:tcPr>${content}</w:tc>`;
    const hdr = ['Θέμα διαγωνίσματος', 'Εκφώνηση στο διαγώνισμα', 'Αντίστοιχο θέμα στην παρουσίαση', 'Διαφάνειες', 'Ενότητα παρουσίασης'];
    let rows = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${hdr.map((h, k) => cell(par(run(h, { b: true, c: 'FFFFFF' }), { after: 0 }), W[k], '0E3A53')).join('')}</w:tr>`;
    opts.map.forEach((x, k) => {
      const ex = byId[x.exam], rc = x.id ? byId[x.id] : null;
      const q = (x.slides || []).filter(s => s.k === 'q').map(s => s.idx), so = (x.slides || []).filter(s => s.k === 's').map(s => s.idx);
      const fill = k % 2 ? 'F4F8FA' : null;
      rows += '<w:tr>' + [
        par(run(`${x.part === 'A' ? 'Μέρος Α΄' : 'Μέρος Β΄'} · Ερώτηση ${x.n}`, { b: true })),
        par(run(cut(gist(ex && ex.label), 170), { sz: 18 })),
        rc ? par(run(x.title, { b: true, sz: 18 })) + par(run(cut(gist(rc.label), 150), { sz: 18 })) : par(run('— δεν υπάρχει άλλη παραλλαγή για αυτή τη θέση', { i: true, sz: 18, c: '8A5A00' })),
        rc ? par(run('Εκφώνηση: ', { sz: 18 }) + run(q.join(', '), { b: true, sz: 18 })) + par(run('Λύση: ', { sz: 18 }) + run(so.join(', '), { b: true, sz: 18 })) : par(run('—')),
        par(run(rc ? (PN[x.per] || x.per) : '—', { sz: 18 }))
      ].map((c, i) => cell(c, W[i], fill)).join('') + '</w:tr>';
    });
    const bd = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="9DB4C0"/>`).join('');
    const tbl = `<w:tbl><w:tblPr><w:tblW w:w="${W.reduce((a, b) => a + b)}" w:type="dxa"/><w:tblBorders>${bd}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${W.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>`;
    const today = new Date().toLocaleDateString('el-GR');
    const info = [['Μάθημα', F.COURSE], ['Σχολή / φορέας', F.SCHOOL], ['Διδάσκων/ουσα', F.TEACHER], ['Ημερομηνία εξέτασης', F.DATE], ['Δημιουργήθηκε', today],
      ['Διαγώνισμα', opts.files && opts.files.exam], ['Παρουσίαση', (opts.files && opts.files.recap ? opts.files.recap + ' · ' : '') + opts.nSlides + ' διαφάνειες']].filter(r => r[1]);
    const body = par(run('Αντιστοιχία θεμάτων διαγωνίσματος και παρουσίασης ανακεφαλαίωσης', { b: true, sz: 32, c: '0E3A53' }), { after: 120 }) +
      info.map(([k, v]) => par(run(k + ': ', { b: true }) + run(v), { after: 20 })).join('') +
      par(run(opts.mode === 'after'
        ? 'Η παρουσίαση περιέχει τα ίδια θέματα με το διαγώνισμα, με τις λύσεις τους.'
        : 'Η παρουσίαση «πριν το διαγώνισμα» περιέχει για κάθε θέμα της εξέτασης μια ΑΛΛΗ παραλλαγή της ίδιας θέσης (ίδιος τύπος, άλλα δεδομένα). Ο πίνακας δείχνει σε ποιες διαφάνειες βρίσκεται το αντίστοιχο θέμα. Το έγγραφο είναι μόνο για τον εκπαιδευτή — να μη δοθεί στους σπουδαστές.', { i: true, c: '52697A' }), { before: 160, after: 160 }) +
      tbl;
    const sect = '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="600" w:footer="600" w:gutter="0"/></w:sectPr>';
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${par('')}${sect}</w:body></w:document>`);
    return zip;
  }

  const api = { build, randomPick, buildRecap, recapItems, buildReport };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ExamGen = api;
})(typeof window !== 'undefined' ? window : this);
