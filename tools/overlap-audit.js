window.__audit = (tag) => {
  const out = [];
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const skip = e => e.closest('.toast, script, style, #overlay > .modal:not(:last-child), .kh');
  const modalOpen = !!document.querySelector('.modal');
  const all = [...document.querySelectorAll((modalOpen ? '' : '#app *, ') + '#overlay *, #langui *, #verui *, #homeui *')].filter(e => vis(e) && !skip(e));
  const own = e => [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
  const leaves = all.filter(e => own(e).length);
  const clipTo = (e, r) => { let p = e.parentElement; let L = r.left, T = r.top, R = r.right, B = r.bottom; while (p && p !== document.body && p !== document.documentElement) { const cs = getComputedStyle(p); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const b = p.getBoundingClientRect(); if (cs.overflowX !== 'visible' && (p.matches('.hist,.oplist,.openwrap,.lblist,.dgrid,.tlb,#app'))) { L = Math.max(L, b.left); R = Math.min(R, b.right); } if (cs.overflowY !== 'visible' && p.matches('.hist,.oplist,.openwrap,.lblist,.dgrid,.tlb,#app')) { T = Math.max(T, b.top); B = Math.min(B, b.bottom); } } p = p.parentElement; } return R - L > 1 && B - T > 1 ? { left: L, top: T, right: R, bottom: B, width: R - L, height: B - T } : null; };
  const rects = e => { const res = []; own(e).forEach(n => { const rg = document.createRange(); rg.selectNodeContents(n); [...rg.getClientRects()].forEach(r => { if (r.width > 1 && r.height > 1) { const c = clipTo(e, r); if (c) res.push(c); } }); }); return res; };
  const name = e => (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').filter(Boolean).slice(0, 2).join('.') : e.tagName.toLowerCase()) + '"' + (e.textContent || '').trim().slice(0, 18) + '"';
  const inter = (a, b) => { const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); return w > 2 && h > 3 ? w * h : 0; };
  const L = leaves.map(e => ({ e, rs: rects(e) }));
  // 1. text over text
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    let hit = 0; for (const ra of a.rs) for (const rb of b.rs) hit = Math.max(hit, inter(ra, rb));
    if (hit > 30) out.push('TEXT×TEXT ' + name(a.e) + ' / ' + name(b.e));
  }
  // 2. text over another control / icon / circle that does not contain it
  const boxesRaw = all.filter(e => e.matches('svg.ico, .lamp, .sdot, .chip, .rchip, .okc, button, .pill, .kh') && !e.closest('svg:not(.ico)') && !e.closest('.langmenu'));
  const boxes = boxesRaw.filter(e => clipTo(e, e.getBoundingClientRect()));
  boxes.forEach(e => { e.__r = clipTo(e, e.getBoundingClientRect()); });
  for (const a of L) for (const bx of boxes) {
    if (bx.contains(a.e) || a.e.contains(bx)) continue;
    const br = bx.__r; let hit = 0; for (const ra of a.rs) hit = Math.max(hit, inter(ra, br));
    if (hit > 40) out.push('TEXT×BOX ' + name(a.e) + ' / ' + name(bx));
  }
  // 3. clipped text (inside overflow:hidden box, or past the screen edge)
  for (const a of L) {
    let p = a.e.parentElement, box = null;
    while (p && p !== document.body) { const cs = getComputedStyle(p); if (cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { box = p; break; } p = p.parentElement; }
    for (const r of a.rs) {
      if (r.right > innerWidth + 1 || r.left < -1) { out.push('OFFSCREEN-X ' + name(a.e)); break; }
      if (box && !box.matches('.hist, .oplist, .openwrap, .dgrid, .tlb, .lblist, #app')) {
        const b = box.getBoundingClientRect();
        if (r.right > b.right + 2 || r.left < b.left - 2 || r.bottom > b.bottom + 2 || r.top < b.top - 2) { out.push('CLIPPED ' + name(a.e) + ' in ' + name(box)); break; }
      }
      if (box && box.matches('.oplist, .hist, .openwrap')) { const b = box.getBoundingClientRect(); if (r.right > b.right + 2 || r.left < b.left - 2) { out.push('CLIPPED-X ' + name(a.e)); break; } }
    }
  }
  // 4. fixed buttons (language / version) must not sit on top of other content
  for (const id of ['langui', 'verui', 'homeui']) {
    const f = document.getElementById(id); if (!f) continue;
    f.querySelectorAll('.langfab, span.vertag, button.vertag').forEach(fb => {
      const fr = fb.getBoundingClientRect(); if (fr.width < 2) return;
      for (const a of L) { if (f.contains(a.e)) continue; for (const r of a.rs) if (inter(r, fr) > 8) { out.push('FIXED×TEXT #' + id + ' / ' + name(a.e)); return; } }
      for (const bx of boxes) { if (f.contains(bx) || bx.contains(f)) continue; if (inter(bx.__r, fr) > 20) { out.push('FIXED×BOX #' + id + ' / ' + name(bx)); return; } }
    });
  }
  // 5. circles stay circles
  document.querySelectorAll('.lamp, .sdot, .stp .dot, .okc, .rd').forEach(e => { const r = e.getBoundingClientRect(); if (r.width > 1 && Math.abs(r.width - r.height) > 0.6) out.push('OVAL ' + name(e) + ' ' + r.width.toFixed(1) + 'x' + r.height.toFixed(1)); });
  return out.map(x => tag + ' :: ' + x);
};
window.__mk = (type, color, extra = {}) => ({ id: 'a' + Math.random().toString(36).slice(2, 8), type, color, submittedAt: Date.now() - 120000, ackAt: null, opResolvedAt: null, resolvedAt: null, cancelledAt: null, cantFixAt: null, attempts: [], ...extra });
window.__run = async (vw) => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const now = Date.now(), res = [];
  const sets = {
    none: [],
    mixed: [__mk('glue', 'red'), __mk('fold', 'yellow', { ackAt: now - 60000 }), __mk('crack', 'red', { ackAt: now - 60000, cantFixAt: now - 30000, cantFixReason: 'cad' }), __mk('burst', 'yellow', { ackAt: now - 90000, opResolvedAt: now - 30000, attempts: [{ at: now - 50000 }] }), __mk('scuff', 'red', { ackAt: now - 90000, cantFixAt: now - 60000, cantFixReason: 'other', cantFixNote: 'The die looks worn out on the left side', escalatedAt: now - 20000 })]
  };
  for (const l of ['es', 'my', 'en']) {
    setLang(l); const TG = vw + ' ' + l;
    const shot = async (name, fn) => { try { fn(); await wait(90); res.push(...__audit(TG + ' ' + name)); } catch (e) { res.push(TG + ' ' + name + ' ERROR ' + e.message); } closeModal(); };
    for (const role of ['packer', 'operator']) {
      myRole = role;
      await shot(role + ' home-none', () => { issues.length = 0; view = { name: 'home' }; render(); });
      await shot(role + ' home-mixed', () => { issues.length = 0; sets.mixed.forEach(i => issues.push(i)); view = { name: 'home' }; render(); });
      for (const i of sets.mixed) await shot(role + ' detail-' + i.type, () => { view = { name: 'detail', id: i.id }; render(); });
      await shot(role + ' detail-open-history', () => { view = { name: 'detail', id: sets.mixed[3].id, tl: true }; render(); });
    }
    myRole = 'packer';
    await shot('color-none', () => { view = { name: 'color', type: 'glue', color: null }; render(); });
    await shot('color-red', () => { view = { name: 'color', type: 'burst', color: 'red' }; render(); });
    await shot('cant-other', () => { view = { name: 'cant', id: sets.mixed[1].id, reason: 'other', note: '' }; render(); });
    await shot('cant-die', () => { view = { name: 'cant', id: sets.mixed[1].id, reason: 'die', note: '' }; render(); });
    await shot('history', () => { view = { name: 'history', exp: { [sets.mixed[4].id]: true }, f: { u: 'all', t: 'all', d: '' }, g: {} }; render(); });
    await shot('settings', () => { view = { name: 'settings' }; render(); });
    await shot('settings-help', () => { view = { name: 'settings', help: true }; render(); });
    myRole = null;
    await shot('role-page', () => { view = { name: 'role' }; render(); });
    myRole = 'packer';
    await shot('modal-ask', () => { view = { name: 'detail', id: sets.mixed[3].id }; render(); askModal(T.isfixed, T.notyet, T.yesfixed, 'yes', 'opres', 'x', 'Packers'); });
    await shot('modal-sync', () => { view = { name: 'home' }; render(); Sync.open(); });
    await shot('lang-menu', () => { view = { name: 'home' }; render(); langOpen = true; renderLang(); langOpen = false; });
    renderLang();
  }
  return res;
};
window.T_isfixed = () => T.isfixed;
