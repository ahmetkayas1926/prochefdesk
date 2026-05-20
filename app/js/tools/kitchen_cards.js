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
    // v2.9.40 — Operator-requested per-canvas styling toggles.
    // borderWidth: card frame thickness (thin/medium/thick — visible on
    // print AND live preview so chef sees what they'll get).
    // bodyWeight: ingredient/method text weight (normal/medium/bold).
    let borderWidth = (lastCanvas && lastCanvas.borderWidth) || 'thin';   // thin | medium | thick
    let bodyWeight = (lastCanvas && lastCanvas.bodyWeight) || 'normal';   // normal | medium | bold
    // v2.9.22 — "Hide recipes used in other canvases" toggle state persisted
    // across renderBody calls (operator bug: checkbox state lost after add)
    let hideUsedElsewhere = false;

    // Layout: ordered list of { recipeId, span }
    // v2.8.21 — Default empty when no saved canvas. Previously auto-added
    // every recipe in the library which conflated preps (sub-recipes) and
    // 1-portion menu items on the kitchen reference sheet. Kitchen Cards
    // is meant as a quick-reference for batch preps the kitchen needs at
    // hand — the chef opts in to whatever belongs on the sheet.
    let layout = (lastCanvas && Array.isArray(lastCanvas.layout))
      ? lastCanvas.layout.filter(function (it) { return recipes.some(function (r) { return r.id === it.recipeId; }); })
      : [];

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

      // v2.9.40 — Border thickness + body text weight toggles
      const borderButtons = [
        { id: 'thin', labelKey: 'kc_border_thin', label: 'Thin' },
        { id: 'medium', labelKey: 'kc_border_medium', label: 'Medium' },
        { id: 'thick', labelKey: 'kc_border_thick', label: 'Thick' },
      ].map(function (b) {
        return '<button type="button" class="btn btn-secondary btn-sm' + (borderWidth===b.id?' active':'') + '" data-bw="' + b.id + '" style="flex:1;">' + (t(b.labelKey) || b.label) + '</button>';
      }).join('');

      const weightButtons = [
        { id: 'normal', labelKey: 'kc_weight_normal', label: 'Normal' },
        { id: 'medium', labelKey: 'kc_weight_medium', label: 'Medium' },
        { id: 'bold', labelKey: 'kc_weight_bold', label: 'Bold' },
      ].map(function (w) {
        return '<button type="button" class="btn btn-secondary btn-sm' + (bodyWeight===w.id?' active':'') + '" data-bdy="' + w.id + '" style="flex:1;">' + (t(w.labelKey) || w.label) + '</button>';
      }).join('');

      bodyEl.innerHTML = `
        <div style="display:grid;grid-template-columns:minmax(260px,1fr) minmax(380px,2fr);gap:14px;align-items:start;" class="kc-layout">
          <div>
            <div class="card mb-3" style="padding:14px;">
              <!-- v2.8.23 — Canvas controls modernized. Row 1: name input
                   + always-visible Saved Canvases button with count badge.
                   Row 2: two prominent labeled buttons (Save Canvas /
                   New Canvas) replacing the cramped icon-only buttons
                   that confused new users. -->
              <div class="flex items-center gap-2 mb-2" style="flex-wrap:nowrap;">
                <input type="text" class="input" id="canvasName" value="${PCD.escapeHtml(canvasName)}" placeholder="${PCD.escapeHtml(t('kc_canvas_name_placeholder'))}" style="flex:1;min-width:0;font-weight:700;">
                <button type="button" class="btn btn-outline btn-sm" id="loadCanvasBtn" style="flex:0 0 auto;" title="${PCD.escapeHtml(t('kc_load_canvas_tooltip'))}">${PCD.icon('book-open', 14)} <span>${allCanvases.length}</span></button>
              </div>
              <div class="flex gap-2 mb-2">
                <button type="button" class="btn btn-primary btn-sm" id="saveCanvasTopBtn" style="flex:1;min-width:0;" ${layout.length === 0 ? 'disabled' : ''}>
                  ${PCD.icon('check', 14)} <span>${t('kc_save_canvas')}</span>
                </button>
                <button type="button" class="btn btn-outline btn-sm" id="newCanvasBtn" style="flex:1;min-width:0;">
                  ${PCD.icon('plus', 14)} <span>${t('kc_new_canvas')}</span>
                </button>
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

              <div class="mb-2">
                <div class="text-muted text-sm mb-1">${t('kc_border_width') || 'Border thickness'}</div>
                <div class="flex gap-1">${borderButtons}</div>
              </div>

              <div class="mb-2">
                <div class="text-muted text-sm mb-1">${t('kc_body_weight') || 'Text weight'}</div>
                <div class="flex gap-1">${weightButtons}</div>
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

            <div class="card" style="padding:8px 0;">
              <div style="padding:6px 12px;font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;">${t('kc_recipes_on_canvas')}</div>
              <!-- v2.8.57 — Recipe arama. Anlık filter (case-insensitive,
                   substring). Section header'ları match yoksa gizlenir.
                   Search input scroll'un dışında — kullanıcı liste içinde
                   ne kadar aşağı kayarsa kaysın search üstte sabit. -->
              <div style="padding:4px 10px 6px;">
                <input type="search" id="kcRecipeSearch" placeholder="${PCD.escapeHtml(t('kc_search_placeholder'))}" autocomplete="off" style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-1);color:var(--text-1);font-size:13px;box-sizing:border-box;">
                <!-- v2.9.21 — Filter: hide recipes already used in another canvas -->
                <!-- v2.9.22 — Checked state persists via closure var hideUsedElsewhere -->
                <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-3);margin-top:6px;cursor:pointer;user-select:none;">
                  <input type="checkbox" id="kcHideUsedElsewhere" ${hideUsedElsewhere ? 'checked' : ''} style="margin:0;cursor:pointer;">
                  <span>${PCD.escapeHtml(t('kc_hide_used_elsewhere') || 'Hide recipes used in other canvases')}</span>
                </label>
                <!-- v2.9.23 — Bulk select buttons: act on currently visible recipes -->
                <div style="display:flex;gap:6px;margin-top:6px;">
                  <button type="button" class="btn btn-outline btn-sm" id="kcSelectAllVisible" style="flex:1;padding:4px 8px;font-size:11px;min-height:28px;">${PCD.escapeHtml(t('kc_select_all_visible') || '+ Select all visible')}</button>
                  <button type="button" class="btn btn-outline btn-sm" id="kcDeselectAllVisible" style="flex:1;padding:4px 8px;font-size:11px;min-height:28px;">${PCD.escapeHtml(t('kc_deselect_all_visible') || '− Deselect all')}</button>
                </div>
              </div>
              <div style="max-height:280px;overflow-y:auto;">
                <div id="recipeList"></div>
              </div>
            </div>

            <div class="flex gap-2 mt-3">
              <!-- v2.8.23 — Save moved to the top of the canvas card.
                   Remaining bottom-row actions: Share, Print, Clear. -->
              <button type="button" class="btn btn-outline" id="shareCanvasBtn" style="flex:0 0 auto;padding-inline:12px;" ${layout.length === 0 ? 'disabled' : ''} title="${PCD.escapeHtml((PCD.i18n && PCD.i18n.t) ? PCD.i18n.t('canvas_share_btn') : 'Share QR')}" aria-label="${PCD.escapeHtml((PCD.i18n && PCD.i18n.t) ? PCD.i18n.t('canvas_share_btn') : 'Share QR')}">
                ${PCD.icon('share', 18)}
              </button>
              <button type="button" class="btn btn-primary" id="printSheetBtn" style="flex:1;min-width:0;" ${layout.length === 0 ? 'disabled' : ''}>
                ${PCD.icon('print', 16)} <span>${t('kc_print_x_recipes', { n: layout.length })}</span>
              </button>
              <button type="button" class="btn btn-outline" id="clearCanvasBtn" style="flex:0 0 auto;padding-inline:12px;color:var(--danger);border-color:var(--danger);" ${layout.length === 0 ? 'disabled' : ''} title="${PCD.escapeHtml(t('kc_clear_canvas_btn'))}" aria-label="${PCD.escapeHtml(t('kc_clear_canvas_btn'))}">
                ${PCD.icon('trash', 18)}
              </button>
            </div>

            <!-- v2.8.20 — Save reminder. Gentle accent banner shown when
                 there are recipes on the canvas; nudges the user to name +
                 save before they leave / refresh the page. Single line,
                 brand color, info icon. -->
            <div id="kcSaveReminder" style="margin-top:10px;padding:8px 10px;background:var(--brand-50);border:1px solid var(--brand-200,#bbf7d0);border-radius:6px;font-size:11px;color:var(--brand-700);display:${layout.length > 0 ? 'flex' : 'none'};align-items:center;gap:8px;line-height:1.4;">
              ${PCD.icon('info', 14)}
              <span>${t('kc_save_reminder')}</span>
            </div>
          </div>

          <div>
            <div class="card" style="padding:8px;background:var(--surface-2);position:sticky;top:80px;">
              <div class="flex items-center justify-between mb-2" style="padding:0 6px;">
                <div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-3);">${t('kc_live_preview')}</div>
                <div class="text-muted" style="font-size:11px;">${t('kc_a4_summary', { orient: orientation === 'landscape' ? t('kc_landscape').toLowerCase() : t('kc_portrait').toLowerCase(), cols: columns })}</div>
              </div>
              <!-- v2.10.3 — Dark mode: container bg → surface so the
                   non-A4-sheet remainder of the panel respects theme.
                   The A4 sheet itself (.kc-preview-frame) keeps its
                   own #fff inline bg, so cards render WYSIWYG with print. -->
              <div id="kcPreview" style="background:var(--surface);border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;${orientation === 'landscape' ? 'aspect-ratio:1.414/1;' : 'aspect-ratio:1/1.414;'}position:relative;"></div>
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
          /* v2.8.17 — Drop indicator on the precise insertion edge.
             Top-half hover → green stripe above; bottom-half hover → below.
             Replaces the old whole-card outline that didn't convey position. */
          .kc-block.drop-before { box-shadow: 0 -4px 0 0 #16a34a; }
          .kc-block.drop-after { box-shadow: 0 4px 0 0 #16a34a; }
          .kc-sheet.drop-end-active { outline: 3px dashed #16a34a; outline-offset: -3px; }
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
            color: var(--text);
          }
          .kc-recipe-row:hover { background: var(--surface-2); }
          .kc-recipe-row input { accent-color: var(--brand-600); }
          /* v2.10.3 — Dark mode: live preview wrapper card uses surface-2
             instead of fixed white. The A4 canvas itself stays white
             (kc-preview-frame inline background: #fff) so cards render
             accurately, but the surrounding card frame respects theme. */
          .kc-preview-card { background: var(--surface-2); }
        </style>
      `;

      // Recipe list (toggleable)
      // v2.8.21 — Split into two sections: Preps (recipes with
      // yieldAmount + yieldUnit set, intended for batch prep / use as
      // sub-recipe) on top, then Menu items (1-portion plates). This
      // separates the kitchen-reference targets (sauces, dressings, spice
      // mixes) from menu plate cost calculations — they shouldn't sit
      // alphabetically interleaved on the same screen. Empty sections
      // hide their header so the panel stays clean.
      // v2.8.26 — Classification now goes through PCD.recipes.isPrep so
      // recipes explicitly flagged via the editor toggle (or bulk action)
      // are categorised correctly even when they have no recorded yield.
      const recipeListEl = PCD.$('#recipeList', bodyEl);
      const onCanvas = new Set(layout.map(function (l) { return l.recipeId; }));
      const _isPrep = (PCD.recipes && PCD.recipes.isPrep) ? PCD.recipes.isPrep : function (r) { return !!(r.yieldAmount && r.yieldUnit); };
      const preps = recipes.filter(_isPrep);
      const mains = recipes.filter(function (r) { return !_isPrep(r); });

      // v2.9.21 — "Used in N other canvases" indicator (operator request).
      // Build recipe→canvas-count map from all OTHER canvases (exclude
      // the canvas currently being edited). Helps chef avoid accidentally
      // reusing a recipe across canvases.
      const recipeCanvasCount = {};
      allCanvases.forEach(function (cv) {
        if (canvasId && cv.id === canvasId) return; // skip current canvas
        if (cv._deletedAt) return;
        const lyt = Array.isArray(cv.layout) ? cv.layout : [];
        lyt.forEach(function (it) {
          if (!it || !it.recipeId) return;
          recipeCanvasCount[it.recipeId] = (recipeCanvasCount[it.recipeId] || 0) + 1;
        });
      });

      function appendRow(r) {
        const isOn = onCanvas.has(r.id);
        const otherCount = recipeCanvasCount[r.id] || 0;
        const usedChip = otherCount > 0
          ? '<span title="' + PCD.escapeHtml(t('kc_recipe_in_other_canvases', { n: otherCount }) || 'Used in ' + otherCount + ' other canvas(es)') + '" style="flex-shrink:0;font-size:9px;font-weight:700;color:var(--brand-700);background:var(--brand-50);padding:1px 5px;border-radius:999px;letter-spacing:0.04em;border:1px solid var(--brand-300);">↳' + otherCount + '</span>'
          : '';
        const row = PCD.el('label', { class: 'kc-recipe-row', 'data-recipe-row': '', 'data-recipe-name': (r.name || '').toLowerCase(), 'data-used-elsewhere': otherCount > 0 ? '1' : '0' });
        row.innerHTML = '<input type="checkbox" data-rid="' + r.id + '"' + (isOn ? ' checked' : '') + '>' +
          '<div style="flex:1;font-size:13px;font-weight:' + (isOn ? '600' : '400') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + PCD.escapeHtml(r.name) + '</div>' +
          usedChip;
        recipeListEl.appendChild(row);
      }
      function appendHeader(labelKey, count) {
        const h = PCD.el('div', { 'data-recipe-header': '' });
        h.style.cssText = 'padding:8px 12px 4px;font-size:10px;font-weight:700;color:var(--brand-700);text-transform:uppercase;letter-spacing:0.08em;background:var(--brand-50);';
        h.textContent = t(labelKey, { n: count });
        recipeListEl.appendChild(h);
      }
      if (preps.length > 0) {
        appendHeader('kc_recipes_section_preps', preps.length);
        preps.forEach(appendRow);
      }
      if (mains.length > 0) {
        appendHeader('kc_recipes_section_menu', mains.length);
        mains.forEach(appendRow);
      }

      // v2.8.57 — Recipe arama: anlık filter (case-insensitive substring).
      // Empty değer → tümü görünür. Match: row.style.display + section
      // header'ları altında match var mı ona göre gizle/göster.
      // v2.9.21 — "Hide recipes used in other canvases" toggle eklendi.
      // Search + hide-used kombine filter.
      const searchEl = PCD.$('#kcRecipeSearch', bodyEl);
      const hideUsedEl = PCD.$('#kcHideUsedElsewhere', bodyEl);
      if (searchEl) {
        const allRows = recipeListEl.querySelectorAll('[data-recipe-row]');
        const allHeaders = recipeListEl.querySelectorAll('[data-recipe-header]');
        function applyFilters() {
          const q = (searchEl.value || '').trim().toLowerCase();
          const hideUsed = hideUsedEl && hideUsedEl.checked;
          allRows.forEach(function (r) {
            let visible = true;
            if (q) {
              const name = r.getAttribute('data-recipe-name') || '';
              if (name.indexOf(q) < 0) visible = false;
            }
            // Hide if used elsewhere AND not currently on this canvas
            // (rows checked on current canvas stay visible — chef should
            // see their own selections even with hide-used active).
            if (visible && hideUsed) {
              const usedElsewhere = r.getAttribute('data-used-elsewhere') === '1';
              const rid = r.querySelector('input[data-rid]');
              const isOnCurrent = rid && rid.checked;
              if (usedElsewhere && !isOnCurrent) visible = false;
            }
            r.style.display = visible ? '' : 'none';
          });
          // Section header'ı: altında görünür row varsa göster
          allHeaders.forEach(function (h) {
            let n = h.nextElementSibling;
            let anyVisible = false;
            while (n && !n.hasAttribute('data-recipe-header')) {
              if (n.hasAttribute('data-recipe-row') && n.style.display !== 'none') {
                anyVisible = true;
                break;
              }
              n = n.nextElementSibling;
            }
            h.style.display = anyVisible ? '' : 'none';
          });
        }
        searchEl.addEventListener('input', applyFilters);
        if (hideUsedEl) {
          hideUsedEl.addEventListener('change', function () {
            // v2.9.22 — persist to closure so renderBody preserves it
            hideUsedElsewhere = this.checked;
            applyFilters();
          });
          // Apply on initial render if persisted state is checked
          if (hideUsedElsewhere) applyFilters();
        }
      }

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
      // v2.9.40 — Border thickness + body text weight toggle handlers
      PCD.on(bodyEl, 'click', '[data-bw]', function () {
        borderWidth = this.getAttribute('data-bw');
        renderBody();
      });
      PCD.on(bodyEl, 'click', '[data-bdy]', function () {
        bodyWeight = this.getAttribute('data-bdy');
        renderBody();
      });

      const nameInp = PCD.$('#canvasName', bodyEl);
      if (nameInp) nameInp.addEventListener('input', function () { canvasName = this.value; });

      PCD.$('#showMethod', bodyEl).addEventListener('change', function () { showMethod = this.checked; updatePreview(); });
      PCD.$('#showAmounts', bodyEl).addEventListener('change', function () { showAmounts = this.checked; updatePreview(); });

      // Recipe checkbox toggles add/remove from layout
      // v2.9.21 — When ADD: after render, detect if the new card overflowed
      // beyond the visible sheet (CSS multi-column creates a virtual extra
      // column when a card doesn't fit in the last column's remaining space).
      // Auto-reposition: find any earlier column with enough empty bottom
      // space and move the new card there in the layout array. If no
      // column fits, leave at end and toast a warning.
      // v2.9.21/v2.9.23 — Operator UX: scroll position must survive
      // re-render. The actual scrollable container is `#recipeList`'s PARENT
      // div (style="max-height:280px;overflow-y:auto"), NOT #recipeList
      // itself. Targeting the wrong element returned scrollTop=0 (false
      // positive "fix" in v2.9.21).
      PCD.on(recipeListEl, 'change', 'input[data-rid]', function () {
        const rid = this.getAttribute('data-rid');
        const scrollContainer = recipeListEl.parentElement;
        const savedScroll = scrollContainer ? scrollContainer.scrollTop : 0;
        if (this.checked) {
          if (!layout.some(function (l) { return l.recipeId === rid; })) {
            layout.push({ recipeId: rid, span: 1 });
            renderBody();
            requestAnimationFrame(function () {
              const newList = PCD.$('#recipeList', bodyEl);
              if (newList && newList.parentElement) newList.parentElement.scrollTop = savedScroll;
              requestAnimationFrame(function () { attemptAutoFit(rid); });
            });
            return;
          }
        } else {
          layout = layout.filter(function (l) { return l.recipeId !== rid; });
        }
        renderBody();
        requestAnimationFrame(function () {
          const newList = PCD.$('#recipeList', bodyEl);
          if (newList && newList.parentElement) newList.parentElement.scrollTop = savedScroll;
        });
      });

      // v2.9.23 — Bulk select buttons: "Select all visible" / "Deselect
      // all visible". Adds/removes every currently visible recipe (not
      // hidden by search or hide-used filter) to the canvas in one go.
      // Single renderBody at the end → no thrash.
      const selAllBtn = PCD.$('#kcSelectAllVisible', bodyEl);
      const desAllBtn = PCD.$('#kcDeselectAllVisible', bodyEl);
      if (selAllBtn) selAllBtn.addEventListener('click', function () {
        const scrollContainer = recipeListEl.parentElement;
        const savedScroll = scrollContainer ? scrollContainer.scrollTop : 0;
        const visibleRows = Array.from(recipeListEl.querySelectorAll('[data-recipe-row]'))
          .filter(function (r) { return r.style.display !== 'none'; });
        let added = 0;
        visibleRows.forEach(function (row) {
          const cb = row.querySelector('input[data-rid]');
          if (!cb) return;
          const rid = cb.getAttribute('data-rid');
          if (!layout.some(function (l) { return l.recipeId === rid; })) {
            layout.push({ recipeId: rid, span: 1 });
            added++;
          }
        });
        if (added === 0) return;
        renderBody();
        requestAnimationFrame(function () {
          const newList = PCD.$('#recipeList', bodyEl);
          if (newList && newList.parentElement) newList.parentElement.scrollTop = savedScroll;
        });
        PCD.toast.success((PCD.i18n.t('kc_bulk_added', { n: added }) || '+' + added + ' added to canvas'));
      });
      if (desAllBtn) desAllBtn.addEventListener('click', function () {
        const scrollContainer = recipeListEl.parentElement;
        const savedScroll = scrollContainer ? scrollContainer.scrollTop : 0;
        const visibleRids = new Set(
          Array.from(recipeListEl.querySelectorAll('[data-recipe-row]'))
            .filter(function (r) { return r.style.display !== 'none'; })
            .map(function (r) {
              const cb = r.querySelector('input[data-rid]');
              return cb ? cb.getAttribute('data-rid') : null;
            })
            .filter(Boolean)
        );
        const before = layout.length;
        layout = layout.filter(function (l) { return !visibleRids.has(l.recipeId); });
        const removed = before - layout.length;
        if (removed === 0) return;
        renderBody();
        requestAnimationFrame(function () {
          const newList = PCD.$('#recipeList', bodyEl);
          if (newList && newList.parentElement) newList.parentElement.scrollTop = savedScroll;
        });
        PCD.toast.success((PCD.i18n.t('kc_bulk_removed', { n: removed }) || '−' + removed + ' removed from canvas'));
      });

      // v2.9.21 — Smart auto-fit for newly added cards.
      // Detects DOM overflow → reorders layout array to use empty bottom
      // space in earlier columns. Re-renders if a better position found.
      function attemptAutoFit(addedRid) {
        const previewEl = PCD.$('#kcPreview', bodyEl);
        if (!previewEl) return;
        const frame = previewEl.querySelector('.kc-preview-frame');
        if (!frame) return;
        const sheet = frame.querySelector('.kc-sheet');
        if (!sheet) return;

        const sheetRect = sheet.getBoundingClientRect();
        if (!sheetRect.width || !sheetRect.height) return;

        const newBlock = frame.querySelector('.kc-block[data-rid="' + addedRid + '"]');
        if (!newBlock) return;
        const newRect = newBlock.getBoundingClientRect();

        // Overflow check: new block's left position is at/past sheet's
        // right edge → it landed in a virtual overflow column.
        // 8px tolerance for sub-pixel rounding.
        const overflowing = newRect.left >= sheetRect.right - 8;
        if (!overflowing) return;

        const newH = newRect.height;
        const colWidth = sheetRect.width / columns;
        const blocks = Array.from(frame.querySelectorAll('.kc-block'));

        // Group non-overflow blocks by visual column index
        const blocksByCol = {};
        blocks.forEach(function (b) {
          if (b === newBlock) return;
          const r = b.getBoundingClientRect();
          if (r.left >= sheetRect.right - 8) return; // skip other overflows
          const colIdx = Math.floor((r.left - sheetRect.left) / colWidth);
          if (colIdx < 0 || colIdx >= columns) return;
          if (!blocksByCol[colIdx]) blocksByCol[colIdx] = [];
          blocksByCol[colIdx].push({ block: b, bottom: r.bottom });
        });

        // Find column with most empty bottom space that fits newH
        let bestColIdx = -1;
        let bestSpace = 0;
        for (let i = 0; i < columns; i++) {
          const colBlocks = blocksByCol[i] || [];
          if (colBlocks.length === 0) continue; // empty col is rare here
          const lastBottom = Math.max.apply(null, colBlocks.map(function (cb) { return cb.bottom; }));
          const space = sheetRect.bottom - lastBottom;
          if (space >= newH && space > bestSpace) {
            bestSpace = space;
            bestColIdx = i;
          }
        }

        if (bestColIdx === -1) {
          // No column has enough room — show informative warning.
          // Card stays at end (still visible to drag manually). Toast
          // info, not error, since this is expected when canvas full.
          PCD.toast.info(PCD.i18n.t('kc_autofit_no_space') || 'Card didn’t fit. Try increasing columns, shrinking font size, or removing another card.');
          return;
        }

        // Move newBlock in layout array: right after the last block of
        // bestColIdx (in DOM order, which matches layout order with
        // column-fill: auto)
        const targetColBlocks = blocksByCol[bestColIdx];
        const lastInColRid = targetColBlocks[targetColBlocks.length - 1].block.getAttribute('data-rid');
        const targetIdx = layout.findIndex(function (l) { return l.recipeId === lastInColRid; });
        const newIdx = layout.findIndex(function (l) { return l.recipeId === addedRid; });
        if (targetIdx < 0 || newIdx < 0) return;
        const item = layout.splice(newIdx, 1)[0];
        // After splice removes newIdx, adjust targetIdx if needed
        const adjustedTarget = newIdx < targetIdx ? targetIdx : targetIdx + 1;
        layout.splice(adjustedTarget, 0, item);
        renderBody();
      }

      // Helper: persist current canvas state. Used by both Save and Share buttons.
      // Returns the canvas ID (newly created or existing).
      function persistCanvas() {
        const finalName = (canvasName || '').trim() || 'Untitled canvas';
        const payload = {
          name: finalName,
          columns: columns, orientation: orientation, fontSize: fontSize,
          borderWidth: borderWidth, bodyWeight: bodyWeight,
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

      // v2.8.23 — Save handler now uses the prominent top button id
      // (saveCanvasTopBtn). After a successful save we re-render so the
      // Saved Canvases count badge updates immediately without F5.
      PCD.$('#saveCanvasTopBtn', bodyEl).addEventListener('click', function () {
        if (layout.length === 0) return;
        const id = persistCanvas();
        if (id) {
          PCD.toast.success(PCD.i18n.t('toast_canvas_saved', { name: ((canvasName || '').trim() || 'Untitled canvas') }));
          renderBody();
        } else {
          PCD.toast.error(PCD.i18n.t('toast_save_failed'));
        }
      });

      // v2.8.20 — Clear canvas: empty the layout (recipes selected),
      // keep canvas name + settings. Confirms first because it's
      // destructive — the in-memory selection is wiped, though saved
      // copies in the store remain untouched.
      const clearBtn = PCD.$('#clearCanvasBtn', bodyEl);
      if (clearBtn) clearBtn.addEventListener('click', function () {
        if (layout.length === 0) return;
        const t = PCD.i18n.t;
        PCD.modal.confirm({
          icon: '🗑', iconKind: 'danger', danger: true,
          title: t('kc_clear_canvas_confirm_title'),
          text: t('kc_clear_canvas_confirm_text'),
          okText: t('kc_clear_canvas_btn'),
        }).then(function (ok) {
          if (!ok) return;
          layout = [];
          renderBody();
        });
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
        // v2.8.21 — Default empty (was: auto-select every recipe)
        layout = [];
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
          borderWidth = cvs.borderWidth || 'thin';
          bodyWeight = cvs.bodyWeight || 'normal';
          showMethod = !!cvs.showMethod;
          showAmounts = !!cvs.showAmounts;
          if (Array.isArray(cvs.layout)) {
            layout = cvs.layout.filter(function (it) { return recipes.some(function (r) { return r.id === it.recipeId; }); });
          } else {
            // v2.8.21 — Loaded canvas without a layout array → default
            // empty. Chef picks recipes manually instead of inheriting
            // the entire library.
            layout = [];
          }
          renderBody();
        }, function (deletedId) {
          // v2.8.20 — If user deleted the canvas they currently have
          // loaded in the editor, clear the in-memory state so the
          // stale recipe selection doesn't linger until F5.
          if (deletedId === canvasId) {
            canvasId = null;
            canvasName = '';
            layout = [];
            renderBody();
          }
        });
      });

      // Print
      PCD.$('#printSheetBtn', bodyEl).addEventListener('click', function () {
        if (layout.length === 0) return;
        printSheet({
          layout: layout.slice(),
          columns: columns, orientation: orientation, fontSize: fontSize,
          borderWidth: borderWidth, bodyWeight: bodyWeight,
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
        borderWidth: borderWidth, bodyWeight: bodyWeight,
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

      // v2.8.11 — Container width is 0 on initial mount after F5 reload
      // before the surrounding grid layout settles; the previous code
      // early-returned on !containerW, leaving the A4 frame unscaled at
      // ~1123px and the preview visibly oversized until the user clicked
      // any control (which triggered a re-run of updatePreview when width
      // was stable). ResizeObserver fires once the element actually has a
      // size and again on any container resize, so the scale always
      // applies. The rAF path remains for the common case where width is
      // already known. Previous observer is disconnected to avoid leaks
      // across re-renders.
      function applyScale() {
        const containerW = previewEl.clientWidth;
        if (!containerW) return;
        const scale = containerW / pageW;
        const frame = previewEl.querySelector('.kc-preview-frame');
        if (frame) frame.style.transform = 'scale(' + scale + ')';
      }
      requestAnimationFrame(function () {
        applyScale();
        wireInteractions(previewEl.querySelector('.kc-preview-frame'));
      });
      if (typeof ResizeObserver !== 'undefined') {
        if (updatePreview._ro) updatePreview._ro.disconnect();
        updatePreview._ro = new ResizeObserver(applyScale);
        updatePreview._ro.observe(previewEl);
      }
    }

    // ============ DRAG & RESIZE ============
    function wireInteractions(frame) {
      if (!frame) return;
      const sheet = frame.querySelector('.kc-sheet');
      const blocks = frame.querySelectorAll('.kc-block');

      // v2.8.17 — Drag-drop rewrite for predictable reordering.
      // Old behavior: drop-on-card always inserted at toIdx (regardless
      // of fromIdx/toIdx relation), producing inconsistent "sometimes
      // swap, sometimes insert" results. Empty-space drops did nothing.
      // New behavior:
      //   - Top half of target card → insert BEFORE target
      //   - Bottom half of target card → insert AFTER target
      //   - Drop on empty area of the sheet → append to end
      // Combined with column-fill: auto, the array order matches the
      // visual order so the operator sees exactly what they're crafting.
      function clearDropMarkers() {
        frame.querySelectorAll('.drop-before, .drop-after').forEach(function (b) {
          b.classList.remove('drop-before');
          b.classList.remove('drop-after');
        });
        if (sheet) sheet.classList.remove('drop-end-active');
      }

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
            clearDropMarkers();
          });
        }

        block.addEventListener('dragover', function (e) {
          e.preventDefault();
          if (block.classList.contains('dragging')) return;
          const rect = block.getBoundingClientRect();
          const isTopHalf = (e.clientY - rect.top) < rect.height / 2;
          // Clear other blocks' markers, then set this one
          frame.querySelectorAll('.kc-block').forEach(function (b) {
            if (b !== block) { b.classList.remove('drop-before'); b.classList.remove('drop-after'); }
          });
          if (sheet) sheet.classList.remove('drop-end-active');
          block.classList.toggle('drop-before', isTopHalf);
          block.classList.toggle('drop-after', !isTopHalf);
        });
        block.addEventListener('dragleave', function () {
          block.classList.remove('drop-before');
          block.classList.remove('drop-after');
        });
        block.addEventListener('drop', function (e) {
          e.preventDefault();
          e.stopPropagation();
          const isAfter = block.classList.contains('drop-after');
          clearDropMarkers();
          const draggedRid = e.dataTransfer.getData('text/plain') || (frame.querySelector('.dragging') && frame.querySelector('.dragging').getAttribute('data-rid'));
          if (!draggedRid || draggedRid === rid) return;
          const fromIdx = layout.findIndex(function (l) { return l.recipeId === draggedRid; });
          let toIdx = layout.findIndex(function (l) { return l.recipeId === rid; });
          if (fromIdx < 0 || toIdx < 0) return;
          const moved = layout.splice(fromIdx, 1)[0];
          // Splice shifts indices >= fromIdx down by one
          if (fromIdx < toIdx) toIdx -= 1;
          layout.splice(isAfter ? toIdx + 1 : toIdx, 0, moved);
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
      });

      // === SHEET-LEVEL DROP (empty space → append to end) ===
      if (sheet) {
        sheet.addEventListener('dragover', function (e) {
          // Only show end-of-list indicator if cursor isn't over a block
          if (e.target.closest('.kc-block')) return;
          e.preventDefault();
          frame.querySelectorAll('.drop-before, .drop-after').forEach(function (b) {
            b.classList.remove('drop-before'); b.classList.remove('drop-after');
          });
          sheet.classList.add('drop-end-active');
        });
        sheet.addEventListener('dragleave', function (e) {
          // Only clear if leaving the sheet entirely
          if (e.target === sheet) sheet.classList.remove('drop-end-active');
        });
        sheet.addEventListener('drop', function (e) {
          if (e.target.closest('.kc-block')) return;  // handled by block
          e.preventDefault();
          clearDropMarkers();
          const draggedRid = e.dataTransfer.getData('text/plain') || (frame.querySelector('.dragging') && frame.querySelector('.dragging').getAttribute('data-rid'));
          if (!draggedRid) return;
          const fromIdx = layout.findIndex(function (l) { return l.recipeId === draggedRid; });
          if (fromIdx < 0) return;
          const moved = layout.splice(fromIdx, 1)[0];
          layout.push(moved);
          updatePreview();
        });
      }
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
    let recipeMap = {};
    if (PCD.store && PCD.store.listIngredients) {
      try {
        PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
      } catch (e) { /* public viewer — store not initialised */ }
    }
    // v2.9.21 — Sub-recipe name lookup. Owner kanvasında bir tarifin
    // içinde sub-recipe (ri.recipeId) referansı varsa, adını çekmek için
    // recipeMap gerek. Önceki kod sadece ri.ingredientId'ye bakıyordu →
    // sub-recipe satırları "?" olarak render oluyordu. (Public share /
    // Discover yolu zaten enrichPublicIngredientNames v2.8.66 ile inline
    // name gömüyor; bu fix owner-form için.)
    if (PCD.recipes && PCD.recipes.buildRecipeMap) {
      try {
        recipeMap = PCD.recipes.buildRecipeMap();
      } catch (e) { /* fall through */ }
    } else if (PCD.store && PCD.store.listRecipes) {
      try {
        PCD.store.listRecipes().forEach(function (r) { recipeMap[r.id] = r; });
      } catch (e) { /* fall through */ }
    }

    const fontSizes = {
      xs:     { name: 7,    ing: 5.5, method: 5.5 },
      small:  { name: 8.5,  ing: 7,   method: 6.5 },
      medium: { name: 10,   ing: 8,   method: 7.5 },
      large:  { name: 11.5, ing: 9.5, method: 9   },
    };
    // v2.9.40 — Border thickness (pt) and body text weight maps.
    // v2.10.1 — Print at 96 DPI rounds 0.5pt + 1pt to 1px (thin/medium
    // indistinguishable). Bumped to 0.5/1.5/3pt for clean 1/2/4 px steps.
    // Body weight 400/600/700 too close at 7-8pt print — Segoe UI's 600
    // and 700 strokes look identical at small print sizes. 400/700/900
    // gives clear three-step ladder (Regular / Bold / Black).
    const borderWidths = { thin: 0.5, medium: 1.5, thick: 3 };
    const bodyWeights = { normal: 400, medium: 700, bold: 900 };
    const bw = borderWidths[opts.borderWidth] || borderWidths.thin;
    const bdy = bodyWeights[opts.bodyWeight] || bodyWeights.normal;
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
      // v2.8.15 — Multi-column (masonry-style) layout replaces CSS grid.
      // Previously rows were sized to the tallest item which left short
      // cards stretched into empty space. With column layout each card
      // is its natural height and the next card flows below in the same
      // column, packing the A4 sheet efficiently. Trade-off: `span`
      // (multi-column-wide cards) and the resize handle are removed —
      // operator confirmed neither was in use.
      const span = Math.max(1, Math.min(opts.columns, item.span || 1));

      let ingsHtml = '';
      (r.ingredients || []).forEach(function (ri) {
        // v2.8.52 — Separator satırı: Kitchen Card'da grup ayracı (şef
        // tezgahta okurken malzeme gruplarını ayırt edebilsin).
        // Inline style: opsiyonel label varsa uppercase küçük yazı + border.
        if (ri && ri.separator) {
          const lbl = ri.label
            ? '<span style="font-size:0.8em;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#666;">' + PCD.escapeHtml(ri.label) + '</span>'
            : '&nbsp;';
          ingsHtml += '<div style="border-top:1px dashed #999;margin:4px 0 2px;padding-top:2px;">' + lbl + '</div>';
          return;
        }
        // Public-form (snapshot): ri.name is set directly.
        // Owner-form (live editor): ri.ingredientId or ri.recipeId resolves
        // via local maps. v2.9.21 — sub-recipe (ri.recipeId) lookup added;
        // previously sub-recipe rows showed "?".
        const ing = ri.ingredientId ? ingMap[ri.ingredientId] : null;
        const sub = ri.recipeId ? recipeMap[ri.recipeId] : null;
        const name = ri.name || (ing ? ing.name : (sub ? sub.name : '?'));
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
              return '<div class="kc-step"><span class="kc-step-num">' + (i + 1) + '.</span><span class="kc-step-text">' + PCD.escapeHtml(s) + '</span></div>';
            }).join('') +
          '</div>';
        }
      }

      const interactiveExtras = opts.interactive
        ? '<button type="button" class="remove-btn" title="Remove from canvas">×</button>'
        : '';

      // v2.8.20 — Sub-recipe header shows yield ("2 kg") instead of
      // servings ("1p"). A 2-kg batch of toum sauce isn't 1 portion;
      // showing the yield gives the kitchen the actual prepared amount.
      // v2.8.28 — When a recipe is flagged as Prep but has no recorded
      // yield, show NOTHING instead of falling back to servings — a prep
      // without yield is unmeasured, not a 1-portion plate, so "1p" was
      // misleading. Menu items still show servings as before.
      const _isPrepForLabel = (PCD.recipes && PCD.recipes.isPrep) ? PCD.recipes.isPrep(r) : !!(r.yieldAmount && r.yieldUnit);
      let srvLabel = '';
      if (r.yieldAmount && r.yieldUnit) {
        srvLabel = PCD.fmtNumber(r.yieldAmount) + ' ' + PCD.escapeHtml(r.yieldUnit);
      } else if (!_isPrepForLabel && r.servings) {
        srvLabel = r.servings + 'p';
      }
      blocksHtml +=
        '<div class="kc-block" data-rid="' + r.id + '">' +
          '<div class="kc-name kc-block-header" title="Drag to reorder">' + PCD.escapeHtml(r.name || '') +
            (srvLabel ? '<span class="kc-srv"> · ' + srvLabel + '</span>' : '') +
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

        // v2.8.18 — Print-path-only body sizing + flex column layout.
        // Without explicit body dimensions, column-fill: auto cannot compute
        // column breaks in the new-window print preview → all cards stack
        // in column 1 (operator's "first preview wrong, second correct"
        // issue). Sizing body to A4 mm makes the on-screen preview match
        // the @page print dimensions, so the first render is correct.
        // The flex column lets PCD.print's injected footer fit on the same
        // A4 page (previously it overflowed to page 2 because of its 24px
        // top margin + .kc-sheet at height: 100%). Live preview path
        // (interactive: true) keeps height: 100% inside .kc-preview-frame.
        //
        // v2.8.20 — Share path (shareMode: true) needs a third branch:
        // body must stay a normal web page (toolbar + tip + sheet wrap), so
        // we instead wrap the sheet in a .kc-page A4-sized flex container
        // inside buildSheetHtml's output. Without this, v2.8.18's body
        // sizing made the share viewer body itself A4-tall on screen,
        // squashing the page. The .kc-page wrapper is A4-mm, centered,
        // with a subtle shadow for an "on paper" feel; in @media print it
        // collapses to the page (no margin/shadow) so the saved PDF is
        // identical to the direct-print path.
        (opts.interactive
          ? '.kc-sheet { height: 100%; }'
          : opts.shareMode
          ?
            '.kc-page { ' +
              'box-sizing: border-box; ' +
              'width: ' + (opts.orientation === 'landscape' ? 297 : 210) + 'mm; ' +
              'height: ' + (opts.orientation === 'landscape' ? 210 : 297) + 'mm; ' +
              'display: flex; flex-direction: column; ' +
              'background: #fff; margin: 0 auto; ' +
              'box-shadow: 0 1px 3px rgba(0,0,0,0.08); ' +
            '}' +
            '.kc-sheet { flex: 1 1 auto; min-height: 0; height: auto; }' +
            '@media print { .kc-page { box-shadow: none !important; margin: 0 !important; } }'
          :
            'body { ' +
              'width: ' + (opts.orientation === 'landscape' ? 297 : 210) + 'mm; ' +
              'height: ' + (opts.orientation === 'landscape' ? 210 : 297) + 'mm; ' +
              'display: flex; flex-direction: column; ' +
            '}' +
            // v2.11.5 — On-screen popup'ta PCD.print toolbar flex item olarak
            // yer kaplar → body fixed height bozulur → footer table overlay.
            // Fix: screen'de height auto, print'te orient'a göre 210/297mm fix.
            '@media screen { body { height: auto !important; } }' +
            // v2.11.4 — Print path .kc-sheet height: auto → height: 100%.
            // Operatör raporu: popup window preview'unda recipe'ler üst yarıda
            // sıkışıyor, alt yarı boş. Sebep: height:auto ile sheet content-sized
            // büyür, column-fill: auto col'ları content height'e göre doldurur,
            // body remaining space'in alt yarısı boş kalır. Fix: sheet body flex
            // remaining'i kaplar (height:100%), column-fill: balance ile col'lar
            // eşit dağılır. Live preview ile print + PDF dialog tutarlı görünür.
            '.kc-sheet { flex: 1 1 0; min-height: 0; height: 100%; }' +
            '.pcd-print-footer { ' +
              'margin: 0 !important; padding: 1.5mm 4mm !important; ' +
              'border-top: none !important; flex: 0 0 auto; ' +
              'font-size: 7pt !important; line-height: 1.2 !important; ' +
            '}'
        ) +

        '.kc-sheet {' +
          'box-sizing: border-box;' +
          // v2.9.40 — Page padding 2mm → 1.5mm, column gap 2mm → 1.5mm.
          // Combined with card margin-bottom 2mm → 1mm above, gives more
          // usable canvas area so additional short cards fit on the same
          // page (operator: "alt boşluk verimli kullanılsın").
          // v2.11.4 — column-fill: auto → balance. Auto: kolonları sırayla
          // doldur, son kolon yarım kalır → alt boşluk. Balance: kolonları
          // eşit dağıt → recipe'ler sayfaya yayılır, boşluk minimize.
          // Live preview + popup window print + PDF dialog tutarlı olur.
          'padding: 1.5mm;' +
          'column-count: ' + opts.columns + ';' +
          'column-gap: 1.5mm;' +
          'column-fill: balance;' +
        '}' +

        '.kc-header {' +
          'column-span: all;' +
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
          '-webkit-column-break-inside: avoid;' + // v2.8.15 — keep card together within a column on legacy WebKit
          'border: 1.5px solid #16a34a;' +
          'border-radius: 3px;' +
          'background: #fff;' +
          'min-width: 0; min-height: 0;' +
          'display: flex; flex-direction: column;' +
          'overflow: hidden;' +
          'margin-bottom: 1mm;' +       // v2.9.40 — 2mm → 1mm (operator: less wasted bottom space, more cards fit)
          'border: ' + bw + 'pt solid #1f2937;' +  // v2.9.40 — toggleable border thickness
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
          'font-weight: ' + bdy + ';' +  // v2.9.40 — toggleable body text weight
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
          'font-weight: ' + bdy + ';' +  // v2.9.40 — same weight as ingredients
        '}' +
        // v2.8.10 — Each step is its own block so numbered steps stack
        // vertically (1. … 2. … 3. …) instead of flowing inline. The
        // text span uses white-space: pre-wrap so internal newlines the
        // chef types (e.g. "6 SPEED - 4 min" / "8 SPEED - 6 min") are
        // preserved on the printed card. page-break-inside: avoid keeps
        // a single step from being split across two A4 pages.
        '.kc-step {' +
          'display: flex;' +
          'align-items: baseline;' +
          'margin-top: 1.5mm;' +
          'page-break-inside: avoid;' +
        '}' +
        '.kc-step:first-child { margin-top: 0; }' +
        '.kc-step-num {' +
          'color: #16a34a;' +
          'font-weight: 800;' +
          'margin-inline-end: 4px;' +
          'flex-shrink: 0;' +
          'min-width: 10px;' +
          'font-variant-numeric: tabular-nums;' +
        '}' +
        '.kc-step-text {' +
          'flex: 1;' +
          'white-space: pre-wrap;' +
        '}' +

        '@media print {' +
          '* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }' +
          '.remove-btn { display: none !important; }' +
        '}' +
      '</style>' +
      (opts.shareMode ? '<div class="kc-page">' : '') +
      '<div class="kc-sheet">' +
        '<div class="kc-header">' +
          '<h1>' + PCD.escapeHtml(opts.title || 'Kitchen Reference') + '</h1>' +
          '<div class="meta">' + (opts.layoutRecipes || []).length + ' recipes · ' + new Date().toLocaleDateString() + '</div>' +
        '</div>' +
        blocksHtml +
      '</div>' +
      (opts.shareMode ? '</div>' : '')
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
      borderWidth: opts.borderWidth, bodyWeight: opts.bodyWeight,
      showMethod: opts.showMethod, showAmounts: opts.showAmounts,
      title: opts.title,
      interactive: false,
    });
    PCD.print(html, (PCD.i18n.t('kc_print_title') || 'Kitchen Cards') + ' — ' + layoutRecipes.length + ' ' + (PCD.i18n.t('kc_print_recipes_label') || 'recipes'));
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
  // v2.8.20 — onDelete(id) lets the caller learn which canvas was just
  // removed, so the editor can clear in-memory state when the deleted
  // canvas was the one currently loaded (otherwise it stays visible in
  // the editor until F5).
  function openCanvasPicker(onPick, onDelete) {
    const body = PCD.el('div');
    function paintList() {
      const list = (PCD.store.listTable('canvases') || []).slice();
      list.sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
      if (list.length === 0) {
        // v2.8.23 — Friendlier empty state with icon + i18n message
        // ("Kayıtlı kanvas bulunmamaktadır" in TR). Shown when the user
        // clicks Saved Canvases without having saved any yet.
        body.innerHTML =
          '<div style="padding:32px 20px;text-align:center;color:var(--text-3);">' +
            '<div style="font-size:32px;margin-bottom:8px;opacity:0.6;">📋</div>' +
            '<div style="font-size:14px;font-weight:600;color:var(--text-2);">' +
              PCD.escapeHtml(PCD.i18n.t('kc_no_saved_canvases')) +
            '</div>' +
          '</div>';
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

    const closeBtn = PCD.el('button', { type: 'button', class: 'btn btn-secondary', text: PCD.i18n.t('btn_close'), style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({ title: PCD.i18n.t('modal_saved_canvases_title'), body: body, footer: footer, size: 'sm', closable: true });
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
        title: PCD.i18n.t('modal_delete_canvas_title'),
        text: '"' + (cvs && cvs.name ? cvs.name : 'Canvas') + '" will be permanently removed.',
        okText: 'Delete'
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteFromTable('canvases', id);
        PCD.toast.success(PCD.i18n.t('toast_canvas_deleted'));
        paintList();
        if (typeof onDelete === 'function') onDelete(id);
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
    // v2.8.58 — Sub-recipe name resolve için recipeMap
    const recipeMap = {};
    PCD.store.listRecipes().forEach(function (rr) { recipeMap[rr.id] = rr; });

    const layoutResolved = (cvs.layout || []).map(function (item) {
      const r = item.recipeId ? PCD.store.getRecipe(item.recipeId) : null;
      if (!r) return null;
      const ingredients = (r.ingredients || []).map(function (ri) {
        // v2.8.52 — Separator satırı snapshot'a olduğu gibi geçer
        if (ri && ri.separator) {
          return { separator: true, label: ri.label || '' };
        }
        // v2.8.58 — Sub-recipe satırı: name'i recipeMap'ten al
        // (share.js snapshotRecipe ile aynı pattern).
        if (ri.recipeId) {
          const sub = recipeMap[ri.recipeId];
          return {
            name: sub ? sub.name : '(sub-recipe)',
            amount: ri.amount,
            unit: ri.unit || (sub && sub.yieldUnit) || 'portion',
          };
        }
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
      borderWidth: cvs.borderWidth || 'thin',
      bodyWeight: cvs.bodyWeight || 'normal',
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
      borderWidth: payload.borderWidth || 'thin',
      bodyWeight: payload.bodyWeight || 'normal',
      showMethod: payload.showMethod,
      showAmounts: payload.showAmounts,
      title: payload.name,
      interactive: false,
      // v2.8.20 — shareMode wraps the sheet in an A4-sized .kc-page
      // container instead of sizing the body. Share viewer body stays a
      // normal web page (toolbar + tip + sheet wrap), the sheet renders
      // at proper A4 dimensions with multi-column working from first
      // render (no "two-click to fix" issue from v2.8.18 print path).
      shareMode: true,
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
