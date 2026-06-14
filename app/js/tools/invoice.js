/* ================================================================
   ProChefDesk — invoice.js (Invoice OCR → price update)
   ----------------------------------------------------------------
   Semi-automatic: photo/scan of a supplier invoice → OCR (tesseract.js,
   lazy CDN) → detect "name … price" lines → fuzzy-match to ingredients
   → the chef REVIEWS every row (match dropdown + editable price +
   checkbox) → apply → updates ingredient.pricePerUnit (price history +
   sync via upsertIngredient). OCR is an assist; the chef confirms each
   line, so imperfect scans are safe.
   ================================================================ */
(function () {
  'use strict';
  const PCD = window.PCD;
  let _tess = null;

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (_tess) return _tess;
    _tess = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.crossOrigin = 'anonymous';
      s.onload = function () { resolve(window.Tesseract); };
      s.onerror = function () { _tess = null; reject(new Error('Failed to load OCR')); };
      document.head.appendChild(s);
    });
    return _tess;
  }

  // OCR text → [{name, price, raw}] candidate price lines
  function parseLines(text) {
    const out = [];
    (text || '').split('\n').forEach(function (line) {
      const raw = line.trim();
      if (raw.length < 3) return;
      const matches = raw.match(/\d{1,3}(?:[ ,]\d{3})*[.,]\d{1,2}|\d+[.,]\d{1,2}|\d+\.\d+/g);
      if (!matches) return;
      const priceStr = matches[matches.length - 1]; // last number = price (name … qty … price)
      const price = parseFloat(priceStr.replace(/[ ,](?=\d{3})/g, '').replace(',', '.'));
      if (!(price > 0)) return;
      let name = (raw.match(/^[^0-9]+/) || [''])[0];
      name = name.replace(/[^A-Za-zÀ-ÿ &'\-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (name.length < 2) return;
      out.push({ name: name, price: price, raw: raw });
    });
    return out;
  }

  // fuzzy match parsed name → ingredient
  function matchIngredient(name, ings) {
    const n = (name || '').toLowerCase();
    const tokens = n.split(/\s+/).filter(function (w) { return w.length >= 3; });
    let best = null, bestScore = 0;
    ings.forEach(function (i) {
      const inm = (i.name || '').toLowerCase();
      if (!inm) return;
      let score = 0;
      if (inm === n) score = 100;
      else if (inm.indexOf(n) >= 0 || (n.length >= 3 && n.indexOf(inm) >= 0)) score = 60;
      else {
        const itok = inm.split(/\s+/);
        tokens.forEach(function (tk) {
          if (itok.some(function (x) { return x.indexOf(tk) >= 0 || tk.indexOf(x) >= 0; })) score += 25;
        });
      }
      if (score > bestScore) { bestScore = score; best = i; }
    });
    return bestScore >= 25 ? best : null;
  }

  function render(view) {
    const t = PCD.i18n.t;
    view.innerHTML =
      '<div class="page-header"><div class="page-header-text">' +
        '<div class="page-title">' + PCD.escapeHtml(t('ocr_title')) + '</div>' +
        '<div class="page-subtitle">' + PCD.escapeHtml(t('ocr_subtitle')) + '</div>' +
      '</div></div>' +
      '<div class="card mb-3" style="padding:20px;text-align:center;">' +
        '<div class="text-muted text-sm mb-2" style="max-width:480px;margin:0 auto 10px;">' + PCD.escapeHtml(t('ocr_hint')) + '</div>' +
        '<label class="btn btn-primary" style="cursor:pointer;display:inline-flex;">' + PCD.icon('file-text', 16) + ' <span style="margin-inline-start:6px;">' + PCD.escapeHtml(t('ocr_pick')) + '</span>' +
          '<input type="file" accept="image/*" id="ocrFile" style="display:none;"></label>' +
      '</div>' +
      '<div id="ocrStatus" class="text-muted text-sm mb-2" style="text-align:center;"></div>' +
      '<div id="ocrResults"></div>';

    const fileInput = PCD.$('#ocrFile', view);
    const statusEl = PCD.$('#ocrStatus', view);
    const resultsEl = PCD.$('#ocrResults', view);

    fileInput.addEventListener('change', function () {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      resultsEl.innerHTML = '';
      statusEl.textContent = t('ocr_loading');
      const url = URL.createObjectURL(file);
      statusEl.textContent = t('ocr_loading') + ' ' + (t('ocr_first_note') || '');
      loadTesseract().then(function (T) {
        statusEl.textContent = t('ocr_reading');
        return T.recognize(url, 'eng', { logger: function (msg) {
          if (msg && msg.status === 'recognizing text' && typeof msg.progress === 'number') {
            statusEl.textContent = t('ocr_reading') + ' ' + Math.round(msg.progress * 100) + '%';
          }
        } });
      }).then(function (res) {
        try { URL.revokeObjectURL(url); } catch (e) { /* */ }
        const text = (res && res.data && res.data.text) || '';
        const ings = PCD.store.listIngredients();
        // keep ALL detected price lines (matched + unmatched) so the chef can
        // assign unmatched ones manually — robust on real-world invoices.
        const rows = parseLines(text).map(function (p) { return { p: p, match: matchIngredient(p.name, ings) }; });
        renderResults(resultsEl, statusEl, rows, ings, t);
      }).catch(function (e) {
        statusEl.textContent = t('ocr_error');
      });
    });
  }

  function renderResults(el, statusEl, rows, ings, t) {
    if (!rows.length) { statusEl.textContent = t('ocr_none'); el.innerHTML = ''; return; }
    statusEl.textContent = (t('ocr_found') || '{n} prices found').replace('{n}', rows.length);
    let html = '<div class="card" style="padding:8px 14px;">';
    rows.forEach(function (r, idx) {
      const cur = r.match ? (Number(r.match.pricePerUnit) || 0) : null;
      html +=
        '<div style="padding:8px 0;border-bottom:1px solid var(--border);">' +
          '<div style="display:flex;gap:8px;align-items:center;">' +
            '<input type="checkbox" class="iv-ck" data-i="' + idx + '"' + (r.match ? ' checked' : '') + ' style="width:18px;height:18px;flex-shrink:0;">' +
            '<select class="select iv-ing" data-i="' + idx + '" style="flex:1;min-width:0;"><option value="">—</option>' +
              ings.map(function (g) { return '<option value="' + g.id + '"' + (r.match && g.id === r.match.id ? ' selected' : '') + '>' + PCD.escapeHtml(g.name) + '</option>'; }).join('') +
            '</select>' +
            '<input type="number" class="input iv-price" data-i="' + idx + '" value="' + r.p.price + '" step="0.001" min="0" style="width:88px;font-variant-numeric:tabular-nums;">' +
          '</div>' +
          '<div class="text-muted" style="font-size:11px;margin-top:3px;margin-inline-start:26px;">' + PCD.escapeHtml(t('ocr_detected')) + ': "' + PCD.escapeHtml(r.p.name) + '"' + (cur != null ? ' · ' + PCD.escapeHtml(t('ocr_current')) + ' ' + PCD.fmtMoney(cur) : '') + '</div>' +
        '</div>';
    });
    html += '</div>' +
      '<div class="text-muted text-sm mt-2">' + PCD.escapeHtml(t('ocr_review_hint')) + '</div>' +
      '<div class="flex gap-2 mt-3"><button class="btn btn-primary" id="ocrApply" style="flex:1;">' + PCD.icon('check', 16) + ' ' + PCD.escapeHtml(t('ocr_apply')) + '</button></div>';
    el.innerHTML = html;

    PCD.$('#ocrApply', el).addEventListener('click', function () {
      let n = 0;
      el.querySelectorAll('.iv-ck').forEach(function (ck) {
        if (!ck.checked) return;
        const i = ck.getAttribute('data-i');
        const sel = el.querySelector('.iv-ing[data-i="' + i + '"]');
        const pin = el.querySelector('.iv-price[data-i="' + i + '"]');
        const ingId = sel ? sel.value : '';
        const price = pin ? parseFloat(pin.value) : 0;
        if (!ingId || !(price > 0)) return;
        const ing = PCD.store.getIngredient(ingId);
        if (!ing) return;
        const upd = PCD.clone(ing);
        upd.pricePerUnit = price;
        PCD.store.upsertIngredient(upd);
        n++;
      });
      PCD.toast.success((t('ocr_updated') || '{n} prices updated').replace('{n}', n));
      statusEl.textContent = (t('ocr_updated') || '{n} prices updated').replace('{n}', n);
      el.innerHTML = '';
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.invoiceScan = { render: render, parseLines: parseLines, matchIngredient: matchIngredient };
})();
