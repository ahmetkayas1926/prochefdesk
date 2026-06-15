/* ================================================================
   ProChefDesk — invoice.js
   ----------------------------------------------------------------
   Semi-automatic invoice price update: upload a supplier invoice
   photo → tesseract.js reads it (lazy CDN, ~first-time download) →
   name·price lines parsed → fuzzy-matched to ingredients → chef
   reviews EVERY detected line (matched + unmatched, manual dropdown)
   → Apply → upsertIngredient (price history + cloud sync).
   "Assist and confirm" design: OCR errors are safe because the chef
   approves each line before anything is saved.
   ================================================================ */
(function () {
  'use strict';
  const PCD = window.PCD;

  // Lazy-load tesseract.js from CDN (same pattern as PCD.loadXLSX).
  let _tessPromise = null;
  function loadTesseract() {
    if (_tessPromise) return _tessPromise;
    _tessPromise = new Promise(function (resolve, reject) {
      if (window.Tesseract) { resolve(window.Tesseract); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = function () { resolve(window.Tesseract); };
      s.onerror = function () { _tessPromise = null; reject(new Error('Tesseract load failed')); };
      document.head.appendChild(s);
    });
    return _tessPromise;
  }

  // Parse OCR text → [{rawName, price}]. Keeps ALL price-containing
  // lines (even weak matches); caller filters via review table.
  function parseLines(text) {
    const results = [];
    const priceRe = /\$?\s*(\d[\d,]*\.?\d{0,2})/;
    text.split('\n').forEach(function (rawLine) {
      const line = rawLine.trim();
      if (!line || line.length < 4) return;
      const m = line.match(priceRe);
      if (!m) return;
      const price = parseFloat(m[1].replace(/,/g, ''));
      if (isNaN(price) || price <= 0 || price > 99999) return;
      // Strip price + stray chars to get item name.
      const name = line
        .replace(m[0], '')
        .replace(/[$\/|\\@#*]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (name.length < 2) return;
      results.push({ rawName: name, price: price });
    });
    return results;
  }

  // Fuzzy ingredient match: exact → contains → word-overlap.
  // Returns the best-scoring ingredient or null (score threshold 0.35).
  function matchIngredient(rawName, ingredients) {
    const raw = rawName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
    let best = null, bestScore = 0;
    ingredients.forEach(function (ing) {
      const name = (ing.name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
      if (!name) return;
      // Exact
      if (name === raw) { best = ing; bestScore = 1; return; }
      // Substring
      if (raw.includes(name) || name.includes(raw)) {
        const score = Math.min(name.length, raw.length) / Math.max(name.length, raw.length);
        if (score > bestScore) { best = ing; bestScore = score; }
        return;
      }
      // Word overlap
      const rWords = raw.split(/\s+/).filter(function (w) { return w.length > 2; });
      const nWords = name.split(/\s+/).filter(function (w) { return w.length > 2; });
      if (!rWords.length || !nWords.length) return;
      let overlap = 0;
      rWords.forEach(function (w) {
        if (nWords.some(function (n) { return n.includes(w) || w.includes(n); })) overlap++;
      });
      const score2 = overlap / Math.max(rWords.length, nWords.length);
      if (score2 > bestScore) { best = ing; bestScore = score2; }
    });
    return (bestScore >= 0.35) ? best : null;
  }

  // State for the current review session.
  let _rows = [];  // [{rawName, price, matchedId, checked}]

  function render() {
    const t = PCD.i18n.t;
    const view = document.getElementById('view');
    view.innerHTML =
      '<div class="page-header"><div class="page-header-text">' +
        '<div class="page-title">' + PCD.escapeHtml(t('ocr_title')) + '</div>' +
        '<div class="page-subtitle">' + PCD.escapeHtml(t('ocr_subtitle')) + '</div>' +
      '</div></div>' +

      '<p style="color:var(--text-2);font-size:0.9rem;margin-bottom:16px;">' +
        PCD.escapeHtml(t('ocr_hint')) +
      '</p>' +

      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:18px;">' +
        '<label class="btn btn-primary" style="cursor:pointer;display:inline-flex;gap:6px;align-items:center;">' +
          PCD.icon('camera', 15) + ' ' + PCD.escapeHtml(t('ocr_pick')) +
          '<input type="file" id="invFile" accept="image/*" capture="environment" style="display:none;">' +
        '</label>' +
        '<span style="font-size:0.75rem;color:var(--text-3);">' +
          PCD.escapeHtml(t('ocr_first_note')) +
        '</span>' +
      '</div>' +

      '<div id="invProg" style="display:none;padding:8px 0;color:var(--text-2);font-size:0.9rem;"></div>' +
      '<div id="invRes"></div>';

    document.getElementById('invFile').addEventListener('change', function (e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const prog = document.getElementById('invProg');
      const res  = document.getElementById('invRes');
      prog.style.display = 'block';
      prog.textContent = t('ocr_loading');
      res.innerHTML = '';
      _rows = [];

      loadTesseract()
        .then(function (Tesseract) {
          prog.textContent = t('ocr_reading') + ' 0%';
          return Tesseract.recognize(file, 'eng', {
            logger: function (m) {
              if (m.status === 'recognizing text') {
                prog.textContent = t('ocr_reading') + ' ' + Math.round((m.progress || 0) * 100) + '%';
              }
            }
          });
        })
        .then(function (result) {
          prog.style.display = 'none';
          const parsed = parseLines(result.data.text);
          if (!parsed.length) {
            res.innerHTML = '<p class="empty-hint">' + PCD.escapeHtml(t('ocr_none')) + '</p>';
            return;
          }
          const ings = PCD.store.listIngredients();
          _rows = parsed.map(function (p) {
            const matched = matchIngredient(p.rawName, ings);
            return { rawName: p.rawName, price: p.price, matchedId: matched ? matched.id : '', checked: !!matched };
          });
          renderResults();
        })
        .catch(function (err) {
          prog.style.display = 'none';
          res.innerHTML = '<p class="empty-hint">' + PCD.escapeHtml(t('ocr_error')) + '</p>';
          console.error('[invoice] OCR error:', err);
        });
    });
  }

  function renderResults() {
    const t  = PCD.i18n.t;
    const res = document.getElementById('invRes');
    if (!res) return;
    const ings = PCD.store.listIngredients();

    const ingOptsFull =
      '<option value="">— </option>' +
      ings.map(function (i) {
        return '<option value="' + PCD.escapeHtml(i.id) + '">' + PCD.escapeHtml(i.name) + '</option>';
      }).join('');

    const rows = _rows.map(function (row, i) {
      const matchedIng = ings.find(function (x) { return x.id === row.matchedId; });
      const curPrice   = matchedIng ? matchedIng.pricePerUnit : null;
      const curStr     = curPrice != null ? PCD.fmtMoney(curPrice) : '—';
      const selHtml    = ingOptsFull.replace(
        'value="' + row.matchedId + '"',
        'value="' + row.matchedId + '" selected'
      );
      return '<tr style="border-bottom:1px solid var(--border);">' +
        '<td style="padding:6px 4px;font-size:0.8rem;color:var(--text-2);max-width:110px;word-break:break-word;">' +
          PCD.escapeHtml(row.rawName) +
        '</td>' +
        '<td style="padding:6px 4px;">' +
          '<select class="form-control form-control-sm" data-invsel="' + i + '" style="min-width:120px;">' + selHtml + '</select>' +
        '</td>' +
        '<td style="padding:6px 4px;text-align:right;font-size:0.8rem;color:var(--text-3);">' +
          PCD.escapeHtml(t('ocr_current')) + ' ' + curStr +
        '</td>' +
        '<td style="padding:6px 4px;text-align:right;">' +
          '<input type="number" class="form-control form-control-sm" data-invprice="' + i + '"' +
            ' value="' + row.price + '" min="0" step="0.01" style="width:80px;text-align:right;">' +
        '</td>' +
        '<td style="padding:6px 4px;text-align:center;">' +
          '<input type="checkbox" data-invchk="' + i + '"' + (row.checked ? ' checked' : '') +
            ' style="width:16px;height:16px;accent-color:var(--brand-500);">' +
        '</td>' +
      '</tr>';
    }).join('');

    res.innerHTML =
      '<p style="margin-bottom:6px;font-weight:600;">' +
        PCD.escapeHtml(t('ocr_found').replace('{n}', _rows.length)) +
      '</p>' +
      '<p style="font-size:0.78rem;color:var(--text-2);margin-bottom:10px;">' +
        PCD.escapeHtml(t('ocr_review_hint')) +
      '</p>' +
      '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.88rem;">' +
        '<thead><tr style="border-bottom:2px solid var(--border);background:var(--surface-2);">' +
          '<th style="padding:6px 4px;text-align:left;font-weight:600;">' + PCD.escapeHtml(t('ocr_detected')) + '</th>' +
          '<th style="padding:6px 4px;text-align:left;font-weight:600;">' + PCD.escapeHtml(t('name')) + '</th>' +
          '<th style="padding:6px 4px;text-align:right;font-weight:600;">' + PCD.escapeHtml(t('ocr_current')) + '</th>' +
          '<th style="padding:6px 4px;text-align:right;font-weight:600;">' + PCD.escapeHtml(t('price')) + '</th>' +
          '<th style="padding:6px 4px;"></th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>' +
      '<div style="margin-top:16px;display:flex;justify-content:flex-end;">' +
        '<button class="btn btn-primary" id="invApply">' +
          PCD.icon('check', 15) + ' ' + PCD.escapeHtml(t('ocr_apply')) +
        '</button>' +
      '</div>';

    // Wire live changes.
    res.addEventListener('change', function (e) {
      const si = parseInt(e.target.getAttribute('data-invsel'));
      if (!isNaN(si) && _rows[si]) {
        _rows[si].matchedId = e.target.value;
        // Update "current" price display.
        const matchedIng = PCD.store.listIngredients().find(function (x) { return x.id === e.target.value; });
        const curTd = e.target.closest('tr') && e.target.closest('tr').children[2];
        if (curTd) {
          const cp = matchedIng ? matchedIng.pricePerUnit : null;
          curTd.textContent = PCD.i18n.t('ocr_current') + ' ' + (cp != null ? PCD.fmtMoney(cp) : '—');
        }
        // Auto-check if an ingredient is now matched.
        if (e.target.value) {
          _rows[si].checked = true;
          const chkEl = res.querySelector('[data-invchk="' + si + '"]');
          if (chkEl) chkEl.checked = true;
        }
      }
      const pi = parseInt(e.target.getAttribute('data-invprice'));
      if (!isNaN(pi) && _rows[pi]) {
        _rows[pi].price = parseFloat(e.target.value) || 0;
      }
      const ci = parseInt(e.target.getAttribute('data-invchk'));
      if (!isNaN(ci) && _rows[ci]) {
        _rows[ci].checked = e.target.checked;
      }
    });

    document.getElementById('invApply').addEventListener('click', function () {
      const ings = PCD.store.listIngredients();
      let updated = 0;
      _rows.forEach(function (row) {
        if (!row.checked || !row.matchedId || row.price <= 0) return;
        const ing = ings.find(function (x) { return x.id === row.matchedId; });
        if (!ing) return;
        PCD.store.upsertIngredient(Object.assign({}, ing, { pricePerUnit: row.price }));
        updated++;
      });
      if (updated > 0) {
        PCD.toast.success(PCD.i18n.t('ocr_updated').replace('{n}', updated));
        _rows = [];
        document.getElementById('invRes').innerHTML = '';
        const fi = document.getElementById('invFile');
        if (fi) fi.value = '';
      } else {
        PCD.toast.warn(PCD.i18n.t('ocr_none'));
      }
    });
  }

  PCD.tools.invoice = { render: render };
})();
