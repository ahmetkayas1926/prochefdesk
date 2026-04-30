/* ================================================================
   ProChefDesk — kitchen_cards.js (v2.4 — flexible canvas)

   Recipe layout on a configurable grid (1-9 columns).
   Each recipe card has a column span (1..cols).
   Cards can be:
     - Dragged to reorder (drag from header)
     - Resized horizontally (drag from right edge)
   CSS Grid auto-flow: dense fills gaps automatically.

   Storage shape (canvases table):
     {
       id, name, columns, orientation, fontSize,
       showMethod, showAmounts,
       layout: [{ recipeId, span }],  // ordered, span = column count
     }
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function render(view) {
    const t = PCD.i18n.t;
    const recipes = PCD.store.listRecipes().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('t_kitchen_cards_title') || 'Kitchen Cards'}</div>
          <div class="page-subtitle">${t('kc_subtitle')}</div>
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

    // State
    let canvasId = (lastCanvas && lastCanvas.id) || null;
    let canvasName = (lastCanvas && lastCanvas.name) || 'Kitchen Reference';
    let columns = (lastCanvas && lastCanvas.columns) || 3;
    let orientation = (lastCanvas && lastCanvas.orientation) || 'landscape';
    let fontSize = (lastCanvas && lastCanvas.fontSize) || 'medium';  // xs | small | medium | large
    let showMethod = lastCanvas ? !!lastCanvas.showMethod : true;
    let showAmounts = lastCanvas ? !!lastCanvas.showAmounts : true;

    // Layout: ordered list of { recipeId, span }
    let layout = (lastCanvas && Array.isArray(lastCanvas.layout))
      ? lastCanvas.layout.filter(function (it) { return recipes.some(function (r) { return r.id === it.recipeId; }); })
      : recipes.map(function (r) { return { recipeId: r.id, span: 1 }; });

    function renderBody() {
      const allCanvases = (PCD.store.listTable('canvases') || []).slice();
      allCanvases.sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });

      const colsButtons = [1,2,3,4,5,6,7,8,9].map(function (n) {
        return '<button type="button" class="btn btn-secondary btn-sm' + (columns===n?' active':'') + '" data-cols="' + n + '" style="flex:1;min-width:30px;padding:4px 0;">' + n + '</button>';
      }).join('');

      const fontButtons = [
        { id: 'xs', label: 'XS' },
        { id: 'small', label: 'S' },
        { id: 'medium', label: 'M' },
        { id: 'large', label: 'L' },
      ].map(function (f) {
        return '<button type="button" class="btn btn-secondary btn-sm' + (fontSize===f.id?' active':'') + '" data-fs="' + f.id + '" style="flex:1;">' + f.label + '</button>';
      }).join('');

      bodyEl.innerHTML = `
        <div style="display:grid;grid-template-columns:minmax(260px,1fr) minmax(380px,2fr);gap:14px;align-items:start;" class="kc-layout">
          <div>
            <div class="card mb-3" style="padding:14px;">
              <div class="flex items-center justify-between mb-2" style="gap:6px;flex-wrap:wrap;">
                <input type="text" class="input" id="canvasName" value="${PCD.escapeHtml(canvasName)}" placeholder="${PCD.escapeHtml(t('kc_canvas_name_placeholder'))}" style="flex:1;min-width:120px;font-weight:700;">
                <button type="button" class="btn btn-outline btn-sm" id="newCanvasBtn" title="${PCD.escapeHtml(t('kc_new_canvas_tooltip'))}">${PCD.icon('plus', 14)}</button>
                ${allCanvases.length > 0 ? '<button type="button" class="btn btn-outline btn-sm" id="loadCanvasBtn" title="' + PCD.escapeHtml(t('kc_load_canvas_tooltip')) + '">' + PCD.icon('book-open', 14) + ' <span>' + allCanvases.length + '</span></button>' : ''}
              </div>

              <div class="mb-2">
                <div class="text-muted text-sm mb-1">${t('kc_orientation')}</div>
                <div class="flex gap-1">
                  <button type="button" class="btn btn-secondary btn-sm ${orientation==='landscape'?'active':''}" data-orient="landscape" style="flex:1;">${PCD.icon('grid',14)} <span>${t('kc_landscape')}</span></button>
                  <button type="button" class="btn btn-secondary btn-sm ${orientation==='portrait'?'active':''}" data-orient="portrait" style="flex:1;">${PCD.icon('file-text',14)} <span>${t('kc_portrait')}</span></button>
                </div>
              </div>

              <div class="mb-2">
                <div class="text-muted text-sm mb-1">${t('kc_columns')}</div>
                <div class="flex gap-1" style="flex-wrap:wrap;">${colsButtons}</div>
              </div>

              <div class="mb-2">
                <div class="text-muted text-sm mb-1">${t('kc_font_size')}</div>
                <div class="flex gap-1">${fontButtons}</div>
              </div>

              <div class="flex items-center gap-3 mb-2" style="flex-wrap:wrap;">
                <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;">
                  <input type="checkbox" id="showMethod" ${showMethod ? 'checked' : ''} style="accent-color:var(--brand-600);">
                  <span>${t('kc_method')}</span>
                </label>
                <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;">
                  <input type="checkbox" id="showAmounts" ${showAmounts ? 'checked' : ''} style="accent-color:var(--brand-600);">
                  <span>${t('kc_amounts')}</span>
                </label>
              </div>

              <div style="font-size:11px;color:var(--text-3);padding:8px;background:var(--surface-2);border-radius:6px;line-height:1.4;">
                <strong>${t('kc_tips_title')}</strong><br>
                • ${t('kc_tip_1')}<br>
                • ${t('kc_tip_2')}<br>
                • ${t('kc_tip_3')}
              </div>
            </div>

            <div class="card" style="padding:8px 0;max-height:320px;overflow-y:auto;">
              <div style="padding:6px 12px;font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;">${t('kc_recipes_on_canvas')}</div>
              <div id="recipeList"></div>
            </div>

            <div class="flex gap-2 mt-3">
              <button type="button" class="btn btn-outline" id="saveCanvasBtn" style="flex:1;" ${layout.length === 0 ? 'disabled' : ''}>
                ${PCD.icon('check', 16)} <span>${t('kc_save_canvas')}</span>
              </button>
              <button type="button" class="btn btn-outline" id="shareCanvasBtn" style="flex:1;" ${layout.length === 0 ? 'disabled' : ''} title="${PCD.escapeHtml((PCD.i18n && PCD.i18n.t) ? PCD.i18n.t('canvas_share_btn') : 'Share QR')}">
                ${PCD.icon('share', 16)} <span>${(PCD.i18n && PCD.i18n.t) ? PCD.i18n.t('canvas_share_btn') : 'Share QR'}</span>
              </button>
              <button type="button" class="btn btn-primary" id="printSheetBtn" style="flex:2;" ${layout.length === 0 ? 'disabled' : ''}>
                ${PCD.icon('print', 16)} <span>${t('kc_print_x_recipes', { n: layout.length })}</span>
              </button>
            </div>
          </div>

          <div>
            <div class="card" style="padding:8px;background:var(--surface-2);position:sticky;top:80px;">
              <div class="flex items-center justify-between mb-2" style="padding:0 6px;">
                <div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-3);">${t('kc_live_preview')}</div>
                <div class="text-muted" style="font-size:11px;">${t('kc_a4_summary', { orient: orientation === 'landscape' ? t('kc_landscape').toLowerCase() : t('kc_portrait').toLowerCase(), cols: columns })}</div>
              </div>
              <div id="kcPreview" style="background:#fff;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;${orientation === 'landscape' ? 'aspect-ratio:1.414/1;' : 'aspect-ratio:1/1.414;'}position:relative;"></div>
            </div>
          </div>
        </div>

        <style>
          @media (max-width: 900px) {
            .kc-layout { grid-template-columns: 1fr !important; }
          }
          .kc-preview-frame {
            transform-origin: top left;
            position: absolute; top: 0; left: 0;
            background: #fff;
          }
          .kc-block.dragging { opacity: 0.4; }
          .kc-block.drag-over { outline: 3px dashed #16a34a; outline-offset: -3px; }
          .kc-resize-handle {
            position: absolute; top: 0; right: 0; bottom: 0; width: 8px;
            cursor: ew-resize; background: transparent;
            user-select: none;
          }
          .kc-resize-handle:hover { background: rgba(22,163,74,0.18); }
          .kc-block { position: relative; }
          .kc-block-header { cursor: grab; }
          .kc-block-header:active { cursor: grabbing; }
          .kc-block .remove-btn {
            position: absolute; top: 2px; right: 12px;
            width: 18px; height: 18px;
            border: 0; background: rgba(255,255,255,0.85); color: #b00;
            border-radius: 50%; cursor: pointer;
            display: none; align-items: center; justify-content: center;
            font-size: 12px; line-height: 1; font-weight: 700;
            z-index: 5;
          }
          .kc-block:hover .remove-btn { display: flex; }
          .kc-recipe-row {
            display: flex; align-items: center; gap: 10px;
            padding: 8px 12px; cursor: pointer;
            border-bottom: 1px solid var(--border);
          }
          .kc-recipe-row:hover { background: var(--surface-2); }
          .kc-recipe-row input { accent-color: var(--brand-600); }
        </style>
      `;

      // Recipe list (toggleable)
      const recipeListEl = PCD.$('#recipeList', bodyEl);
      const onCanvas = new Set(layout.map(function (l) { return l.recipeId; }));
      recipes.forEach(function (r) {
        const isOn = onCanvas.has(r.id);
        const row = PCD.el('label', { class: 'kc-recipe-row' });
        row.innerHTML = '<input type="checkbox" data-rid="' + r.id + '"' + (isOn ? ' checked' : '') + '>' +
          '<div style="flex:1;font-size:13px;font-weight:' + (isOn ? '600' : '400') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + PCD.escapeHtml(r.name) + '</div>';
        recipeListEl.appendChild(row);
      });

      // Wire all controls
      PCD.on(bodyEl, 'click', '[data-orient]', function () {
        orientation = this.getAttribute('data-orient');
        renderBody();
      });
      PCD.on(bodyEl, 'click', '[data-cols]', function () {
        columns = parseInt(this.getAttribute('data-cols'), 10);
        // Clamp existing spans
        layout = layout.map(function (it) { return { recipeId: it.recipeId, span: Math.min(it.span || 1, columns) }; });
        renderBody();
      });
      PCD.on(bodyEl, 'click', '[data-fs]', function () {
        fontSize = this.getAttribute('data-fs');
        renderBody();
      });

      const nameInp = PCD.$('#canvasName', bodyEl);
      if (nameInp) nameInp.addEventListener('input', function () { canvasName = this.value; });

      PCD.$('#showMethod', bodyEl).addEventListener('change', function () { showMethod = this.checked; updatePreview(); });
      PCD.$('#showAmounts', bodyEl).addEventListener('change', function () { showAmounts = this.checked; updatePreview(); });

      // Recipe checkbox toggles add/remove from layout
      PCD.on(recipeListEl, 'change', 'input[data-rid]', function () {
        const rid = this.getAttribute('data-rid');
        if (this.checked) {
          if (!layout.some(function (l) { return l.recipeId === rid; })) {
            layout.push({ recipeId: rid, span: 1 });
          }
        } else {
          layout = layout.filter(function (l) { return l.recipeId !== rid; });
        }
        renderBody();
      });

      // Helper: persist current canvas state. Used by both Save and Share buttons.
      // Returns the canvas ID (newly created or existing).
      function persistCanvas() {
        const finalName = (canvasName || '').trim() || 'Untitled canvas';
        const payload = {
          name: finalName,
          columns: columns, orientation: orientation, fontSize: fontSize,
          showMethod: showMethod, showAmounts: showAmounts,
          layout: layout.slice(),
        };
        if (canvasId) payload.id = canvasId;
        const saved = PCD.store.upsertInTable('canvases', payload, 'cvs');
        if (saved && saved.id) {
          canvasId = saved.id;
          return saved.id;
        }
        return null;
      }

      // Save canvas
      PCD.$('#saveCanvasBtn', bodyEl).addEventListener('click', function () {
        if (layout.length === 0) return;
        const id = persistCanvas();
        if (id) {
          PCD.toast.success(PCD.i18n.t('toast_canvas_saved', { name: ((canvasName || '').trim() || 'Untitled canvas') }));
        } else {
          PCD.toast.error(PCD.i18n.t('toast_save_failed'));
        }
      });

      // Share canvas as QR (v2.5.8) — auto-saves the canvas first if it has no ID yet.
      PCD.$('#shareCanvasBtn', bodyEl).addEventListener('click', function () {
        const t = PCD.i18n.t;
        if (layout.length === 0) return;

        const user = PCD.store.get('user');
        if (!user || !user.id) {
          PCD.toast.error(t('qr_signin_required'));
          return;
        }
        if (!PCD.share || !PCD.share.createOrGetShareUrl) {
          PCD.toast.error(t('qr_share_error'));
          return;
        }

        // Auto-save if needed so we always have a canvas ID to share.
        const id = persistCanvas();
        if (!id) {
          PCD.toast.error(t('canvas_share_save_failed'));
          return;
        }

        const shareBtn = PCD.$('#shareCanvasBtn', bodyEl);
        const origHTML = shareBtn.innerHTML;
        shareBtn.disabled = true;
        shareBtn.innerHTML = '<span class="spinner"></span> ' + t('qr_generating');

        PCD.share.createOrGetShareUrl('kitchencard', id).then(function (url) {
          shareBtn.disabled = false;
          shareBtn.innerHTML = origHTML;
          PCD.qr.show({
            title: (canvasName || '').trim() || 'Kitchen Reference',
            subtitle: t('canvas_share_qr_subtitle'),
            text: url
          });
        }).catch(function (e) {
          shareBtn.disabled = false;
          shareBtn.innerHTML = origHTML;
          PCD.toast.error(t('qr_share_error') + ': ' + (e.message || e));
        });
      });

      // New canvas
      PCD.$('#newCanvasBtn', bodyEl).addEventListener('click', function () {
        canvasId = null;
        canvasName = 'Kitchen Reference';
        columns = 3; orientation = 'landscape'; fontSize = 'medium';
        showMethod = true; showAmounts = true;
        layout = recipes.map(function (r) { return { recipeId: r.id, span: 1 }; });
        renderBody();
        PCD.toast.info(PCD.i18n.t('toast_new_canvas'));
      });

      // Load canvas
      const loadBtn = PCD.$('#loadCanvasBtn', bodyEl);
      if (loadBtn) loadBtn.addEventListener('click', function () {
        openCanvasPicker(function (cvs) {
          canvasId = cvs.id;
          canvasName = cvs.name || 'Kitchen Reference';
          columns = cvs.columns || 3;
          orientation = cvs.orientation || 'landscape';
          fontSize = cvs.fontSize || 'medium';
          showMethod = !!cvs.showMethod;
          showAmounts = !!cvs.showAmounts;
          if (Array.isArray(cvs.layout)) {
            layout = cvs.layout.filter(function (it) { return recipes.some(function (r) { return r.id === it.recipeId; }); });
          } else {
            layout = recipes.map(function (r) { return { recipeId: r.id, span: 1 }; });
          }
          renderBody();
        });
      });

      // Print
      PCD.$('#printSheetBtn', bodyEl).addEventListener('click', function () {
        if (layout.length === 0) return;
        printSheet({
          layout: layout.slice(),
          columns: columns, orientation: orientation, fontSize: fontSize,
          showMethod: showMethod, showAmounts: showAmounts,
          title: canvasName,
          recipes: recipes,
        });
      });

      updatePreview();
    }

    // ============ PREVIEW + INTERACTIONS ============
    function updatePreview() {
      const previewEl = PCD.$('#kcPreview', bodyEl);
      if (!previewEl) return;

      if (layout.length === 0) {
        previewEl.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);text-align:center;padding:30px;">' +
            '<div>' +
              '<div style="font-size:32px;margin-bottom:8px;color:var(--brand-600);">' + PCD.icon('id-card', 32) + '</div>' +
              '<div style="font-weight:600;font-size:14px;margin-bottom:4px;">' + t('kc_no_recipes_title') + '</div>' +
              '<div style="font-size:12px;">' + t('kc_no_recipes_msg') + '</div>' +
            '</div>' +
          '</div>';
        return;
      }

      const recipeMap = {};
      recipes.forEach(function (r) { recipeMap[r.id] = r; });
      const layoutRecipes = layout
        .map(function (it) { return { recipe: recipeMap[it.recipeId], span: it.span || 1 }; })
        .filter(function (x) { return !!x.recipe; });

      const html = buildSheetHtml({
        layoutRecipes: layoutRecipes,
        columns: columns, orientation: orientation, fontSize: fontSize,
        showMethod: showMethod, showAmounts: showAmounts,
        title: canvasName,
        interactive: true,  // adds drag/resize handles
      });

      // Render at real A4 size, then scale down
      const A4_W = orientation === 'landscape' ? 297 : 210;
      const A4_H = orientation === 'landscape' ? 210 : 297;
      const MM_TO_PX = 3.7795;
      const pageW = A4_W * MM_TO_PX;
      const pageH = A4_H * MM_TO_PX;

      previewEl.style.width = '100%';
      previewEl.style.aspectRatio = (A4_W / A4_H).toFixed(4);
      previewEl.innerHTML =
        '<div class="kc-preview-frame" style="width:' + pageW + 'px;height:' + pageH + 'px;padding:8mm;box-sizing:border-box;">' + html + '</div>';

      requestAnimationFrame(function () {
        const containerW = previewEl.clientWidth;
        if (!containerW) return;
        const scale = containerW / pageW;
        const frame = previewEl.querySelector('.kc-preview-frame');
        if (frame) frame.style.transform = 'scale(' + scale + ')';
        wireInteractions(frame);
      });
    }

    // ============ DRAG & RESIZE ============
    function wireInteractions(frame) {
      if (!frame) return;
      const blocks = frame.querySelectorAll('.kc-block');

      blocks.forEach(function (block) {
        const rid = block.getAttribute('data-rid');
        if (!rid) return;

        // === DRAG (header) ===
        const header = block.querySelector('.kc-block-header');
        if (header) {
          header.setAttribute('draggable', 'true');
          header.addEventListener('dragstart', function (e) {
            block.classList.add('dragging');
            try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', rid); } catch (err) {}
          });
          header.addEventListener('dragend', function () {
            block.classList.remove('dragging');
            frame.querySelectorAll('.drag-over').forEach(function (b) { b.classList.remove('drag-over'); });
          });
        }

        block.addEventListener('dragover', function (e) {
          e.preventDefault();
          if (!block.classList.contains('dragging')) block.classList.add('drag-over');
        });
        block.addEventListener('dragleave', function () { block.classList.remove('drag-over'); });
        block.addEventListener('drop', function (e) {
          e.preventDefault();
          block.classList.remove('drag-over');
          const draggedRid = e.dataTransfer.getData('text/plain') || (frame.querySelector('.dragging') && frame.querySelector('.dragging').getAttribute('data-rid'));
          if (!draggedRid || draggedRid === rid) return;
          // Reorder: move draggedRid before this rid
          const fromIdx = layout.findIndex(function (l) { return l.recipeId === draggedRid; });
          const toIdx = layout.findIndex(function (l) { return l.recipeId === rid; });
          if (fromIdx < 0 || toIdx < 0) return;
          const moved = layout.splice(fromIdx, 1)[0];
          // Adjust toIdx if we removed before it
          const insertAt = fromIdx < toIdx ? toIdx : toIdx;
          layout.splice(insertAt, 0, moved);
          updatePreview();
        });

        // Remove button (X in corner)
        const removeBtn = block.querySelector('.remove-btn');
        if (removeBtn) {
          removeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            layout = layout.filter(function (l) { return l.recipeId !== rid; });
            renderBody();
          });
        }

        // === RESIZE (right edge) ===
        const handle = block.querySelector('.kc-resize-handle');
        if (handle) {
          handle.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            // Compute one-column width (in unscaled px) from grid-template-columns
            const sheet = frame.querySelector('.kc-sheet');
            if (!sheet) return;
            const sheetRect = sheet.getBoundingClientRect();
            const scaleFactor = sheetRect.width / sheet.offsetWidth || 1;
            const oneColUnscaled = sheet.offsetWidth / columns;  // unscaled
            const item = layout.find(function (l) { return l.recipeId === rid; });
            if (!item) return;
            const startSpan = item.span || 1;

            function onMove(ev) {
              const dx = (ev.clientX - startX) / scaleFactor;  // back to unscaled
              const deltaCols = Math.round(dx / oneColUnscaled);
              const newSpan = Math.max(1, Math.min(columns, startSpan + deltaCols));
              if (newSpan !== item.span) {
                item.span = newSpan;
                updatePreview();
              }
            }
            function onUp() {
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
            }
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          });
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
  }

  // ============ SHEET HTML BUILDER ============
  // Accepts both data shapes:
  //   - Owner form (live editor): r.ingredients = [{ ingredientId, amount, unit }]
  //     -> looks up name from PCD.store.listIngredients()
  //   - Public form (share snapshot): r.ingredients = [{ name, amount, unit }]
  //     -> uses ri.name directly, never touches PCD.store
  function buildSheetHtml(opts) {
    let ingMap = {};
    if (PCD.store && PCD.store.listIngredients) {
      try {
        PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      } catch (e) { /* public viewer — store not initialised */ }
    }

    const fontSizes = {
      xs:     { name: 7,    ing: 5.5, method: 5.5 },
      small:  { name: 8.5,  ing: 7,   method: 6.5 },
      medium: { name: 10,   ing: 8,   method: 7.5 },
      large:  { name: 11.5, ing: 9.5, method: 9   },
    };
    let fs = Object.assign({}, fontSizes[opts.fontSize] || fontSizes.medium);
    // Auto-shrink if narrow columns and big font
    if (opts.columns >= 7 && opts.fontSize === 'large') fs = fontSizes.medium;
    else if (opts.columns >= 8 && opts.fontSize !== 'xs') {
      fs.name = Math.min(fs.name, 7.5);
      fs.ing = Math.min(fs.ing, 6);
      fs.method = Math.min(fs.method, 5.5);
    }

    let blocksHtml = '';
    (opts.layoutRecipes || []).forEach(function (item) {
      const r = item.recipe;
      const span = Math.max(1, Math.min(opts.columns, item.span || 1));

      let ingsHtml = '';
      (r.ingredients || []).forEach(function (ri) {
        // Public-form (snapshot): ri.name is set directly.
        // Owner-form (live editor): ri.ingredientId resolves via ingMap.
        const ing = ri.ingredientId ? ingMap[ri.ingredientId] : null;
        const name = ri.name || (ing ? ing.name : '?');
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
          methodHtml = '<div class="kc-method">' +
            steps.map(function (s, i) {
              return '<span class="kc-step"><b>' + (i + 1) + '.</b> ' + PCD.escapeHtml(s) + '</span>';
            }).join(' ') +
          '</div>';
        }
      }

      const interactiveExtras = opts.interactive
        ? '<button type="button" class="remove-btn" title="Remove from canvas">×</button>' +
          '<div class="kc-resize-handle" title="Drag to resize"></div>'
        : '';

      blocksHtml +=
        '<div class="kc-block" data-rid="' + r.id + '" style="grid-column: span ' + span + ';">' +
          '<div class="kc-name kc-block-header" title="Drag to reorder">' + PCD.escapeHtml(r.name || '') +
            (r.servings ? '<span class="kc-srv"> · ' + r.servings + 'p</span>' : '') +
          '</div>' +
          (ingsHtml ? '<div class="kc-ings">' + ingsHtml + '</div>' : '') +
          methodHtml +
          interactiveExtras +
        '</div>';
    });

    return (
      '<style>' +
        '@page { size: A4 ' + opts.orientation + '; margin: 0; }' +
        'body { margin: 0; padding: 0; font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; color: #1a1a1a; background: #fff; }' +

        '.kc-sheet {' +
          'box-sizing: border-box;' +
          'padding: 4mm;' +
          'display: grid;' +
          'grid-template-columns: repeat(' + opts.columns + ', minmax(0, 1fr));' +
          'grid-auto-flow: dense;' +    // fill gaps automatically
          'grid-auto-rows: min-content;' + // each row sized to its content
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

        '.kc-block {' +
          'break-inside: avoid;' +
          'page-break-inside: avoid;' +
          'border: 1.5px solid #16a34a;' +
          'border-radius: 3px;' +
          'background: #fff;' +
          'min-width: 0; min-height: 0;' +
          'display: flex; flex-direction: column;' +
          'overflow: hidden;' +
        '}' +
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
          'font-size: 0.82em; font-weight: 500; opacity: 0.9;' +
          'text-transform: none; letter-spacing: 0;' +
        '}' +
        '.kc-ings {' +
          'display: flex; flex-direction: column; gap: 0;' +
          'font-size: ' + fs.ing + 'pt;' +
          'line-height: 1.25;' +
          'padding: 4px 6px 2px;' +
          'flex: 1 1 auto;' +
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
        '.kc-method {' +
          'border-top: 1px dashed #ccc;' +
          'padding: 3px 6px 4px;' +
          'margin-top: auto;' +
          'font-size: ' + fs.method + 'pt;' +
          'line-height: 1.35;' +
          'color: #444;' +
        '}' +
        '.kc-step b {' +
          'color: #16a34a; font-weight: 800;' +
          'margin-inline-end: 2px;' +
        '}' +

        '@media print {' +
          '* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }' +
          '.kc-resize-handle, .remove-btn { display: none !important; }' +
        '}' +
      '</style>' +
      '<div class="kc-sheet">' +
        '<div class="kc-header">' +
          '<h1>' + PCD.escapeHtml(opts.title || 'Kitchen Reference') + '</h1>' +
          '<div class="meta">' + (opts.layoutRecipes || []).length + ' recipes · ' + new Date().toLocaleDateString() + '</div>' +
        '</div>' +
        blocksHtml +
      '</div>'
    );
  }

  function printSheet(opts) {
    const recipeMap = {};
    (opts.recipes || []).forEach(function (r) { recipeMap[r.id] = r; });
    const layoutRecipes = (opts.layout || [])
      .map(function (it) { return { recipe: recipeMap[it.recipeId], span: it.span || 1 }; })
      .filter(function (x) { return !!x.recipe; });

    const html = buildSheetHtml({
      layoutRecipes: layoutRecipes,
      columns: opts.columns, orientation: opts.orientation, fontSize: opts.fontSize,
      showMethod: opts.showMethod, showAmounts: opts.showAmounts,
      title: opts.title,
      interactive: false,
    });
    PCD.print(html, 'Kitchen Cards — ' + layoutRecipes.length + ' recipes');
  }

  // ============ HELPERS ============
  function formatAmount(amt, unit) {
    if (amt === null || amt === undefined || amt === '') return unit || '';
    const num = Number(amt);
    if (isNaN(num)) return String(amt) + ' ' + (unit || '');
    let s = num % 1 === 0 ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
    return s + (unit ? ' ' + unit : '');
  }

  function splitMethod(steps) {
    if (!steps || typeof steps !== 'string') return [];
    const text = steps.trim();
    if (!text) return [];
    const numbered = text.split(/\n+\s*(?=\d+[\.\)\-]\s*)/).map(function (s) {
      return s.replace(/^\d+[\.\)\-]\s*/, '').trim();
    }).filter(Boolean);
    if (numbered.length > 1) return numbered;
    return text.split(/\n\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  // ============ CANVAS PICKER ============
  function openCanvasPicker(onPick) {
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
          const recipeCount = (c.layout || []).length;
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
        PCD.toast.success(PCD.i18n.t('toast_canvas_deleted'));
        paintList();
      });
    });
  }

  // ============ SHARE SNAPSHOT (v2.5.8) ============
  // Build a self-contained snapshot of a saved canvas.
  // - Resolves every recipe inline (name, ingredients with names+amounts+units, steps).
  // - Public viewer never touches PCD.store — everything they need is in the payload.
  // Returns null if canvas is missing or has no usable recipes.
  function snapshotCanvas(canvasId) {
    const cvs = PCD.store.getFromTable('canvases', canvasId);
    if (!cvs) return null;

    // Resolve each recipe in the layout, embedding ingredient details inline.
    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });

    const layoutResolved = (cvs.layout || []).map(function (item) {
      const r = item.recipeId ? PCD.store.getRecipe(item.recipeId) : null;
      if (!r) return null;
      const ingredients = (r.ingredients || []).map(function (ri) {
        const ing = ingMap[ri.ingredientId];
        return {
          name: ing ? ing.name : '?',
          amount: ri.amount,
          unit: ri.unit || (ing && ing.unit) || '',
        };
      });
      return {
        recipeId: r.id,
        span: Math.max(1, item.span || 1),
        recipe: {
          id: r.id,
          name: r.name,
          servings: r.servings,
          ingredients: ingredients,
          steps: r.steps,
        },
      };
    }).filter(function (x) { return x !== null; });

    if (layoutResolved.length === 0) return null;

    return {
      kind: 'kitchencard',
      name: cvs.name || 'Kitchen Reference',
      columns: cvs.columns,
      orientation: cvs.orientation,
      fontSize: cvs.fontSize,
      showMethod: cvs.showMethod,
      showAmounts: cvs.showAmounts,
      layoutResolved: layoutResolved,
      sharedAt: new Date().toISOString(),
    };
  }

  // Render a snapshot for the public share viewer.
  // Returns a complete HTML string (sheet + fit-to-screen wrapper +
  // a "Save as PDF" button that triggers the browser's print dialog).
  // Does NOT depend on PCD.store — works on any device, even in incognito.
  function renderFromSnapshot(payload) {
    if (!payload || !payload.layoutResolved) {
      return '<div style="padding:40px;text-align:center;color:#666;">Canvas data missing</div>';
    }

    // Adapt snapshot's layoutResolved into the shape buildSheetHtml expects.
    const layoutRecipes = payload.layoutResolved.map(function (item) {
      return { recipe: item.recipe, span: item.span };
    });

    const sheetHtml = buildSheetHtml({
      layoutRecipes: layoutRecipes,
      columns: payload.columns,
      orientation: payload.orientation,
      fontSize: payload.fontSize,
      showMethod: payload.showMethod,
      showAmounts: payload.showAmounts,
      title: payload.name,
      interactive: false,
    });

    // Wrap with a small toolbar so mobile users can trigger Save-as-PDF.
    // Localised label falls back to English if i18n isn't loaded yet.
    const t = (PCD.i18n && PCD.i18n.t) ? PCD.i18n.t : function (k, fb) { return fb; };
    const saveLabel = t('canvas_share_save_pdf', 'Save as PDF');
    const tip = t('canvas_share_pdf_tip', 'Tap "Save as PDF" or use your browser\'s print menu.');

    return (
      '<style>' +
        '.kc-share-toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 14px; background: #ffffff; border-bottom: 1px solid #e5e7eb; flex-wrap: wrap; }' +
        '.kc-share-toolbar .left { font-size: 13px; color: #666; }' +
        '.kc-share-toolbar .left strong { color: #16a34a; }' +
        '.kc-share-toolbar button { background: #16a34a; color: #fff; border: 0; padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; }' +
        '.kc-share-toolbar button:hover { background: #15803d; }' +
        '.kc-share-tip { font-size: 11px; color: #999; padding: 8px 14px 0; text-align: center; }' +
        '@media print { .kc-share-toolbar, .kc-share-tip { display: none !important; } }' +
        '.kc-share-wrap { padding: 14px; max-width: 100%; overflow-x: auto; background: #f8fafc; }' +
        '@media print { .kc-share-wrap { padding: 0; background: #fff; } }' +
      '</style>' +
      '<div class="kc-share-toolbar">' +
        '<div class="left"><strong>ProChefDesk</strong> · ' + PCD.escapeHtml(payload.name || '') + '</div>' +
        '<button type="button" onclick="window.print()">📄 ' + PCD.escapeHtml(saveLabel) + '</button>' +
      '</div>' +
      '<div class="kc-share-tip">' + PCD.escapeHtml(tip) + '</div>' +
      '<div class="kc-share-wrap">' + sheetHtml + '</div>'
    );
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.kitchenCards = {
    render: render,
    snapshot: snapshotCanvas,
    renderFromSnapshot: renderFromSnapshot,
  };
})();
