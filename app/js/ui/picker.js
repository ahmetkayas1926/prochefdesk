/* ================================================================
   ProChefDesk — picker.js
   Generic multi-select picker (used by Menu Builder, Kitchen Cards,
   Shopping List, Events, etc.)

   Usage:
     PCD.picker.open({
       title: 'Pick recipes',
       items: [{ id, name, meta, thumb }],
       multi: true,                      // or false for single
       selected: ['id1', 'id2'],         // pre-selected ids
     }).then(function(selected) { ... });
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function open(opts) {
    opts = opts || {};
    const t = PCD.i18n.t;
    const items = opts.items || [];
    const multi = opts.multi !== false;
    const selected = new Set(opts.selected || []);
    // v2.44.88 — opsiyonel sekmeler. opts.tabs=[{key,label}] verilirse segmented sekme barı
    // çizilir + it.tab ile filtrelenir. Verilmezse eski grup davranışı (geriye-uyumlu).
    const tabs = (Array.isArray(opts.tabs) && opts.tabs.length) ? opts.tabs : null;
    let activeTab = tabs ? tabs[0].key : null;

    return new Promise(function (resolve) {
      const searchInput = PCD.el('input', { type: 'text', class: 'input', placeholder: t('search_placeholder') });
      const search = PCD.el('div', { class: 'searchbar mb-3' });
      search.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35" stroke-linecap="round"/></svg>';
      search.appendChild(searchInput);

      const list = PCD.el('div', { class: 'flex flex-col gap-2' });

      const container = PCD.el('div');

      let tabBar = null;
      function paintTabs() {
        if (!tabBar) return;
        Array.prototype.forEach.call(tabBar.children, function (btn) {
          const on = btn.getAttribute('data-ptab') === activeTab;
          btn.style.background = on ? 'var(--surface)' : 'transparent';
          btn.style.color = on ? 'var(--brand-700)' : 'var(--text-2)';
          btn.style.boxShadow = on ? '0 1px 2px rgba(0,0,0,0.08)' : 'none';
        });
      }
      if (tabs) {
        tabBar = PCD.el('div', { style: { display: 'flex', gap: '4px', marginBottom: '12px', background: 'var(--surface-2)', padding: '4px', borderRadius: '10px' } });
        tabs.forEach(function (tb) {
          const btn = PCD.el('button', { class: 'btn btn-ghost btn-sm', 'data-ptab': tb.key, text: tb.label, style: { flex: '1', minHeight: '34px', fontWeight: '700', fontSize: '13px' } });
          tabBar.appendChild(btn);
        });
        tabBar.addEventListener('click', function (e) {
          const btn = e.target.closest('[data-ptab]');
          if (!btn) return;
          activeTab = btn.getAttribute('data-ptab');
          paintTabs();
          render(searchInput.value);
        });
        container.appendChild(tabBar);
      }
      container.appendChild(search);
      container.appendChild(list);

      function render(filter) {
        PCD.clear(list);
        const q = (filter || '').toLowerCase();
        const visible = items.filter(function (it) {
          if (tabs && it.tab !== activeTab) return false;
          if (!q) return true;
          return (it.name || '').toLowerCase().indexOf(q) >= 0 ||
                 (it.meta || '').toLowerCase().indexOf(q) >= 0;
        });
        if (visible.length === 0) {
          list.innerHTML = '<div class="empty"><div class="empty-desc">' + t('no_recipes_yet') + '</div></div>';
          return;
        }
        var _lastGroup = null;
        visible.forEach(function (it) {
          if (it.group !== undefined && it.group !== _lastGroup) {
            _lastGroup = it.group;
            const hdr = PCD.el('div', { style: { padding: '6px 4px 2px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', marginBottom: '4px', marginTop: _lastGroup ? '8px' : '0' } });
            hdr.textContent = it.group;
            list.appendChild(hdr);
          }
          const row = PCD.el('div', { class: 'list-item', 'data-id': it.id });
          if (selected.has(it.id)) row.style.borderColor = 'var(--brand-500)';

          const thumb = PCD.el('div', { class: 'list-item-thumb' });
          if (it.thumb) { thumb.style.backgroundImage = 'url(' + it.thumb + ')'; }
          else if (it.icon) { thumb.innerHTML = it.icon; }
          else { thumb.textContent = (it.name || '?').charAt(0).toUpperCase(); }

          const body = PCD.el('div', { class: 'list-item-body' });
          body.innerHTML = '<div class="list-item-title">' + PCD.escapeHtml(it.name) + '</div>' +
                           (it.meta ? '<div class="list-item-meta">' + PCD.escapeHtml(it.meta) + '</div>' : '');

          const indicator = PCD.el('div', {
            style: {
              width: '24px', height: '24px', borderRadius: multi ? '6px' : '50%',
              border: '2px solid ' + (selected.has(it.id) ? 'var(--brand-600)' : 'var(--border-strong)'),
              background: selected.has(it.id) ? 'var(--brand-600)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: '0',
              color: 'white'
            }
          });
          if (selected.has(it.id)) indicator.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

          row.appendChild(thumb);
          row.appendChild(body);
          row.appendChild(indicator);

          row.addEventListener('click', function () {
            if (!multi) {
              selected.clear();
              selected.add(it.id);
              render(searchInput.value);
              // Auto-confirm on single select
              PCD.haptic('light');
              modal._onClose = null;
              modal.close();
              resolve(Array.from(selected));
              return;
            }
            if (selected.has(it.id)) selected.delete(it.id);
            else selected.add(it.id);
            render(searchInput.value);
            updateFooter();
            PCD.haptic('tick');
          });
          list.appendChild(row);
        });
      }

      searchInput.addEventListener('input', PCD.debounce(function () { render(searchInput.value); }, 150));

      // Footer
      const countEl = PCD.el('span', { class: 'text-sm text-muted' });
      const doneBtn = PCD.el('button', { class: 'btn btn-primary', text: t('done_selecting') });
      const footer = PCD.el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '8px' } });
      footer.appendChild(countEl);
      footer.appendChild(doneBtn);

      function updateFooter() {
        countEl.textContent = selected.size + ' ' + t('selected');
      }

      doneBtn.addEventListener('click', function () {
        modal._onClose = null;
        modal.close();
        resolve(Array.from(selected));
      });

      const modal = PCD.modal.open({
        title: opts.title || t('select'),
        body: container,
        footer: multi ? footer : '',
        size: 'md',
        closable: true,
        onClose: function () { resolve(null); }
      });

      paintTabs();
      render('');
      updateFooter();
    });
  }

  PCD.picker = { open: open };
})();
