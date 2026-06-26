/* ================================================================
   ProChefDesk — ingredients.js
   Ingredient management:
   - List with bulk select + delete (works on mobile)
   - Add/edit modal (category, unit, price, supplier)
   - Price history tracked automatically
   - CSV import
   - FIX: New ingredient visible in list immediately
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const ING_CATEGORIES = ['cat_meat', 'cat_poultry', 'cat_seafood', 'cat_dairy', 'cat_produce', 'cat_dry_goods', 'cat_spices', 'cat_oils', 'cat_beverages', 'cat_baking', 'cat_other'];
  const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'fl_oz', 'oz', 'lb', 'pcs', 'each', 'bottle', 'jar', 'bunch', 'package', 'unit'];

  let selectMode = false;
  let selectedIds = new Set();
  let groupMode = (function () { try { return localStorage.getItem('pcd_ing_group') || 'category'; } catch (e) { return 'category'; } })();

  // Eksik i18n anahtarı için İngilizce fallback (t() eksik anahtarda key string döndürür).
  function L(key, fb) { try { const v = PCD.i18n.t(key); return (v == null || v === key) ? fb : v; } catch (e) { return fb; } }

  // Tedarikçi listesi = malzemelerin .supplier alanından TÜRETİLİR (ayrı tablo yok →
  // otomatik senkron, sync/RLS gerektirmez). Boş olmayan benzersiz isimler, alfabetik.
  function distinctSuppliers() {
    const set = {};
    (PCD.store.listIngredients() || []).forEach(function (i) {
      const s = (i.supplier || '').trim();
      if (s) set[s] = true;
    });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b); });
  }

  // Tek kaynak: bir ingredient'e tedarikçi atandığında Suppliers aracında o tedarikçi
  // kaydı yoksa otomatik oluştur (isimle eşleşir). Böylece tedarikçi her yerde canlı.
  function ensureSupplierRecord(name) {
    name = (name || '').trim();
    if (!name) return;
    try {
      const exists = (PCD.store.listTable('suppliers') || []).some(function (s) {
        return (s.name || '').trim().toLowerCase() === name.toLowerCase();
      });
      if (!exists) PCD.store.upsertInTable('suppliers', { name: name, category: 'Other', products: [] }, 'sup');
    } catch (e) { /* suppliers tablosu yoksa sorun değil */ }
  }

  // Ortak tedarikçi seçici: mevcut tedarikçiler chip olarak + "yeni tedarikçi" alanı.
  // Edit modal'ı ve toplu atama modal'ı ikisi de kullanır. { get() } döndürür.
  function mountSupplierPicker(container, initial) {
    let selected = (initial || '').trim();
    const suppliers = distinctSuppliers();
    function chip(val, label) {
      const on = (val === selected);
      return '<button type="button" class="sup-chip" data-sup="' + PCD.escapeHtml(val) + '" style="padding:6px 12px;border-radius:999px;border:1px solid ' + (on ? 'var(--brand-600)' : 'var(--border)') + ';background:' + (on ? 'var(--brand-50)' : 'var(--surface)') + ';color:' + (on ? 'var(--brand-700)' : 'var(--text-2)') + ';font-weight:' + (on ? '700' : '500') + ';font-size:13px;cursor:pointer;">' + PCD.escapeHtml(label) + '</button>';
    }
    function paintPicker() {
      let html = '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">';
      html += chip('', L('sup_none', 'No supplier'));
      suppliers.forEach(function (s) { html += chip(s, s); });
      html += '<button type="button" class="sup-new-btn" style="padding:6px 12px;border-radius:999px;border:1px dashed var(--brand-600);background:transparent;color:var(--brand-700);font-weight:600;font-size:13px;cursor:pointer;">+ ' + PCD.escapeHtml(L('sup_new', 'New supplier')) + '</button>';
      html += '</div>';
      html += '<div class="sup-new-row" style="display:none;margin-top:8px;gap:6px;">' +
        '<input type="text" class="input sup-new-input" placeholder="' + PCD.escapeHtml(L('sup_new_ph', 'Supplier name')) + '" style="flex:1;">' +
        '<button type="button" class="btn btn-outline btn-sm sup-new-add">' + PCD.escapeHtml(L('add', 'Add')) + '</button></div>';
      container.innerHTML = html;
      container.querySelectorAll('.sup-chip').forEach(function (b) {
        b.addEventListener('click', function () { selected = b.getAttribute('data-sup'); paintPicker(); });
      });
      const newBtn = container.querySelector('.sup-new-btn');
      const newRow = container.querySelector('.sup-new-row');
      if (newBtn) newBtn.addEventListener('click', function () { newRow.style.display = 'flex'; const i = newRow.querySelector('.sup-new-input'); if (i) i.focus(); });
      const addBtn = container.querySelector('.sup-new-add');
      const inp = container.querySelector('.sup-new-input');
      function addNew() {
        const v = (inp.value || '').trim(); if (!v) return;
        if (suppliers.indexOf(v) < 0) { suppliers.push(v); suppliers.sort(function (a, b) { return a.localeCompare(b); }); }
        selected = v; paintPicker();
      }
      if (addBtn) addBtn.addEventListener('click', addNew);
      if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addNew(); } });
    }
    paintPicker();
    return { get: function () { return selected; } };
  }

  // Toplu tedarikçi atama: seçili malzemelere tek seferde tedarikçi ata (mevcut veya yeni).
  function openBulkSupplierAssign(ids, onDone) {
    const t = PCD.i18n.t;
    const body = PCD.el('div');
    body.innerHTML = '<div class="text-muted text-sm" style="margin-bottom:10px;">' + PCD.escapeHtml(L('sup_assign_n', 'Assign a supplier to {n} ingredient(s).').replace('{n}', ids.length)) + '</div><div id="bulkSupPicker"></div>';
    const picker = mountSupplierPicker(body.querySelector('#bulkSupPicker'), '');
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn); footer.appendChild(saveBtn);
    const m = PCD.modal.open({ title: L('sup_pick_title', 'Assign supplier'), body: body, footer: footer, size: 'sm', closable: true });
    cancelBtn.addEventListener('click', function () { m.close(); });
    saveBtn.addEventListener('click', function () {
      if (PCD.gate && !PCD.gate.requireAuth()) return;
      const sup = (picker.get() || '').trim();
      let n = 0;
      ids.forEach(function (id) { const ing = PCD.store.getIngredient(id); if (ing) { ing.supplier = sup; PCD.store.upsertIngredient(ing); n++; } });
      if (sup) ensureSupplierRecord(sup);
      PCD.toast.success(L('sup_assign_done', 'Supplier assigned to {n} ingredient(s).').replace('{n}', n));
      m.close();
      if (onDone) onDone();
    });
  }

  function renderList(view) {
    const t = PCD.i18n.t;
    // Navigasyonda select modu açık kalmasın (recipes.js ile aynı düzeltme):
    // selectMode/selectedIds modül-seviyesi → tool remount'unda sıfırla.
    selectMode = false;
    selectedIds = new Set();
    const ings = PCD.store.listIngredients().sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });
    // v2.44.79 — Tedarikçisiz malzeme sayısı (butonda kırmızı bildirim rozeti). "Not
    // purchased" işaretli (su/buz gibi satın alınmayan) malzemeler bu sayıma DAHİL DEĞİL.
    const noSupCount = ings.filter(function (i) { return !(i.supplier || '').trim() && !i.noSupplierNeeded; }).length;

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('ingredients_title')}</div>
          <div class="page-subtitle">${ings.length} items</div>
        </div>
        <div class="page-header-actions">
          ${ings.length > 0 ? `<button class="btn btn-outline btn-sm" id="assignSupBtn" title="${PCD.escapeHtml(L('assign_supplier','Assign supplier'))}" style="position:relative;${noSupCount > 0 ? 'border-color:var(--warning);background:#fff7ed;color:#b45309;font-weight:700;' : ''}">${PCD.icon('truck',14)} ${PCD.escapeHtml(L('assign_supplier','Assign supplier'))}${noSupCount > 0 ? `<span style="position:absolute;top:-7px;right:-8px;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:var(--danger);color:#fff;font-size:11px;font-weight:800;line-height:19px;text-align:center;box-shadow:0 0 0 2px var(--bg);">${noSupCount}</span>` : ''}</button>` : ''}
          ${ings.length > 0 ? `<button class="btn btn-outline btn-sm" id="toggleSelIng">${PCD.icon('check-square',14)} ${t('select_mode')}</button>` : ''}
          <button class="btn btn-outline btn-sm" id="importBtn" title="${t('ingredients_import_title') || 'Bulk import'}">${PCD.icon('upload',14)} ${t('ingredients_import') || 'Import'}</button>
          ${ings.length > 0 ? `<button class="btn btn-outline btn-sm" id="exportBtn" title="${PCD.escapeHtml(t('ingredients_export_title') || 'Export to CSV / Excel for bulk edit or backup')}">${PCD.icon('download',14)} ${PCD.escapeHtml(t('ingredients_export') || 'Export')}</button>` : ''}
          <button class="btn btn-primary" id="newIngBtn">${PCD.icon('plus',14)} ${t('new_ingredient')}</button>
        </div>
      </div>

      ${PCD.guideCard('ingredients', t('ing_g_t'), [t('ing_g1'), t('ing_g2'), t('ing_g3')])}
      <div class="searchbar mb-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35" stroke-linecap="round"/></svg>
        <input type="search" id="ingSearch" placeholder="${t('search_ingredients_placeholder')}" autocomplete="off">
      </div>

      ${ings.length > 0 ? `<div class="ing-groupbar" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
        <span class="text-muted" style="font-size:12px;font-weight:600;">${PCD.escapeHtml(L('group_by','Group by'))}:</span>
        <button class="btn btn-sm gb-btn" data-group="category">${PCD.escapeHtml(L('group_category','Category'))}</button>
        <button class="btn btn-sm gb-btn" data-group="supplier">${PCD.escapeHtml(L('group_supplier','Supplier'))}</button>
        <button class="btn btn-sm gb-btn" data-group="name">${PCD.escapeHtml(L('group_name','Name'))}</button>
      </div>` : ''}

      <div id="bulkBarI" class="card" style="display:none;padding:10px 12px;margin-bottom:12px;background:var(--brand-50);border-color:var(--brand-300);position:sticky;top:0;z-index:5;">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <label class="checkbox" style="min-height:auto;"><input type="checkbox" id="selAllI"><span class="text-sm font-semibold"><span id="selCountI">0</span> ${t('selected')}</span></label>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-outline btn-sm" id="bulkAssignSupI">${PCD.icon('truck',14)} ${PCD.escapeHtml(L('assign_supplier','Assign supplier'))}</button>
            <button class="btn btn-outline btn-sm" id="bulkConfirmPriceI">${PCD.icon('check',14)} ${t('bulk_confirm_price')}</button>
            <button class="btn btn-danger btn-sm" id="bulkDeleteI">${PCD.icon('trash',14)} ${t('delete')}</button>
            <button class="btn btn-ghost btn-sm" id="exitSelectI">${t('cancel')}</button>
          </div>
        </div>
      </div>

      <div id="ingListView"></div>
    `;

    const listEl = PCD.$('#ingListView', view);
    let filter = '';
    // v2.44 — arrived from the dashboard "price freshness" donut → show only ingredients
    // whose price is aging (>30 days) so the chef can find + refresh stale prices.
    let agingFilter = (function () { try { if (sessionStorage.getItem('pcd_ing_aging') === '1') { sessionStorage.removeItem('pcd_ing_aging'); return true; } } catch (e) {} return false; })();
    function priceAgeDays(i) {
      if (!i.pricePerUnit || i.pricePerUnit <= 0) return null;
      const ts = i.updatedAt ? new Date(i.updatedAt).getTime() : 0;
      return ts ? Math.floor((Date.now() - ts) / 86400000) : null;
    }

    function paint() {
      PCD.clear(listEl);
      let visible = ings;
      if (agingFilter) visible = visible.filter(function (i) { const a = priceAgeDays(i); return a != null && a > 30; });
      if (filter) {
        const q = filter.toLowerCase();
        visible = visible.filter(function (i) { return (i.name || '').toLowerCase().indexOf(q) >= 0 || (i.supplier || '').toLowerCase().indexOf(q) >= 0; });
      }
      if (visible.length === 0 && !filter && !agingFilter) {
        listEl.innerHTML = `
          <div class="empty">
            <div class="empty-icon">🥕</div>
            <div class="empty-title">${t('no_ingredients_yet')}</div>
            <div class="empty-desc">${t('no_ingredients_yet_desc')}</div>
            <div class="empty-action"><button class="btn btn-primary" id="emptyNewIng">+ ${t('new_ingredient')}</button></div>
          </div>
        `;
        const btn = PCD.$('#emptyNewIng', listEl);
        if (btn) btn.addEventListener('click', function () { openEditor(); });
        return;
      }
      if (agingFilter) {
        const banner = PCD.el('div', { class: 'card', style: { padding: '10px 12px', marginBottom: '10px', background: 'var(--brand-50)', borderColor: 'var(--brand-300)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' } });
        banner.innerHTML = '<span class="text-sm" style="font-weight:600;">' + PCD.icon('clock', 13) + ' ' + PCD.escapeHtml(t('fresh_aging_n').replace('{n}', visible.length)) + '</span>' +
          '<button class="btn btn-ghost btn-sm" id="ingShowAll">' + PCD.escapeHtml(t('view_all') || 'Show all') + '</button>';
        listEl.appendChild(banner);
        const sa = PCD.$('#ingShowAll', banner); if (sa) sa.addEventListener('click', function () { agingFilter = false; paint(); });
      }
      if (visible.length === 0) {
        const e = PCD.el('div', { class: 'empty', style: { padding: '24px 0' } });
        e.innerHTML = '<div class="empty-desc">' + (agingFilter ? PCD.escapeHtml(t('fresh_all_fresh') || '✓ All prices are up to date') : 'No results') + '</div>';
        listEl.appendChild(e);
        return;
      }

      // Ortak satır yapıcı — tüm gruplama modları (kategori/tedarikçi/isim) kullanır.
      function ingRow(i) {
        const row = PCD.el('div', { class: 'list-item', 'data-iid': i.id });
        const thumb = PCD.el('div', { class: 'list-item-thumb' });
        thumb.textContent = (i.name || '?').charAt(0).toUpperCase();
        const bodyDiv = PCD.el('div', { class: 'list-item-body' });
        const hist = (i.priceHistory || []).slice();
        let trendHtml = '';
        if (hist.length >= 1) {
          const last = hist[hist.length - 1];
          const cur = Number(i.pricePerUnit) || 0;
          const prev = Number(last.price) || 0;
          if (prev && cur && prev !== cur) {
            const up = cur > prev;
            trendHtml = '<span data-hist="' + i.id + '" style="color:' + (up ? 'var(--danger)' : 'var(--success)') + ';font-weight:700;cursor:pointer;font-size:11px;" title="' + PCD.escapeHtml(t('price_history_tooltip')) + '">' +
              (up ? '▲' : '▼') + ' ' + Math.abs(((cur - prev) / prev) * 100).toFixed(0) + '%</span>';
          }
        }
        let ageHtml = '';
        const _pa = priceAgeDays(i);
        if (_pa != null && _pa > 30) {
          ageHtml = '<span style="color:' + (_pa > 60 ? 'var(--danger)' : 'var(--warning)') + ';font-weight:600;font-size:11px;white-space:nowrap;">' + PCD.icon('clock', 11) + ' ' + PCD.escapeHtml(t('fresh_last_priced').replace('{n}', _pa)) + '</span>';
        }
        // Tedarikçi durum işareti — tedarikçi modunda başlıkta zaten var, satırda gizle.
        // Tedarikçili → yeşil ✓ (ad) · tedarikçisiz → amber ⚠ (her zaman görünür hatırlatıcı).
        const supBadge = (groupMode === 'supplier') ? '' :
          ((i.supplier || '').trim()
            ? '<span style="display:inline-flex;align-items:center;gap:3px;color:var(--success);font-weight:600;">' + PCD.icon('check', 11) + PCD.escapeHtml(i.supplier) + '</span>'
            : '<span style="display:inline-flex;align-items:center;gap:3px;color:var(--warning);font-weight:700;">⚠ ' + PCD.escapeHtml(L('sup_none', 'No supplier')) + '</span>');
        bodyDiv.innerHTML =
          '<div class="list-item-title">' + PCD.escapeHtml(i.name) + '</div>' +
          '<div class="list-item-meta">' +
            '<span>' + PCD.fmtMoney(i.pricePerUnit) + ' / ' + i.unit + '</span>' +
            (trendHtml ? '<span>·</span>' + trendHtml : '') +
            (ageHtml ? '<span>·</span>' + ageHtml : '') +
            (supBadge ? '<span>·</span>' + supBadge : '') +
          '</div>';
        row.appendChild(thumb);
        row.appendChild(bodyDiv);
        if (selectMode) {
          const cb = PCD.el('input', { type: 'checkbox', class: 'select-cb-i' });
          cb.style.width = '20px'; cb.style.height = '20px'; cb.style.flexShrink = '0';
          cb.checked = selectedIds.has(i.id);
          cb.addEventListener('click', function (e) { e.stopPropagation(); });
          cb.addEventListener('change', function () {
            if (cb.checked) selectedIds.add(i.id); else selectedIds.delete(i.id);
            updateBulkBar();
          });
          row.insertBefore(cb, row.firstChild);
        }
        return row;
      }

      function section(label) {
        const sec = PCD.el('div', { class: 'section' });
        sec.appendChild(PCD.el('div', {
          class: 'section-title',
          style: { fontSize: '13px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' },
          text: label
        }));
        const inner = PCD.el('div', { class: 'flex flex-col gap-2' });
        sec.appendChild(inner);
        return { sec: sec, inner: inner };
      }

      if (groupMode === 'name') {
        // Düz alfabetik liste, başlıksız
        const inner = PCD.el('div', { class: 'flex flex-col gap-2' });
        visible.slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); }).forEach(function (i) { inner.appendChild(ingRow(i)); });
        listEl.appendChild(inner);
      } else {
        const groups = {};
        visible.forEach(function (i) {
          let key, label;
          if (groupMode === 'supplier') {
            const s = (i.supplier || '').trim();
            key = s ? ('s:' + s) : '￿'; // tedarikçisizler '￿' → en sona
            label = s || L('sup_none', 'No supplier');
          } else {
            key = i.category || 'cat_other';
            label = t(key);
          }
          if (!groups[key]) groups[key] = { label: label, items: [] };
          groups[key].items.push(i);
        });
        let keys = Object.keys(groups);
        if (groupMode === 'supplier') keys.sort(function (a, b) { return a.localeCompare(b); });
        else keys.sort(function (a, b) { return ING_CATEGORIES.indexOf(a) - ING_CATEGORIES.indexOf(b); });
        keys.forEach(function (key) {
          const g = groups[key];
          const sx = section(g.label);
          g.items.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
          g.items.forEach(function (i) { sx.inner.appendChild(ingRow(i)); });
          listEl.appendChild(sx.sec);
        });
      }
    }

    function updateBulkBar() {
      const bar = PCD.$('#bulkBarI', view);
      if (!bar) return;
      bar.style.display = selectMode ? '' : 'none';
      PCD.$('#selCountI', view).textContent = selectedIds.size;
    }

    function enterSelect() { selectMode = true; selectedIds = new Set(); paint(); updateBulkBar(); }
    function exitSelect() { selectMode = false; selectedIds = new Set(); paint(); updateBulkBar(); }

    PCD.$('#newIngBtn', view).addEventListener('click', function () { openEditor(); });

    // Gruplama modu çubuğu (Kategori / Tedarikçi / İsim)
    function paintGroupBar() {
      PCD.$$('.gb-btn', view).forEach(function (b) {
        const on = b.getAttribute('data-group') === groupMode;
        b.className = 'btn btn-sm gb-btn ' + (on ? 'btn-primary' : 'btn-outline');
      });
    }
    PCD.$$('.gb-btn', view).forEach(function (b) {
      b.addEventListener('click', function () {
        groupMode = b.getAttribute('data-group');
        try { localStorage.setItem('pcd_ing_group', groupMode); } catch (e) {}
        paintGroupBar(); paint();
      });
    });
    paintGroupBar();

    // "Tedarikçi ata" (header) → seç moduna gir, ipucu göster.
    const assignSupBtn = PCD.$('#assignSupBtn', view);
    if (assignSupBtn) assignSupBtn.addEventListener('click', function () {
      if (!selectMode) enterSelect();
      if (PCD.toast) PCD.toast.info(L('sup_assign_hint', 'Select ingredients, then tap Assign supplier.'));
    });
    // Bulk bar "Tedarikçi ata" → seçili malzemelere ata.
    const bulkAssignSup = PCD.$('#bulkAssignSupI', view);
    if (bulkAssignSup) bulkAssignSup.addEventListener('click', function () {
      if (selectedIds.size === 0) { PCD.toast.info(L('sup_select_first', 'Select at least one ingredient first.')); return; }
      openBulkSupplierAssign(Array.from(selectedIds), function () {
        selectedIds = new Set(); selectMode = false;
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'ingredients') renderList(v);
      });
    });

    const importBtn = PCD.$('#importBtn', view);
    if (importBtn) importBtn.addEventListener('click', function () { openImportDialog(); });
    // v2.9.20 — Export current list (CSV + Excel) for bulk edit / backup workflow
    const exportBtn = PCD.$('#exportBtn', view);
    if (exportBtn) exportBtn.addEventListener('click', function () { openExportDialog(); });
    const togSel = PCD.$('#toggleSelIng', view);
    if (togSel) togSel.addEventListener('click', enterSelect);
    PCD.$('#exitSelectI', view).addEventListener('click', exitSelect);
    PCD.$('#selAllI', view).addEventListener('change', function () {
      const visible = ings.filter(function (i) { return !filter || (i.name || '').toLowerCase().indexOf(filter.toLowerCase()) >= 0; });
      if (this.checked) visible.forEach(function (i) { selectedIds.add(i.id); });
      else selectedIds.clear();
      paint();
      updateBulkBar();
    });
    PCD.$('#bulkDeleteI', view).addEventListener('click', function () {
      if (selectedIds.size === 0) return;
      if (PCD.gate && !PCD.gate.requireAuth()) return;
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: PCD.i18n.t('confirm_delete_n').replace('{n}', selectedIds.size),
        text: PCD.i18n.t('confirm_delete_desc'),
        okText: PCD.i18n.t('delete')
      }).then(function (ok) {
        if (!ok) return;
        // v2.6.36: split selection into "safe to delete" vs "in use".
        // Ingredients that are referenced by any recipe stay alive so
        // recipes don't end up with broken "(removed)" lines.
        const ingMap = currentIngMap();
        const safeIds = [];
        const blocked = []; // { name, recipes: [...] }
        Array.from(selectedIds).forEach(function (id) {
          const usedIn = (PCD.store.findRecipesUsingIngredient && PCD.store.findRecipesUsingIngredient(id)) || [];
          if (usedIn.length === 0) {
            safeIds.push(id);
          } else {
            const ing = ingMap[id];
            blocked.push({ name: (ing && ing.name) || '?', recipes: usedIn });
          }
        });

        let deletedCount = 0;
        if (safeIds.length > 0) {
          deletedCount = PCD.store.deleteIngredients(safeIds);
        }

        // Result feedback
        if (blocked.length === 0) {
          // Pure success
          PCD.toast.success(PCD.i18n.t('items_deleted').replace('{n}', deletedCount));
        } else {
          // Mixed or all-blocked — show explanatory modal
          showBulkDeleteResult(deletedCount, blocked);
        }

        selectedIds = new Set(); selectMode = false;
        renderList(view);
      });
    });

    // v2.44 — Bulk "Confirm prices": chef re-confirms that the selected prices are
    // still current. Price value is untouched — upsertIngredient only bumps updatedAt
    // (and adds NO history entry because the price is unchanged), which clears the
    // "priced Nd ago" aging badge. Flow: filter aging → select all → Confirm prices.
    PCD.$('#bulkConfirmPriceI', view).addEventListener('click', function () {
      if (selectedIds.size === 0) return;
      if (PCD.gate && !PCD.gate.requireAuth()) return;
      let n = 0;
      Array.from(selectedIds).forEach(function (id) {
        const ing = PCD.store.getIngredient(id);
        if (ing) { PCD.store.upsertIngredient(Object.assign({}, ing)); n++; }
      });
      PCD.toast.success(PCD.i18n.t('prices_confirmed').replace('{n}', n));
      selectedIds = new Set(); selectMode = false;
      renderList(view);
    });

    PCD.$('#ingSearch', view).addEventListener('input', PCD.debounce(function (e) {
      filter = e.target.value;
      paint();
    }, 150));

    PCD.on(listEl, 'click', '[data-hist]', function (e) {
      e.stopPropagation();
      openPriceHistory(this.getAttribute('data-hist'));
    });

    PCD.on(listEl, 'click', '[data-iid]', function (e) {
      if (e.target.closest('.select-cb-i')) return;
      if (e.target.closest('[data-hist]')) return;
      if (selectMode) {
        const cb = this.querySelector('.select-cb-i');
        if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        return;
      }
      openEditor(this.getAttribute('data-iid'));
    });

    paint();
  }

  function openPriceHistory(iid) {
    const ing = PCD.store.getIngredient(iid);
    if (!ing) return;
    const hist = (ing.priceHistory || []).slice();
    // Prepend current price as "now"
    const now = { at: ing.updatedAt || new Date().toISOString(), price: ing.pricePerUnit, current: true };
    const series = hist.concat([now]).slice(-10);

    const body = PCD.el('div');
    if (series.length < 2) {
      body.innerHTML = '<div class="empty"><div class="empty-desc">No price history yet. Price changes will be tracked automatically.</div></div>';
    } else {
      // Simple SVG line chart
      const W = 540, H = 160, pad = 24;
      const prices = series.map(function (s) { return s.price || 0; });
      const min = Math.min.apply(null, prices);
      const max = Math.max.apply(null, prices);
      const range = max - min || 1;
      const step = (W - pad * 2) / (series.length - 1);
      let path = '';
      let dots = '';
      series.forEach(function (s, i) {
        const x = pad + i * step;
        const y = H - pad - ((s.price - min) / range) * (H - pad * 2);
        path += (i === 0 ? 'M' : ' L') + x.toFixed(1) + ',' + y.toFixed(1);
        dots += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3" fill="var(--brand-600)"/>';
      });
      const rows = series.slice().reverse().map(function (s, idx) {
        const realIdx = series.length - 1 - idx;
        const prev = realIdx > 0 ? series[realIdx - 1].price : null;
        const change = prev !== null ? s.price - prev : 0;
        const up = change > 0;
        const color = change === 0 ? 'var(--text-3)' : (up ? 'var(--danger)' : 'var(--success)');
        const arrow = change === 0 ? '—' : (up ? '▲' : '▼');
        const d = new Date(s.at);
        return '<tr><td style="padding:6px 10px;font-size:12px;color:var(--text-3);">' + PCD.fmtDate(d, {month:'short',day:'numeric',year:'numeric'}) + '</td>' +
          '<td style="padding:6px 10px;font-family:var(--font-mono);font-weight:600;">' + PCD.fmtMoney(s.price) + '/' + ing.unit + '</td>' +
          '<td style="padding:6px 10px;color:' + color + ';font-weight:600;font-size:12px;">' + arrow + (change !== 0 ? ' ' + PCD.fmtMoney(Math.abs(change)) : '') + '</td></tr>';
      }).join('');
      body.innerHTML =
        '<div style="padding:8px 0;margin-bottom:12px;">' +
          '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;">' +
            '<path d="' + path + '" fill="none" stroke="var(--brand-600)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            dots +
          '</svg>' +
        '</div>' +
        '<table style="width:100%;border-collapse:collapse;border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;">' +
          '<thead><tr><th style="text-align:left;padding:6px 10px;font-size:10px;color:var(--text-3);background:var(--surface-2);border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:0.04em;">Date</th>' +
          '<th style="text-align:left;padding:6px 10px;font-size:10px;color:var(--text-3);background:var(--surface-2);border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:0.04em;">Price</th>' +
          '<th style="text-align:left;padding:6px 10px;font-size:10px;color:var(--text-3);background:var(--surface-2);border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:0.04em;">Change</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>';
    }

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('btn_close') });
    const footer = PCD.el('div', { style: { display: 'flex', width: '100%' } });
    footer.appendChild(closeBtn);
    const m = PCD.modal.open({
      title: ing.name + ' — Price History',
      body: body, footer: footer, size: 'md', closable: true
    });
    closeBtn.addEventListener('click', function () { m.close(); });
  }

  function openEditor(iid, callback, opts) {
    const t = PCD.i18n.t;
    const existing = iid ? PCD.store.getIngredient(iid) : null;
    // Misafir yeni oluşturamaz → giriş duvarı (mevcut kaydı görüntüleme açık).
    if (!existing && PCD.gate && !PCD.gate.requireAuth()) return;
    // v2.17 — Free plan malzeme limiti. Merkezi gate + yumuşak duvar.
    if (!existing && PCD.gate && !PCD.gate.canCreateIngredient(PCD.store.listIngredients().length)) {
      const limit = PCD.gate.limits().maxIngredients;
      PCD.gate.showUpgradeModal({
        feature: 'ingredients',
        message: t('ingredient_limit_reached').replace('{n}', limit),
      });
      return;
    }
    const data = existing ? PCD.clone(existing) : {
      name: (opts && opts.initialName) || '',
      unit: 'g', pricePerUnit: 0, supplier: '', category: 'cat_other'
    };

    const body = PCD.el('div');
    body.innerHTML = `
      <div class="field">
        <label class="field-label">${t('ingredient_name')} *</label>
        <input type="text" class="input" id="ingName" value="${PCD.escapeHtml(data.name || '')}" placeholder="${t('ingredient_name_placeholder')}">
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">${t('ingredient_category')}</label>
          <select class="select" id="ingCategory">
            ${ING_CATEGORIES.map(function (c) { return '<option value="' + c + '"' + (data.category === c ? ' selected' : '') + '>' + t(c) + '</option>'; }).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field-label">${t('ingredient_unit')}</label>
          <select class="select" id="ingUnit">
            ${UNITS.map(function (u) { return '<option value="' + u + '"' + (data.unit === u ? ' selected' : '') + '>' + u + '</option>'; }).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label class="field-label">${t('ingredient_price')}</label>
        <div class="input-group">
          <span class="input-group-addon" id="priceSymbol">$</span>
          <input type="number" class="input" id="ingPrice" value="${data.pricePerUnit || 0}" step="0.001" min="0">
          <span class="input-group-addon">/ <span id="unitSymbol">${data.unit}</span></span>
        </div>
        <div class="field-hint">${t('price_per_unit').replace('{unit}', data.unit)}</div>
      </div>
      <div class="field">
        <label class="field-label">${t('ingredient_supplier')}</label>
        <div id="ingSupplierPicker"></div>
      </div>
      <div class="field">
        <label class="field-label">${t('ing_yield_label')}</label>
        <div class="input-group">
          <input type="number" class="input" id="ingYield" value="${data.yieldPercent || ''}" step="1" min="1" max="100" placeholder="100">
          <span class="input-group-addon">%</span>
        </div>
        <div class="field-hint">${t('ing_yield_hint')}</div>
        ${data.pricePerUnit && data.yieldPercent && data.yieldPercent < 100 ? `
          <div class="text-sm mt-2" style="padding:8px 10px;background:var(--brand-50);border-radius:var(--r-sm);color:var(--brand-700);font-weight:600;">
            ${t('ing_true_cost')}: ${PCD.fmtMoney((data.pricePerUnit / (data.yieldPercent / 100)))} / ${data.unit}
          </div>
        ` : ''}
      </div>

${existing && existing.priceHistory && existing.priceHistory.length > 0 ? `
        <div class="section">
          <div class="section-title" style="font-size:14px;color:var(--text-3);margin-bottom:6px;">${t('price_history')}</div>
          <div style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r-md);padding:8px;">
            ${existing.priceHistory.slice(-10).reverse().map(function (h) {
              return '<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px dashed var(--border);"><span class="text-muted">' + PCD.fmtDate(h.at) + '</span><span>' + PCD.fmtMoney(h.price) + '</span></div>';
            }).join('')}
          </div>
        </div>
      ` : ''}
${existing ? (function () {
        var used = (PCD.store.findRecipesUsingIngredientRefs && PCD.store.findRecipesUsingIngredientRefs(existing.id)) || [];
        if (!used.length) return '';
        // A3 — show each affected recipe's food cost % (price-change impact awareness)
        var ingMapFc = {}; (PCD.store.listIngredients() || []).forEach(function (g) { ingMapFc[g.id] = g; });
        var recipeMapFc = (PCD.recipes && PCD.recipes.buildRecipeMap) ? PCD.recipes.buildRecipeMap() : {};
        function fcPct(rid) {
          var rc = PCD.store.getRecipe(rid);
          if (!rc || !PCD.recipes || !PCD.recipes.computeFoodCost) return null;
          var cost = PCD.recipes.computeFoodCost(rc, ingMapFc, recipeMapFc);
          var cps = rc.servings ? cost / rc.servings : cost;
          return (rc.salePrice && cost > 0 && rc.servings) ? (cps / rc.salePrice) * 100 : null;
        }
        var title = (t('ing_used_in_n') || 'Used in {n} recipes').replace('{n}', used.length).replace(/:$/, '');
        return '<div class="section"><div class="section-title" style="font-size:14px;color:var(--text-3);margin-bottom:6px;">' + PCD.escapeHtml(title) + '</div><div style="display:flex;flex-wrap:wrap;gap:6px;">' +
          used.map(function (r) { var p = fcPct(r.id); var pctTxt = (p != null) ? ' <span style="opacity:.7;">· ' + p.toFixed(0) + '%</span>' : ''; return '<button type="button" data-go-recipe="' + r.id + '" style="background:var(--brand-50);color:var(--brand-700);font-size:12px;padding:4px 10px;border-radius:999px;font-weight:600;cursor:pointer;border:1px solid var(--brand-200);">' + PCD.escapeHtml(r.name) + pctTxt + ' ›</button>'; }).join('') +
          '</div></div>';
      })() : ''}
    `;

// Update symbol on unit change
    PCD.$('#ingUnit', body).addEventListener('change', function () {
      PCD.$('#unitSymbol', body).textContent = this.value;
    });
    // Currency symbol
    const curCode = PCD.store.get('prefs.currency') || 'USD';
    const curCfg = (window.PCD_CONFIG.CURRENCIES || []).find(function (c) { return c.code === curCode; });
    PCD.$('#priceSymbol', body).textContent = curCfg ? curCfg.symbol : '$';
    const supPicker = mountSupplierPicker(PCD.$('#ingSupplierPicker', body), data.supplier);

    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    let deleteBtn = null;
    if (existing) {
      deleteBtn = PCD.el('button', { class: 'btn btn-ghost', text: t('delete'), style: { color: 'var(--danger)' } });
    }
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    if (deleteBtn) footer.appendChild(deleteBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? t('edit') + ' · ' + existing.name : t('new_ingredient'),
      body: body,
      footer: footer,
      size: 'md',
      closable: true,
    });

    cancelBtn.addEventListener('click', function () { m.close(); if (callback) callback(null); });

    // E1 — "used in" chip → close modal + open that recipe (lazy-load safe poll)
    body.querySelectorAll('[data-go-recipe]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var rid = this.getAttribute('data-go-recipe');
        m.close();
        PCD.router.go('recipes');
        if (PCD.tools.recipes && PCD.tools.recipes.openEditor) { PCD.tools.recipes.openEditor(rid); return; }
        var att = 0;
        var tr = setInterval(function () {
          if (PCD.tools.recipes && PCD.tools.recipes.openEditor) { clearInterval(tr); PCD.tools.recipes.openEditor(rid); }
          else if (++att > 25) { clearInterval(tr); }
        }, 120);
      });
    });

    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      // v2.6.36: block deletion if ingredient is used in any recipe.
      // Prevents recipes from showing "(removed)" lines and silent
      // cost-calculation breakage.
      const usedIn = (PCD.store.findRecipesUsingIngredient && PCD.store.findRecipesUsingIngredient(existing.id)) || [];
      if (usedIn.length > 0) {
        const previewList = usedIn.slice(0, 5);
        const more = usedIn.length - previewList.length;
        let listText = '• ' + previewList.join('\n• ');
        if (more > 0) listText += '\n• … +' + more;
        PCD.modal.confirm({
          icon: '⚠', iconKind: 'warning',
          title: t('ing_cannot_delete') || 'Silinemez',
          text: (t('ing_used_in_n') || 'Bu malzeme {n} tarifte kullanılıyor:').replace('{n}', usedIn.length) + '\n\n' +
                listText + '\n\n' +
                (t('ing_remove_first') || 'Önce bu tariflerden çıkar, sonra tekrar dene.'),
          okText: t('ok') || 'Tamam',
          cancelText: null,
        });
        return;
      }
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('confirm_delete'), text: t('confirm_delete_desc'),
        okText: t('delete')
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteIngredient(existing.id);
        PCD.toast.success(t('item_deleted'));
        m.close();
        const view = PCD.$('#view');
        if (PCD.router.currentView() === 'ingredients') renderList(view);
      });
    });
    saveBtn.addEventListener('click', function () {
      if (PCD.gate && !PCD.gate.requireAuth()) return;
      data.name = PCD.$('#ingName', body).value.trim();
      data.category = PCD.$('#ingCategory', body).value;
      data.unit = PCD.$('#ingUnit', body).value;
      data.pricePerUnit = parseFloat(PCD.$('#ingPrice', body).value) || 0;
      data.supplier = (supPicker.get() || '').trim();
      const yld = PCD.$('#ingYield', body);
      if (yld) {
        const v = parseFloat(yld.value);
        data.yieldPercent = (!isNaN(v) && v > 0 && v <= 100) ? v : null;
      }

      if (!data.name) {
        PCD.toast.error(t('ingredient_name') + ' ' + t('required'));
        return;
      }

      if (existing) data.id = existing.id;
      const saved = PCD.store.upsertIngredient(data);
      if (data.supplier) ensureSupplierRecord(data.supplier);
      PCD.toast.success(t('ingredient_saved'));
      m.close();
      // FIX: Force re-render so new item appears immediately
      setTimeout(function () {
        const view = PCD.$('#view');
        if (PCD.router.currentView() === 'ingredients') renderList(view);
        if (callback) callback(saved);
      }, 250);
    });
  }

  // ============ BULK IMPORT ============
  // v2.9.20 — Export current ingredient list (CSV + Excel)
  // Round-trip compatible with import format: Name,Price,Unit,Category,Supplier,Yield%
  // Use case: bulk price update (export → edit in Excel → re-import as updates)
  function buildExportRows() {
    const rows = [['Name', 'Price', 'Unit', 'Category', 'Supplier', 'Yield%']];
    PCD.store.listIngredients().slice().sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '');
    }).forEach(function (ing) {
      rows.push([
        ing.name || '',
        Number(ing.pricePerUnit) || 0,
        ing.unit || '',
        ing.category || '',
        ing.supplier || '',
        ing.yieldPercent != null ? Number(ing.yieldPercent) : '',
      ]);
    });
    return rows;
  }
  function downloadCsvFromRows(rows, filename) {
    // CSV escape: any cell with comma, quote or newline gets wrapped in quotes
    // with inner quotes doubled. Standard RFC 4180 behavior.
    const csv = rows.map(function (row) {
      return row.map(function (cell) {
        const s = String(cell == null ? '' : cell);
        if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(',');
    }).join('\n');
    // BOM for Excel UTF-8 compat (Turkish characters render correctly)
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
  function downloadXlsxFromRows(rows, filename) {
    if (!window.XLSX || !window.XLSX.utils || !PCD.xlsx) {
      PCD.toast.error(PCD.i18n.t('toast_excel_parser_unavailable'));
      return;
    }
    // v2.14.2 — Ortak styled-Excel motoru: kalın yeşil başlık + çerçeve + alt-satır gölgesi.
    const data = rows.slice(1); // rows[0] = header
    PCD.xlsx.save(window.XLSX, [{
      name: 'Ingredients',
      title: 'ProChefDesk — Ingredient List',
      subtitle: data.length + ' items · ' + todayIsoForFilename(),
      headers: rows[0],
      rows: data,
      align: ['left', 'right', 'left', 'left', 'left', 'right'], // Name,Price,Unit,Category,Supplier,Yield%
      widths: [30, 12, 10, 18, 22, 10],
    }], filename);
  }
  // v2.14.2 — Profesyonel Excel template: düzgün sütunlar + örnek satırlar +
  // 2. sayfada "Lists" (geçerli Unit + Category değerleri). Şef hücre hücre
  // doldurur, virgül yok. CSV template'in modern karşılığı.
  function downloadXlsxTemplate() {
    const t = PCD.i18n.t;
    const go = function (XLSX) {
      if (!XLSX || !XLSX.utils || !PCD.xlsx) { PCD.toast.error(t('toast_excel_parser_unavailable')); return; }
      const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'fl_oz', 'oz', 'lb', 'pcs', 'each', 'bottle', 'jar', 'bunch', 'package', 'unit'];
      const CATS = ['cat_meat', 'cat_poultry', 'cat_seafood', 'cat_dairy', 'cat_produce', 'cat_dry_goods', 'cat_spices', 'cat_oils', 'cat_beverages', 'cat_baking', 'cat_other'];
      const listRows = [];
      const maxLen = Math.max(UNITS.length, CATS.length);
      for (let i = 0; i < maxLen; i++) listRows.push([UNITS[i] || '', CATS[i] || '']);
      PCD.xlsx.save(XLSX, [
        {
          name: 'Ingredients',
          title: 'ProChefDesk — Ingredient Template',
          subtitle: t('import_xlsx_tpl_subtitle') || 'Fill one row per ingredient. Price = cost of ONE unit. See the "Lists" tab for valid Unit & Category values. Delete the example rows before importing.',
          headers: ['Name', 'Price', 'Unit', 'Category', 'Supplier', 'Yield%'],
          rows: [
            ['Olive Oil', 18, 'l', 'cat_oils', 'Fresh Co', ''],
            ['Chicken Breast', 18, 'kg', 'cat_poultry', 'Meat Co', 88],
            ['Tomato', 5, 'kg', 'cat_produce', '', 90],
          ],
          align: ['left', 'right', 'left', 'left', 'left', 'right'],
          widths: [30, 12, 10, 18, 22, 10],
        },
        {
          name: 'Lists',
          title: 'Valid values',
          subtitle: t('import_xlsx_tpl_lists') || 'Copy these exactly into the Unit and Category columns.',
          headers: ['Unit', 'Category'],
          rows: listRows,
          align: ['left', 'left'],
          widths: [14, 18],
        },
      ], 'prochefdesk-ingredients-template.xlsx');
    };
    if (window.XLSX && window.XLSX.utils) go(window.XLSX);
    else if (PCD.loadXLSX) PCD.loadXLSX().then(go).catch(function () { PCD.toast.error(t('toast_excel_parser_unavailable')); });
    else PCD.toast.error(t('toast_excel_parser_unavailable'));
  }
  function todayIsoForFilename() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function openExportDialog() {
    const t = PCD.i18n.t;
    const rows = buildExportRows();
    const count = rows.length - 1; // exclude header

    const body = PCD.el('div');
    body.innerHTML = `
      <div class="text-muted" style="font-size:13px;line-height:1.6;margin-bottom:14px;">
        ${PCD.escapeHtml(t('ingredients_export_intro') || 'Export your current ingredient library. The exported file uses the same column order as Import — edit in Excel and re-import to bulk-update prices, suppliers, or yield %.')}
      </div>
      <div class="card" style="padding:12px;background:var(--brand-50);border-color:var(--brand-300);margin-bottom:14px;">
        <div style="font-size:13px;color:var(--brand-700);font-weight:700;">
          ${count} ${PCD.escapeHtml(t('ingredients_export_items') || 'ingredients ready to export')}
        </div>
        <div class="text-muted text-sm" style="font-size:11px;margin-top:4px;">
          ${PCD.escapeHtml(t('ingredients_export_columns') || 'Columns: Name, Price, Unit, Category, Supplier, Yield%')}
        </div>
      </div>
    `;

    const csvBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    csvBtn.innerHTML = PCD.icon('download', 14) + ' <span>' + PCD.escapeHtml(t('ingredients_export_csv') || 'Download .csv') + '</span>';
    const xlsxBtn = PCD.el('button', { class: 'btn btn-outline', style: { flex: '1' } });
    xlsxBtn.innerHTML = PCD.icon('download', 14) + ' <span>' + PCD.escapeHtml(t('ingredients_export_xlsx') || 'Download Excel (.xlsx)') + '</span>';
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(xlsxBtn);
    footer.appendChild(csvBtn);

    const m = PCD.modal.open({
      title: t('ingredients_export') || 'Export ingredients',
      body: body, footer: footer, size: 'sm', closable: true,
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    csvBtn.addEventListener('click', function () {
      downloadCsvFromRows(rows, 'prochefdesk-ingredients-' + todayIsoForFilename() + '.csv');
      PCD.toast.success(t('ingredients_export_done') || 'Exported');
      m.close();
    });
    xlsxBtn.addEventListener('click', function () {
      const filename = 'prochefdesk-ingredients-' + todayIsoForFilename() + '.xlsx';
      // xlsx lazy-load (v2.8.78 pattern)
      if (window.XLSX && window.XLSX.utils) {
        downloadXlsxFromRows(rows, filename);
        PCD.toast.success(t('ingredients_export_done') || 'Exported');
        m.close();
      } else if (PCD.loadXLSX) {
        PCD.loadXLSX().then(function () {
          downloadXlsxFromRows(rows, filename);
          PCD.toast.success(t('ingredients_export_done') || 'Exported');
          m.close();
        }).catch(function () {
          PCD.toast.error(t('toast_excel_parser_unavailable'));
        });
      } else {
        PCD.toast.error(t('toast_excel_parser_unavailable'));
      }
    });
  }

  function openImportDialog() {
    const t = PCD.i18n.t;
    const body = PCD.el('div');

    // v2.9.19 — Currency hint (chef'in seçili currency'sini göster ki "Price"
    // hangi para birimi anlaşılsın)
    const prefs = PCD.store.get('prefs') || {};
    const curCode = prefs.currency || 'USD';
    const curSymbol = (function () {
      const list = (window.PCD_CONFIG && window.PCD_CONFIG.CURRENCIES) || [];
      const found = list.find(function (c) { return c.code === curCode; });
      return found ? found.symbol : '$';
    })();

    body.innerHTML = `
      <div style="padding:12px;background:var(--surface-2);border-radius:var(--r-sm);margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
          <div style="font-weight:700;font-size:13px;">${PCD.escapeHtml(t('import_format_title') || 'Format')}</div>
          <span style="font-size:11px;color:var(--text-3);background:var(--surface);padding:2px 8px;border-radius:6px;border:1px solid var(--border);">${PCD.escapeHtml(t('import_currency_note') || 'Prices in')} ${curSymbol} (${curCode})</span>
        </div>
        <div class="text-muted" style="font-size:13px;line-height:1.6;">
          ${PCD.escapeHtml(t('import_format_desc') || 'Paste CSV/TSV or upload a file. Columns in this order:')}
        </div>
        <pre style="background:var(--surface);padding:10px;border-radius:var(--r-sm);margin-top:8px;font-family:var(--font-mono);font-size:12px;overflow-x:auto;border:1px solid var(--border);"><code>Name,Price,Unit,Category,Supplier,Yield%
Olive Oil,18,l,cat_oils,Fresh Co,
Chicken Breast,18,kg,cat_poultry,Meat Co,88
Tomato,5,kg,cat_produce,,90
Pasta,3,kg,cat_dry_goods,,</code></pre>
        <div class="text-muted" style="font-size:11px;margin-top:8px;line-height:1.6;">
          <strong>${PCD.escapeHtml(t('import_help_price_title') || 'Price')}</strong> = ${PCD.escapeHtml(t('import_help_price_desc') || 'how much you pay for ONE unit. Buying a 5 kg sack of pasta for $15? Per-kg price is $3 — enter 3 and kg.')}<br>
          <strong>${PCD.escapeHtml(t('import_help_yield_title') || 'Yield %')}</strong> = ${PCD.escapeHtml(t('import_help_yield_desc') || 'optional. Usable portion after trim/peel. Chicken breast ~88%, whole salmon ~58%, tomato ~90%. Leave empty if unknown.')}<br>
          <strong>${PCD.escapeHtml(t('import_help_optional_title') || 'Optional')}</strong>: ${PCD.escapeHtml(t('import_help_optional_desc') || 'Category, Supplier and Yield can be left empty (keep the comma).')}<br>
          <strong>${PCD.escapeHtml(t('import_help_existing_title') || 'Existing items')}</strong>: ${PCD.escapeHtml(t('import_help_existing_desc') || 'If a row name matches an existing ingredient, its price/unit/category/supplier/yield will be UPDATED. New names are added.')}<br>
          <span style="display:inline-block;margin-top:6px;">${PCD.escapeHtml(t('import_help_units') || 'Supported units')}: <code>g, kg, ml, l, tsp, tbsp, cup, oz, lb, pcs, unit</code></span><br>
          <span style="display:inline-block;margin-top:2px;">${PCD.escapeHtml(t('import_help_cats') || 'Supported categories')}: <code>cat_meat, cat_poultry, cat_seafood, cat_dairy, cat_produce, cat_dry_goods, cat_spices, cat_oils, cat_beverages, cat_baking, cat_other</code></span>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary btn-sm" id="dlTemplateXlsxBtn">${PCD.icon('download', 14)} ${PCD.escapeHtml(t('import_download_template_xlsx') || 'Download Excel template (.xlsx)')}</button>
          <button type="button" class="btn btn-outline btn-sm" id="dlTemplateBtn">${PCD.icon('download', 14)} ${PCD.escapeHtml(t('import_download_template') || 'Blank .csv template')}</button>
        </div>
        <div class="text-muted" style="font-size:11px;margin-top:6px;line-height:1.5;">${PCD.escapeHtml(t('import_template_hint') || 'Easiest: download the Excel template and fill one row per ingredient — no commas needed. The "Lists" tab shows valid Unit & Category values.')}</div>
      </div>

      <div class="field">
        <label class="field-label">${t('import_paste') || 'Paste CSV/TSV'}</label>
        <textarea class="textarea" id="importText" rows="8" placeholder="${PCD.escapeHtml(t('ingredients_csv_placeholder'))}" style="font-family:var(--font-mono);font-size:13px;"></textarea>
      </div>

      <div class="flex gap-2 items-center mb-2">
        <div style="height:1px;flex:1;background:var(--border);"></div>
        <div class="text-muted text-sm">${PCD.escapeHtml(t('import_or') || 'or')}</div>
        <div style="height:1px;flex:1;background:var(--border);"></div>
      </div>

      <div class="field">
        <input type="file" id="importFile" accept=".csv,.tsv,.txt,.xlsx" style="display:none;">
        <button class="btn btn-outline btn-block" id="pickFileBtn">${PCD.icon('upload',16)} ${t('import_upload_file') || 'Upload CSV or Excel file'}</button>
        <div class="field-hint">${t('import_file_hint') || 'Supports .csv, .tsv, or .xlsx (Excel)'}</div>
      </div>

      <div id="importPreview"></div>
    `;

    // v2.14.2 — Excel template (önerilen) indir
    const dlXlsxBtn = PCD.$('#dlTemplateXlsxBtn', body);
    if (dlXlsxBtn) dlXlsxBtn.addEventListener('click', downloadXlsxTemplate);

    // v2.9.19 — Template download button
    const dlBtn = PCD.$('#dlTemplateBtn', body);
    if (dlBtn) dlBtn.addEventListener('click', function () {
      const tplCsv = 'Name,Price,Unit,Category,Supplier,Yield%\n' +
        'Olive Oil,18,l,cat_oils,Fresh Co,\n' +
        'Chicken Breast,18,kg,cat_poultry,Meat Co,88\n' +
        'Tomato,5,kg,cat_produce,,90\n' +
        'Pasta,3,kg,cat_dry_goods,,\n';
      const blob = new Blob([tplCsv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'prochefdesk-ingredients-template.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    });

    let parsed = null;

    const fileInp = PCD.$('#importFile', body);
    PCD.$('#pickFileBtn', body).addEventListener('click', function () { fileInp.click(); });

    fileInp.addEventListener('change', function (e) {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const name = f.name.toLowerCase();
      if (name.endsWith('.xlsx')) {
        // v2.6.49 — SheetJS (xlsx-js-style@1.2.0) is loaded globally on
        // every page from index.html, so window.XLSX is always available
        // here. The previous lazy-loader (loadSheetJS) tried to fetch
        // xlsx@0.18.5 from the CDN but its first guard always fired:
        //   if (window.XLSX) return cb(null, window.XLSX);
        // Removed for clarity. If for some reason XLSX is missing
        // (CDN blocked, etc.) we surface the same friendly error.
        // v2.8.78 — xlsx artık on-demand. İlk Excel import'unda CDN'den lazy yüklenir.
        const doImport = function () {
          const reader = new FileReader();
          reader.onload = function (evt) {
            try {
              const data = new Uint8Array(evt.target.result);
              const wb = window.XLSX.read(data, { type: 'array' });
              const sheet = wb.Sheets[wb.SheetNames[0]];
              const csv = window.XLSX.utils.sheet_to_csv(sheet);
              PCD.$('#importText', body).value = csv;
              previewParse(csv);
            } catch (err) {
              PCD.toast.error(PCD.i18n.t('toast_excel_parse_failed', { msg: err.message }));
            }
          };
          reader.readAsArrayBuffer(f);
        };
        if (window.XLSX && window.XLSX.read) {
          doImport();
        } else if (PCD.loadXLSX) {
          PCD.loadXLSX().then(doImport).catch(function () {
            PCD.toast.error(PCD.i18n.t('toast_excel_parser_unavailable'));
          });
        } else {
          PCD.toast.error(PCD.i18n.t('toast_excel_parser_unavailable'));
        }
      } else {
        const reader = new FileReader();
        reader.onload = function (evt) {
          PCD.$('#importText', body).value = evt.target.result;
          previewParse(evt.target.result);
        };
        reader.readAsText(f);
      }
    });

    const importTextEl = PCD.$('#importText', body);
    importTextEl.addEventListener('input', PCD.debounce(function () {
      previewParse(this.value);
    }, 300));

    function previewParse(text) {
      const prev = PCD.$('#importPreview', body);
      if (!text || !text.trim()) { prev.innerHTML = ''; parsed = null; return; }
      const rows = parseCSV(text);
      parsed = rows;
      if (!rows.length) {
        prev.innerHTML = '<div class="mt-2" style="padding:10px;background:var(--warning-bg);color:var(--warning);border-radius:var(--r-sm);font-size:13px;">⚠️ ' + PCD.escapeHtml(t('import_parse_failed') || 'Could not parse. Check that you have at least Name and Price columns.') + '</div>';
        return;
      }
      // v2.9.19 — Existing vs new split (so chef sees update count BEFORE import)
      const existingMap = {};
      PCD.store.listIngredients().forEach(function (i) { existingMap[i.name.toLowerCase()] = true; });
      let willUpdate = 0;
      let willAdd = 0;
      rows.forEach(function (r) {
        if (existingMap[r.name.toLowerCase()]) willUpdate++;
        else willAdd++;
      });
      const previewLines = rows.slice(0, 5).map(function (r) {
        const yieldStr = r.yieldPercent ? ' · ' + PCD.escapeHtml(t('import_yield_short') || 'yield') + ' ' + r.yieldPercent + '%' : '';
        return PCD.escapeHtml(r.name) + ' · ' + curSymbol + r.pricePerUnit + '/' + PCD.escapeHtml(r.unit) + (r.category ? ' · ' + PCD.escapeHtml(r.category) : '') + (r.supplier ? ' · ' + PCD.escapeHtml(r.supplier) : '') + yieldStr;
      }).join('<br>');
      prev.innerHTML = `
        <div class="mt-3" style="padding:10px;background:var(--brand-50);border-radius:var(--r-sm);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
            <strong>${rows.length} ${PCD.escapeHtml(t('import_rows_detected') || 'rows detected')}</strong>
            <span style="font-size:11px;color:var(--text-3);">
              ${willAdd > 0 ? '<span style="color:var(--success);font-weight:700;">+' + willAdd + ' ' + PCD.escapeHtml(t('import_new') || 'new') + '</span>' : ''}
              ${willAdd > 0 && willUpdate > 0 ? ' · ' : ''}
              ${willUpdate > 0 ? '<span style="color:var(--brand-700);font-weight:700;">↻ ' + willUpdate + ' ' + PCD.escapeHtml(t('import_update') || 'update') + '</span>' : ''}
            </span>
          </div>
          <div style="margin-top:6px;font-family:var(--font-mono);font-size:12px;color:var(--text-2);line-height:1.6;">
            ${previewLines}${rows.length > 5 ? '<br><span style="color:var(--text-3);">… +' + (rows.length - 5) + ' ' + PCD.escapeHtml(t('import_more_rows') || 'more') + '</span>' : ''}
          </div>
        </div>
      `;
    }

    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const importGoBtn = PCD.el('button', { class: 'btn btn-primary', text: t('import_go') || 'Import', style: { flex: '1' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(importGoBtn);

    const m = PCD.modal.open({
      title: t('ingredients_import') || 'Bulk Import',
      body: body, footer: footer, size: 'lg', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    importGoBtn.addEventListener('click', function () {
      if (PCD.gate && !PCD.gate.requireAuth()) return;
      if (!parsed || !parsed.length) { PCD.toast.error(PCD.i18n.t('toast_nothing_to_import')); return; }
      let added = 0, updated = 0;
      const existing = {};
      PCD.store.listIngredients().forEach(function (i) { existing[i.name.toLowerCase()] = i; });
      parsed.forEach(function (row) {
        const key = row.name.toLowerCase();
        if (existing[key]) {
          // Update existing: price, unit, category, supplier, yield (v2.9.19)
          const ing = existing[key];
          ing.pricePerUnit = row.pricePerUnit;
          if (row.unit) ing.unit = row.unit;
          if (row.category) ing.category = row.category;
          if (row.supplier) ing.supplier = row.supplier;
          if (row.yieldPercent != null) ing.yieldPercent = row.yieldPercent;
          PCD.store.upsertIngredient(ing);
          updated++;
        } else {
          const newIng = {
            name: row.name,
            unit: row.unit || 'g',
            pricePerUnit: row.pricePerUnit,
            category: row.category || 'cat_other',
            supplier: row.supplier || '',
          };
          if (row.yieldPercent != null) newIng.yieldPercent = row.yieldPercent;
          PCD.store.upsertIngredient(newIng);
          added++;
        }
      });
      PCD.toast.success(PCD.i18n.t('toast_imported_n_new_m_updated', { new: added, updated: updated }));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'ingredients') renderList(v);
      }, 150);
    });
  }

  // ============ BULK DELETE RESULT MODAL (v2.6.36) ============
  // Shown after a bulk delete when at least one ingredient was kept
  // because it's used in recipes. Tells the chef exactly what happened.
  function showBulkDeleteResult(deletedCount, blocked) {
    const t = PCD.i18n.t;
    const body = PCD.el('div');
    let html = '';
    if (deletedCount > 0) {
      html += '<div style="padding:10px 12px;background:var(--brand-50);border:1px solid var(--brand-300);border-radius:8px;margin-bottom:12px;font-weight:600;color:var(--brand-700);">' +
        '✓ ' + (t('ing_bulk_deleted') || '{n} malzeme silindi').replace('{n}', deletedCount) +
      '</div>';
    }
    html += '<div style="padding:10px 12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;font-size:13px;line-height:1.5;color:#92400e;">' +
      '<div style="font-weight:700;margin-bottom:6px;">⚠ ' +
        (t('ing_bulk_blocked') || '{n} malzeme kullanımda olduğu için silinmedi:').replace('{n}', blocked.length) +
      '</div>' +
      '<ul style="margin:6px 0 0;padding-inline-start:20px;max-height:240px;overflow-y:auto;">';
    blocked.forEach(function (b) {
      const recipesPreview = b.recipes.slice(0, 3);
      const more = b.recipes.length - recipesPreview.length;
      let recipesStr = recipesPreview.map(PCD.escapeHtml).join(', ');
      if (more > 0) recipesStr += ' +' + more;
      const recipesLabel = b.recipes.length === 1
        ? '1 ' + (t('cr_recipe') || 'tarif').toLowerCase()
        : b.recipes.length + ' ' + (t('cr_recipe') || 'tarif').toLowerCase();
      html += '<li style="margin-bottom:4px;"><strong>' + PCD.escapeHtml(b.name) + '</strong> <span style="color:#78350f;">(' + recipesLabel + ': ' + recipesStr + ')</span></li>';
    });
    html += '</ul></div>';
    body.innerHTML = html;

    const okBtn = PCD.el('button', { class: 'btn btn-primary', text: t('close') || 'Kapat', style: { width: '100%' } });
    const footer = PCD.el('div', { style: { width: '100%' } });
    footer.appendChild(okBtn);

    const m = PCD.modal.open({
      title: deletedCount > 0
        ? (t('ing_bulk_partial_title') || 'Silme tamamlandı (kısmen)')
        : (t('ing_bulk_blocked_title') || 'Hiçbir malzeme silinmedi'),
      body: body, footer: footer, size: 'sm', closable: true,
    });
    okBtn.addEventListener('click', function () { m.close(); });
  }

  // CSV/TSV parser
  // v2.6.41 — Backed by SheetJS (xlsx-js-style is loaded globally on every
  // page from index.html). The previous home-grown parser had two known
  // failure modes that broke chef invoice imports:
  //   1. Escaped quotes ("" inside a quoted cell) were toggled as two
  //      separate quotes, mangling product names like
  //      Mozzarella "Buffalo" 250g
  //   2. Multi-line quoted fields (rare but legal CSV) were split on
  //      every newline, corrupting any row that crossed a line break.
  // SheetJS handles both correctly, plus trims whitespace consistently.
  // The old splitLine() function is kept as a defensive fallback in case
  // window.XLSX hasn't loaded yet (slow network) — same behaviour as
  // before for the common case.
  function parseCSV(text) {
    if (!text || !text.trim()) return [];

    // Detect separator from first non-empty line
    const firstLine = (text.split(/\r?\n/).find(function (l) { return l.trim(); }) || '');
    const sep = firstLine.indexOf('\t') >= 0 ? '\t' : ',';

    let aoa = null;
    if (window.XLSX && window.XLSX.read && window.XLSX.utils) {
      try {
        const wb = window.XLSX.read(text, { type: 'string', FS: sep, raw: false });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (sheet) {
          aoa = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
        }
      } catch (e) {
        PCD.warn && PCD.warn('parseCSV: SheetJS parse failed, falling back', e);
        aoa = null;
      }
    }

    // Defensive fallback — only runs if SheetJS isn't ready (rare).
    if (!aoa) {
      const lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l; });
      aoa = lines.map(function (line) { return splitLine(line, sep); });
    }

    if (!aoa.length) return [];

    // Header detection (same heuristic as before)
    const firstRow = aoa[0] || [];
    const hasHeader = firstRow.length >= 2 &&
      /name/i.test(String(firstRow[0] || '')) &&
      /price/i.test(String(firstRow[1] || ''));
    const dataRows = hasHeader ? aoa.slice(1) : aoa;

    const rows = [];
    dataRows.forEach(function (cells) {
      if (!cells || cells.length < 2) return;
      const name = String(cells[0] || '').trim();
      const priceStr = String(cells[1] || '').replace(/[^0-9.\-]/g, '');
      const price = parseFloat(priceStr);
      if (!name || isNaN(price)) return;
      // Normalize unit case so 'L'/'KG'/'ML' (common in invoices) match
      // the lowercase canonical units (l, kg, ml). Without this the unit
      // would be saved as 'L', not appear in the dropdown, and break
      // unit conversion in recipe lines.
      let rawUnit = String(cells[2] || '').trim() || 'g';
      const lcUnit = rawUnit.toLowerCase();
      if (UNITS.indexOf(lcUnit) >= 0) rawUnit = lcUnit;
      // v2.9.19 — Yield% optional 6th column (cells[5]). Strip non-numeric
      // (handles "88%" → 88). Valid range 1-100, else ignored.
      let yieldPct = null;
      const yieldRaw = String(cells[5] || '').replace(/[^0-9.\-]/g, '');
      if (yieldRaw) {
        const y = parseFloat(yieldRaw);
        if (!isNaN(y) && y > 0 && y <= 100) yieldPct = y;
      }
      rows.push({
        name: name,
        pricePerUnit: price,
        unit: rawUnit,
        category: String(cells[3] || '').trim() || 'cat_other',
        supplier: String(cells[4] || '').trim() || '',
        yieldPercent: yieldPct,
      });
    });
    return rows;
  }

  // Defensive fallback splitter — used only if SheetJS isn't available.
  // Basic CSV split with simple quote handling. Kept around because the
  // SheetJS bundle could fail to load on a flaky network and we still
  // want imports to work for the common (no-quotes) case.
  function splitLine(line, sep) {
    const result = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === sep && !inQuote) { result.push(cur); cur = ''; continue; }
      cur += ch;
    }
    result.push(cur);
    return result;
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.ingredients = {
    render: renderList,
    openEditor: openEditor,
  };
})();
