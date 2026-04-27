/* ================================================================
   ProChefDesk — kitchen_cards.js (v1.10 - Excel-style)

   Each recipe is a self-contained block with:
   - Recipe name (bold header)
   - 2-column table: ingredient name (left) | amount (right)
   - Method below as numbered steps (split by newline)

   Multiple blocks tile across the A4 page, fitting 8-15+ depending
   on recipe length. Like the chef's existing Excel sheet — laminate-
   ready reference for the kitchen line.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function render(view) {
    const recipes = PCD.store.listRecipes().sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">Kitchen Cards</div>
          <div class="page-subtitle">Print compact A4 reference sheets — laminate, hang in the kitchen</div>
        </div>
      </div>
      <div id="kcBody"></div>
    `;

    const bodyEl = PCD.$('#kcBody', view);

    if (recipes.length === 0) {
      bodyEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon" style="color:var(--brand-600);">${PCD.icon('id-card', 48)}</div>
          <div class="empty-title">No recipes yet</div>
          <div class="empty-desc">Create some recipes first, then come back here to build a kitchen reference sheet.</div>
        </div>
      `;
      return;
    }

    // Try to load most recent saved canvas
    const savedCanvases = PCD.store.listTable('canvases') || [];
    savedCanvases.sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
    const lastCanvas = savedCanvases[0] || null;

    const selected = new Set(
      lastCanvas && lastCanvas.recipeIds
        ? lastCanvas.recipeIds.filter(function (id) { return recipes.some(function (r) { return r.id === id; }); })
        : recipes.map(function (r) { return r.id; })  // default: all
    );
    let columns = (lastCanvas && lastCanvas.columns) || 3;
    let rows = (lastCanvas && lastCanvas.rows) || 0;  // 0 = auto (no row limit)
    let orientation = (lastCanvas && lastCanvas.orientation) || 'landscape';
    let showMethod = lastCanvas ? !!lastCanvas.showMethod : true;
    let showAmounts = lastCanvas ? !!lastCanvas.showAmounts : true;
    let fontSize = (lastCanvas && lastCanvas.fontSize) || 'medium';
    let canvasName = (lastCanvas && lastCanvas.name) || 'Kitchen Reference';
    let canvasId = (lastCanvas && lastCanvas.id) || null;

    function renderBody() {
      const allCanvases = PCD.store.listTable('canvases') || [];
      allCanvases.sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });

      bodyEl.innerHTML = `
        <div style="display:grid;grid-template-columns:minmax(280px,1fr) minmax(280px,1.2fr);gap:14px;align-items:start;" class="kc-layout">
          <div>
            <div class="card mb-3" style="padding:14px;">
              <div class="flex items-center justify-between mb-2" style="gap:8px;flex-wrap:wrap;">
                <input type="text" class="input" id="canvasName" value="${PCD.escapeHtml(canvasName)}" placeholder="Canvas name" style="flex:1;min-width:120px;font-weight:700;">
                <button type="button" class="btn btn-outline btn-sm" id="newCanvasBtn" title="Start a new canvas">${PCD.icon('plus', 14)} <span>New</span></button>
                ${allCanvases.length > 0 ? '<button type="button" class="btn btn-outline btn-sm" id="loadCanvasBtn" title="Load saved canvas">' + PCD.icon('book-open', 14) + ' <span>Load (' + allCanvases.length + ')</span></button>' : ''}
              </div>

              <div class="mb-3">
                <div class="text-muted text-sm mb-1">Orientation</div>
                <div class="flex gap-1">
                  <button type="button" class="btn btn-secondary btn-sm ${orientation==='landscape'?'active':''}" data-orient="landscape" style="flex:1;">${PCD.icon('grid',14)} <span>Landscape</span></button>
                  <button type="button" class="btn btn-secondary btn-sm ${orientation==='portrait'?'active':''}" data-orient="portrait" style="flex:1;">${PCD.icon('file-text',14)} <span>Portrait</span></button>
                </div>
              </div>

              <div class="mb-3">
                <div class="text-muted text-sm mb-1">Columns</div>
                <div class="flex gap-1" style="flex-wrap:wrap;">
                  ${[2,3,4,5,6,7].map(function (n) {
                    return '<button type="button" class="btn btn-secondary btn-sm ' + (columns===n?'active':'') + '" data-cols="' + n + '" style="flex:1;min-width:36px;">' + n + '</button>';
                  }).join('')}
                </div>
              </div>

              <div class="mb-3">
                <div class="text-muted text-sm mb-1">Rows per page</div>
                <div class="flex gap-1">
                  <button type="button" class="btn btn-secondary btn-sm ${rows===0?'active':''}" data-rows="0" style="flex:1;" title="Auto-fit, no limit">Auto</button>
                  <button type="button" class="btn btn-secondary btn-sm ${rows===1?'active':''}" data-rows="1" style="flex:1;">1</button>
                  <button type="button" class="btn btn-secondary btn-sm ${rows===2?'active':''}" data-rows="2" style="flex:1;">2</button>
                  <button type="button" class="btn btn-secondary btn-sm ${rows===3?'active':''}" data-rows="3" style="flex:1;">3</button>
                </div>
              </div>

              <div class="mb-3">
                <div class="text-muted text-sm mb-1">Font size</div>
                <div class="flex gap-1">
                  <button type="button" class="btn btn-secondary btn-sm ${fontSize==='small'?'active':''}" data-fs="small" style="flex:1;">Small</button>
                  <button type="button" class="btn btn-secondary btn-sm ${fontSize==='medium'?'active':''}" data-fs="medium" style="flex:1;">Medium</button>
                  <button type="button" class="btn btn-secondary btn-sm ${fontSize==='large'?'active':''}" data-fs="large" style="flex:1;">Large</button>
                </div>
              </div>

              <div class="flex items-center gap-3 mb-3" style="flex-wrap:wrap;">
                <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;">
                  <input type="checkbox" id="showMethod" ${showMethod ? 'checked' : ''} style="accent-color:var(--brand-600);">
                  <span>Include method</span>
                </label>
                <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;">
                  <input type="checkbox" id="showAmounts" ${showAmounts ? 'checked' : ''} style="accent-color:var(--brand-600);">
                  <span>Show amounts</span>
                </label>
              </div>

              <div class="flex items-center gap-2" style="flex-wrap:wrap;">
                <button class="btn btn-outline btn-sm" id="selectAllBtn">Select all</button>
                <button class="btn btn-outline btn-sm" id="selectNoneBtn">Select none</button>
                <span class="text-muted text-sm" id="selCount" style="margin-inline-start:auto;">${selected.size} / ${recipes.length}</span>
              </div>
            </div>

            <div class="card" style="padding:6px 0;max-height:340px;overflow-y:auto;">
              <div id="recipeList"></div>
            </div>

            <div class="flex gap-2 mt-3">
              <button type="button" class="btn btn-outline" id="saveCanvasBtn" style="flex:1;" ${selected.size === 0 ? 'disabled' : ''}>
                ${PCD.icon('check', 16)} <span>Save canvas</span>
              </button>
              <button type="button" class="btn btn-primary" id="printSheetBtn" style="flex:2;" ${selected.size === 0 ? 'disabled' : ''}>
                ${PCD.icon('print', 16)} <span>Print · ${selected.size} recipes</span>
              </button>
            </div>
          </div>

          <div>
            <div class="card" style="padding:8px;background:var(--surface-2);position:sticky;top:80px;">
              <div class="flex items-center justify-between mb-2" style="padding:0 6px;">
                <div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-3);">Live preview</div>
                <div class="text-muted" style="font-size:11px;">A4 · ${orientation} · ${columns} cols</div>
              </div>
              <div id="kcPreview" style="background:#fff;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;${orientation === 'landscape' ? 'aspect-ratio:1.414/1;' : 'aspect-ratio:1/1.414;'}"></div>
            </div>
          </div>
        </div>

        <style>
          @media (max-width: 900px) {
            .kc-layout { grid-template-columns: 1fr !important; }
          }
          /* Preview wrapper: real A4 size scaled down so layout is identical to print */
          .kc-preview-frame {
            transform-origin: top left;
            position: absolute;
            top: 0; left: 0;
            background: #fff;
          }
          .kc-preview-outer {
            position: relative;
            overflow: hidden;
            background: #fff;
          }
          .kc-preview-frame .kc-sheet {
            box-sizing: border-box;
          }
        </style>
      `;

      const listEl = PCD.$('#recipeList', bodyEl);
      recipes.forEach(function (r) {
        const isSelected = selected.has(r.id);
        const row = PCD.el('label', {
          style: {
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 14px',
            cursor: 'pointer',
            borderBottom: '1px solid var(--border)',
            background: isSelected ? 'var(--brand-50)' : 'var(--surface)'
          }
        });
        row.innerHTML =
          '<input type="checkbox" data-rid="' + r.id + '"' + (isSelected ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--brand-600);flex-shrink:0;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;font-size:14px;">' + PCD.escapeHtml(r.name) + '</div>' +
            '<div class="text-muted" style="font-size:12px;">' +
              ((r.ingredients || []).length) + ' ingredient' + ((r.ingredients || []).length === 1 ? '' : 's') +
              (r.servings ? ' · ' + r.servings + ' servings' : '') +
            '</div>' +
          '</div>';
        listEl.appendChild(row);
      });

      // Wire
      PCD.on(bodyEl, 'click', '[data-orient]', function () {
        orientation = this.getAttribute('data-orient');
        renderBody();
      });
      PCD.on(bodyEl, 'click', '[data-cols]', function () {
        columns = parseInt(this.getAttribute('data-cols'), 10);
        renderBody();
      });
      PCD.on(bodyEl, 'click', '[data-rows]', function () {
        rows = parseInt(this.getAttribute('data-rows'), 10);
        renderBody();
      });
      PCD.on(bodyEl, 'click', '[data-fs]', function () {
        fontSize = this.getAttribute('data-fs');
        renderBody();
      });

      // Canvas name input → just track value
      const nameInp = PCD.$('#canvasName', bodyEl);
      if (nameInp) nameInp.addEventListener('input', function () { canvasName = this.value; });

      // Save canvas
      PCD.$('#saveCanvasBtn', bodyEl).addEventListener('click', function () {
        if (selected.size === 0) return;
        const finalName = (canvasName || '').trim() || 'Untitled canvas';
        const payload = {
          name: finalName,
          recipeIds: Array.from(selected),
          columns: columns, rows: rows, orientation: orientation,
          showMethod: showMethod, showAmounts: showAmounts, fontSize: fontSize,
        };
        if (canvasId) payload.id = canvasId;
        const saved = PCD.store.upsertInTable('canvases', payload, 'cvs');
        if (saved && saved.id) {
          canvasId = saved.id;
          PCD.toast.success('Canvas "' + finalName + '" saved');
        } else {
          PCD.toast.error('Save failed');
        }
      });

      // New canvas — clear current and reset to defaults
      PCD.$('#newCanvasBtn', bodyEl).addEventListener('click', function () {
        canvasId = null;
        canvasName = 'Kitchen Reference';
        selected.clear();
        recipes.forEach(function (r) { selected.add(r.id); });
        columns = 3; rows = 0; orientation = 'landscape';
        showMethod = true; showAmounts = true; fontSize = 'medium';
        renderBody();
        PCD.toast.info('New canvas — name it and customize');
      });

      // Load canvas — picker modal
      const loadBtn = PCD.$('#loadCanvasBtn', bodyEl);
      if (loadBtn) loadBtn.addEventListener('click', function () {
        openCanvasPicker(function (cvs) {
          // Apply chosen canvas
          canvasId = cvs.id;
          canvasName = cvs.name || 'Kitchen Reference';
          selected.clear();
          (cvs.recipeIds || []).forEach(function (rid) {
            if (recipes.some(function (r) { return r.id === rid; })) selected.add(rid);
          });
          columns = cvs.columns || 3;
          rows = cvs.rows || 0;
          orientation = cvs.orientation || 'landscape';
          showMethod = !!cvs.showMethod;
          showAmounts = !!cvs.showAmounts;
          fontSize = cvs.fontSize || 'medium';
          renderBody();
        });
      });

      PCD.$('#showMethod', bodyEl).addEventListener('change', function () { showMethod = this.checked; updatePreview(); });
      PCD.$('#showAmounts', bodyEl).addEventListener('change', function () { showAmounts = this.checked; updatePreview(); });
      PCD.$('#selectAllBtn', bodyEl).addEventListener('click', function () {
        recipes.forEach(function (r) { selected.add(r.id); });
        renderBody();
      });
      PCD.$('#selectNoneBtn', bodyEl).addEventListener('click', function () {
        selected.clear();
        renderBody();
      });
      PCD.on(bodyEl, 'change', 'input[type=checkbox][data-rid]', function () {
        const rid = this.getAttribute('data-rid');
        if (this.checked) selected.add(rid); else selected.delete(rid);
        const printBtn = PCD.$('#printSheetBtn', bodyEl);
        if (printBtn) {
          printBtn.disabled = selected.size === 0;
          const span = printBtn.querySelector('span');
          if (span) span.textContent = 'Print · ' + selected.size + ' recipes';
        }
        const saveBtn = PCD.$('#saveCanvasBtn', bodyEl);
        if (saveBtn) saveBtn.disabled = selected.size === 0;
        const row = this.closest('label');
        if (row) row.style.background = this.checked ? 'var(--brand-50)' : 'var(--surface)';
        const countEl = PCD.$('#selCount', bodyEl);
        if (countEl) countEl.textContent = selected.size + ' / ' + recipes.length;
        updatePreview();
      });
      PCD.$('#printSheetBtn', bodyEl).addEventListener('click', function () {
        if (selected.size === 0) return;
        printSheet(recipes.filter(function (r) { return selected.has(r.id); }), {
          columns: columns,
          orientation: orientation,
          rows: rows,
          showMethod: showMethod,
          showAmounts: showAmounts,
          fontSize: fontSize,
          title: canvasName,
        });
      });

      // Live preview
      updatePreview();
    }

    function updatePreview() {
      const previewEl = PCD.$('#kcPreview', bodyEl);
      if (!previewEl) return;
      const selectedRecipes = recipes.filter(function (r) { return selected.has(r.id); });
      if (selectedRecipes.length === 0) {
        previewEl.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);text-align:center;padding:30px;">' +
            '<div>' +
              '<div style="font-size:32px;margin-bottom:8px;color:var(--brand-600);">' + PCD.icon('id-card', 32) + '</div>' +
              '<div style="font-weight:600;font-size:14px;margin-bottom:4px;">Select recipes to preview</div>' +
              '<div style="font-size:12px;">Tick the recipes you want on the sheet to see how they\'ll print.</div>' +
            '</div>' +
          '</div>';
        return;
      }
      const html = buildSheetHtml(selectedRecipes, {
        columns: columns,
        orientation: orientation,
        rows: rows,
        showMethod: showMethod,
        showAmounts: showAmounts,
        fontSize: fontSize,
        title: canvasName,
      });

      // Real A4 dimensions in mm (with 8mm margin from @page rule, but we render full page)
      const A4_W = orientation === 'landscape' ? 297 : 210;
      const A4_H = orientation === 'landscape' ? 210 : 297;
      // mm → px at 96 DPI: 1mm ≈ 3.7795px
      const MM_TO_PX = 3.7795;
      const pageW = A4_W * MM_TO_PX;
      const pageH = A4_H * MM_TO_PX;

      // Build preview with the full-size rendered sheet inside a scaled wrapper
      previewEl.classList.add('kc-preview-outer');
      previewEl.style.width = '100%';
      previewEl.style.aspectRatio = (A4_W / A4_H).toFixed(4);
      previewEl.innerHTML =
        '<div class="kc-preview-frame" style="width:' + pageW + 'px;height:' + pageH + 'px;padding:8mm;box-sizing:border-box;">' + html + '</div>';

      // After mount, compute scale to fit
      requestAnimationFrame(function () {
        const containerW = previewEl.clientWidth;
        if (!containerW) return;
        const scale = containerW / pageW;
        const frame = previewEl.querySelector('.kc-preview-frame');
        if (frame) {
          frame.style.transform = 'scale(' + scale + ')';
        }
      });
    }

    renderBody();

    // Re-fit preview on window resize
    let resizeTimer;
    const onResize = function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { updatePreview(); }, 150);
    };
    window.addEventListener('resize', onResize);
    // Cleanup if view is replaced (best-effort — view element gone = listener orphaned but harmless)
  }

  // Format ingredient amount nicely
  function formatAmount(amt, unit) {
    if (amt === null || amt === undefined || amt === '') return unit || '';
    const num = Number(amt);
    if (isNaN(num)) return String(amt) + ' ' + (unit || '');
    // Trim trailing zeros: 100.0 → 100, 0.500 → 0.5
    let s = num % 1 === 0 ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
    return s + (unit ? ' ' + unit : '');
  }

  // Method splitting: try numbered steps first, else split by newlines
  function splitMethod(steps) {
    if (!steps) return [];
    const text = String(steps).trim();
    if (!text) return [];

    // Already numbered? "1) ..." or "1. ..." or "1- ..."
    const numbered = text.split(/\n\s*(?=\d+[\.\)\-]\s)/);
    if (numbered.length > 1) {
      return numbered.map(function (s) {
        return s.replace(/^\d+[\.\)\-]\s*/, '').trim();
      }).filter(Boolean);
    }
    // Otherwise split by double newline (paragraphs) or single newline
    const paragraphs = text.split(/\n\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (paragraphs.length > 1) return paragraphs;
    // Final fallback — split by single newline
    return text.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  // Canvas picker — list saved canvases, allow load or delete
  function openCanvasPicker(onPick) {
    const all = (PCD.store.listTable('canvases') || []).slice();
    all.sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });

    const body = PCD.el('div');
    function paintList() {
      const list = (PCD.store.listTable('canvases') || []).slice();
      list.sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
      if (list.length === 0) {
        body.innerHTML = '<div class="text-muted" style="padding:20px;text-align:center;">No saved canvases yet</div>';
        return;
      }
      body.innerHTML = '<div class="flex flex-col gap-2">' +
        list.map(function (c) {
          const recipeCount = (c.recipeIds || []).length;
          return '<div class="card" data-cvs="' + c.id + '" style="display:flex;align-items:center;gap:12px;padding:12px;cursor:pointer;">' +
            '<div style="width:36px;height:36px;border-radius:6px;background:var(--brand-50);color:var(--brand-700);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + PCD.icon('id-card', 18) + '</div>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-weight:700;font-size:14px;">' + PCD.escapeHtml(c.name || 'Untitled') + '</div>' +
              '<div class="text-muted" style="font-size:12px;">' +
                recipeCount + ' recipes · ' + (c.columns || 3) + ' cols · ' +
                (c.orientation || 'landscape') + ' · ' + PCD.fmtRelTime(c.updatedAt) +
              '</div>' +
            '</div>' +
            '<button type="button" class="icon-btn" data-del-cvs="' + c.id + '" title="Delete">' + PCD.icon('trash', 16) + '</button>' +
          '</div>';
        }).join('') +
      '</div>';
    }
    paintList();

    const closeBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: 'Close', style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: 'Saved canvases', body: body, footer: footer, size: 'sm', closable: true });
    closeBtn.addEventListener('click', function () { m.close(); });

    PCD.on(body, 'click', '[data-cvs]', function (e) {
      if (e.target.closest('[data-del-cvs]')) return;
      const id = this.getAttribute('data-cvs');
      const cvs = PCD.store.getFromTable('canvases', id);
      if (!cvs) return;
      m.close();
      setTimeout(function () { onPick(cvs); }, 200);
    });
    PCD.on(body, 'click', '[data-del-cvs]', function (e) {
      e.stopPropagation();
      const id = this.getAttribute('data-del-cvs');
      const cvs = PCD.store.getFromTable('canvases', id);
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: 'Delete canvas?',
        text: '"' + (cvs && cvs.name ? cvs.name : 'Canvas') + '" will be permanently removed.',
        okText: 'Delete'
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteFromTable('canvases', id);
        PCD.toast.success('Canvas deleted');
        paintList();
      });
    });
  }

  function buildSheetHtml(recipes, opts) {
    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });

    // Compact, balanced typography — auto-shrink for narrow columns
    const fontSizes = {
      small:  { name: 8.5,  ing: 7,   method: 6.5 },
      medium: { name: 10,   ing: 8,   method: 7.5 },
      large:  { name: 11.5, ing: 9.5, method: 9   },
    };
    let fs = Object.assign({}, fontSizes[opts.fontSize] || fontSizes.medium);
    // Auto-shrink for 6+ columns regardless of fontSize choice
    if (opts.columns >= 7) {
      fs.name = Math.min(fs.name, 7.5);
      fs.ing = Math.min(fs.ing, 6);
      fs.method = Math.min(fs.method, 5.5);
    } else if (opts.columns === 6) {
      fs.name = Math.min(fs.name, 8.5);
      fs.ing = Math.min(fs.ing, 6.5);
      fs.method = Math.min(fs.method, 6);
    }

    let blocksHtml = '';
    recipes.forEach(function (r) {
      let ingsHtml = '';
      (r.ingredients || []).forEach(function (ri) {
        const ing = ingMap[ri.ingredientId];
        const name = ing ? ing.name : '?';
        const amt = opts.showAmounts ? formatAmount(ri.amount, ri.unit) : '';
        ingsHtml +=
          '<div class="kc-ing">' +
            '<span class="kc-ing-name">' + PCD.escapeHtml(name) + '</span>' +
            (opts.showAmounts ? '<span class="kc-ing-leader"></span><span class="kc-ing-amt">' + PCD.escapeHtml(amt) + '</span>' : '') +
          '</div>';
      });

      let methodHtml = '';
      if (opts.showMethod) {
        const steps = splitMethod(r.steps);
        if (steps.length > 0) {
          // Inline numbered method (saves vertical space)
          methodHtml = '<div class="kc-method">' +
            steps.map(function (s, i) {
              return '<span class="kc-step"><b>' + (i + 1) + '.</b> ' + PCD.escapeHtml(s) + '</span>';
            }).join(' ') +
          '</div>';
        }
      }

      blocksHtml +=
        '<div class="kc-block">' +
          '<div class="kc-name">' + PCD.escapeHtml(r.name || '') +
            (r.servings ? '<span class="kc-srv"> · ' + r.servings + 'p</span>' : '') +
          '</div>' +
          (ingsHtml ? '<div class="kc-ings">' + ingsHtml + '</div>' : '') +
          methodHtml +
        '</div>';
    });

    return (
      '<style>' +
        // ZERO page margin — full sheet usage
        '@page { size: A4 ' + opts.orientation + '; margin: 0; }' +
        'body { margin: 0; padding: 0; font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; color: #1a1a1a; background: #fff; }' +

        // Sheet uses CSS Grid for clean equal columns
        '.kc-sheet {' +
          'box-sizing: border-box;' +
          'padding: 4mm;' +  // small inner padding (printer-safe area)
          'display: grid;' +
          'grid-template-columns: repeat(' + opts.columns + ', minmax(0, 1fr));' +
          (opts.rows && opts.rows > 0
            ? 'grid-auto-rows: minmax(0, 1fr);' +
              'height: 100vh;' +  // fill the page so rows have consistent height
              'grid-template-rows: auto repeat(' + opts.rows + ', minmax(0, 1fr));'
            : 'align-content: start;') +
          'gap: 2mm;' +
        '}' +

        '.kc-header {' +
          'grid-column: 1 / -1;' +
          'display: flex; justify-content: space-between; align-items: baseline;' +
          'border-bottom: 2px solid #16a34a;' +
          'padding-bottom: 3px;' +
          'margin-bottom: 2px;' +
        '}' +
        '.kc-header h1 {' +
          'margin: 0;' +
          'font-size: 11pt; font-weight: 700;' +
          'color: #16a34a;' +
          'letter-spacing: -0.01em;' +
          'text-transform: uppercase;' +
        '}' +
        '.kc-header .meta { font-size: 7.5pt; color: #666; }' +

        // Each recipe is a framed card
        '.kc-block {' +
          'break-inside: avoid;' +
          'page-break-inside: avoid;' +
          'border: 1.5px solid #16a34a;' +
          'border-radius: 3px;' +
          'background: #fff;' +
          'min-width: 0; min-height: 0;' +
          'overflow: hidden;' +  // critical for fixed rows: don't bleed
          'display: flex; flex-direction: column;' +
        '}' +

        // Recipe title — green band header
        '.kc-name {' +
          'font-size: ' + fs.name + 'pt;' +
          'font-weight: 800;' +
          'color: #fff;' +
          'background: #16a34a;' +
          'padding: 3px 6px;' +
          'letter-spacing: 0.02em;' +
          'text-transform: uppercase;' +
          'line-height: 1.1;' +
          'word-break: break-word;' +
          'overflow-wrap: break-word;' +
          'hyphens: auto;' +
          'flex: 0 0 auto;' +
        '}' +
        '.kc-srv {' +
          'font-size: 0.82em;' +
          'font-weight: 500;' +
          'opacity: 0.9;' +
          'text-transform: none;' +
          'letter-spacing: 0;' +
        '}' +

        // Ingredients — tight rows
        '.kc-ings {' +
          'display: flex; flex-direction: column; gap: 0;' +
          'font-size: ' + fs.ing + 'pt;' +
          'line-height: 1.25;' +
          'padding: 4px 6px 2px;' +
          'flex: 1 1 auto;' +
          'overflow: hidden;' +
        '}' +
        '.kc-ing {' +
          'display: flex; align-items: baseline; gap: 0;' +
          'min-width: 0;' +
        '}' +
        '.kc-ing-name {' +
          'flex: 0 1 auto; min-width: 0;' +
          'word-break: break-word; overflow-wrap: break-word; hyphens: auto;' +
          'color: #2a2a2a;' +
        '}' +
        '.kc-ing-leader {' +
          'flex: 1 1 auto; min-width: 4px;' +
          'border-bottom: 1px dotted #ccc;' +
          'margin: 0 3px 3px;' +
          'align-self: end;' +
        '}' +
        '.kc-ing-amt {' +
          'flex: 0 0 auto;' +
          'font-weight: 700; color: #16a34a;' +
          'white-space: nowrap;' +
          'font-variant-numeric: tabular-nums;' +
        '}' +

        // Method — inline paragraph
        '.kc-method {' +
          'border-top: 1px dashed #ccc;' +
          'padding: 3px 6px 4px;' +
          'margin-top: auto;' +
          'font-size: ' + fs.method + 'pt;' +
          'line-height: 1.35;' +
          'color: #444;' +
          'overflow: hidden;' +
        '}' +
        '.kc-step b {' +
          'color: #16a34a; font-weight: 800;' +
          'margin-inline-end: 2px;' +
        '}' +

        '@media print {' +
          '* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }' +
        '}' +
      '</style>' +
      '<div class="kc-sheet">' +
        '<div class="kc-header">' +
          '<h1>' + PCD.escapeHtml(opts.title || 'Kitchen Reference') + '</h1>' +
          '<div class="meta">' + recipes.length + ' recipes · ' + new Date().toLocaleDateString() + '</div>' +
        '</div>' +
        blocksHtml +
      '</div>'
    );
  }

  function printSheet(recipes, opts) {
    const html = buildSheetHtml(recipes, opts);
    PCD.print(html, 'Kitchen Cards — ' + recipes.length + ' recipes');
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.kitchenCards = { render: render };
})();
