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

  const api = { build, randomPick };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ExamGen = api;
})(typeof window !== 'undefined' ? window : this);
