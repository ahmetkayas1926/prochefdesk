/* ================================================================
   ProChefDesk — checklist.js
   Shift checklists: opening, prep, closing, cleaning.
   - Templates: reusable item lists per shift type
   - Sessions: running checklist from a template (track who/when done)
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  const DEFAULT_TEMPLATES = [
    {
      name: 'Opening',
      icon: 'clock',
      items: [
        'Turn on hood ventilation',
        'Check walk-in cooler temperature (< 4°C / 40°F)',
        'Check freezer temperature (< -18°C / 0°F)',
        'Light pilots / preheat ovens',
        'Set up mise en place stations',
        'Check delivery received — match invoice to order',
        'Review today\'s reservations and specials',
        'Sanitize all prep surfaces',
        'Fill sanitizer buckets (200ppm)',
        'Check hand-wash stations (soap, towels, warm water)',
      ]
    },
    {
      name: 'Prep',
      icon: 'carrot',
      items: [
        'Check prep list from yesterday',
        'Portion proteins for service',
        'Prepare sauces (label + date)',
        'Wash and prep vegetables',
        'Make stocks / soups',
        'Bake / prep desserts',
        'Set up garnish tray',
        'Label everything with date + initials',
        'Rotate FIFO — first in, first out',
      ]
    },
    {
      name: 'Closing',
      icon: 'check-square',
      items: [
        'Wrap + label + date all open product',
        'Break down and clean all stations',
        'Empty and sanitize sanitizer buckets',
        'Drain fryer oil / strain if needed',
        'Clean hood filters',
        'Wipe down walk-in shelves',
        'Remove trash / recycling',
        'Mop kitchen floor',
        'Turn off all equipment',
        'Lock walk-in, freezer, back door',
        'Check fire suppression system',
        'Set alarm',
      ]
    },
    {
      name: 'Deep Clean',
      icon: 'recycle',
      items: [
        'Degrease hood system',
        'Clean behind all equipment',
        'Deep clean ovens (inside + out)',
        'Descale dishwasher',
        'Clean walk-in — empty, wipe, reorganize',
        'Sanitize all cutting boards',
        'Replace ice machine filter (if due)',
        'Sharpen all knives',
        'Rotate dry storage — check expiry dates',
      ]
    },
  ];

  // ============ MAIN VIEW ============
  function render(view) {
    const t = PCD.i18n.t;
    const templates = listTemplates();
    const activeSessions = listActiveSessions();

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('checklist_title') || 'Shift Checklists'}</div>
          <div class="page-subtitle">${t('checklist_subtitle') || 'Standardize opening, prep, and closing routines'}</div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-outline btn-sm" id="newTplBtn">${PCD.icon('plus',16)} ${t('checklist_new_template') || 'Template'}</button>
        </div>
      </div>

      ${activeSessions.length > 0 ? `
        <div class="section mb-4">
          <div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${t('checklist_in_progress') || 'In Progress'}</div>
          <div id="activeSessionsList" class="flex flex-col gap-2"></div>
        </div>
      ` : ''}

      <div class="section">
        <div class="section-title" style="font-size:13px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${t('checklist_templates') || 'Templates'}</div>
        <div id="templatesList" class="flex flex-col gap-2"></div>
      </div>
    `;

    // Active sessions
    const asEl = PCD.$('#activeSessionsList', view);
    if (asEl) {
      activeSessions.forEach(function (s) {
        const tpl = templates.find(function (t) { return t.id === s.templateId; });
        const total = (s.items || []).length;
        const done = (s.items || []).filter(function (it) { return it.done; }).length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        const row = PCD.el('div', { class: 'card card-hover', 'data-sid': s.id, style: { padding: '12px' } });
        row.innerHTML = `
          <div class="flex items-center gap-3">
            <div class="list-item-thumb" style="background:var(--brand-50);color:var(--brand-700);">${PCD.icon('clock',20)}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:15px;">${PCD.escapeHtml((tpl && tpl.name) || 'Session')}</div>
              <div class="text-muted text-sm">${done}/${total} · ${PCD.fmtRelTime(s.startedAt)}</div>
              <div class="progress mt-1" style="height:4px;">
                <div class="progress-bar" style="width:${pct}%;background:var(--brand-600);"></div>
              </div>
            </div>
            <div style="font-weight:700;color:var(--brand-700);">${pct}%</div>
          </div>
        `;
        asEl.appendChild(row);
      });
    }

    // Templates
    const tplEl = PCD.$('#templatesList', view);
    templates.forEach(function (tpl) {
      const row = PCD.el('div', { class: 'card card-hover', 'data-tid': tpl.id, style: { padding: '12px' } });
      row.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="list-item-thumb" style="background:var(--brand-50);color:var(--brand-700);">${PCD.icon(tpl.icon || 'check-square',20)}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:15px;">${PCD.escapeHtml(tpl.name)}</div>
            <div class="text-muted text-sm">${(tpl.items || []).length} items</div>
          </div>
          <button class="btn btn-primary btn-sm" data-startrun="${tpl.id}" onclick="event.stopPropagation();">${t('checklist_start') || 'Start'}</button>
        </div>
      `;
      tplEl.appendChild(row);
    });

    PCD.$('#newTplBtn', view).addEventListener('click', function () { openTemplateEditor(); });
    PCD.on(view, 'click', '[data-tid]', function (e) {
      if (e.target.closest('[data-startrun]')) return;
      openTemplateEditor(this.getAttribute('data-tid'));
    });
    PCD.on(view, 'click', '[data-startrun]', function (e) {
      e.stopPropagation();
      const tid = this.getAttribute('data-startrun');
      startSession(tid);
    });
    PCD.on(view, 'click', '[data-sid]', function () {
      openSession(this.getAttribute('data-sid'));
    });
  }

  // ============ DATA HELPERS ============
  function listTemplates() {
    let tpls = PCD.store.listTable('checklistTemplates');
    if (tpls.length === 0) {
      // Seed defaults (only on first use)
      DEFAULT_TEMPLATES.forEach(function (def) {
        PCD.store.upsertInTable('checklistTemplates', {
          name: def.name,
          icon: def.icon,
          items: def.items.map(function (text) { return { id: PCD.uid('it'), text: text }; }),
          isDefault: true,
        }, 'tpl');
      });
      tpls = PCD.store.listTable('checklistTemplates');
    }
    return tpls;
  }

  function listActiveSessions() {
    const all = PCD.store._read('checklistSessions') || [];
    return all.filter(function (s) { return !s.completedAt; }).slice().sort(function (a, b) {
      return (b.startedAt || '').localeCompare(a.startedAt || '');
    });
  }

  function startSession(templateId) {
    const tpl = PCD.store.getFromTable('checklistTemplates', templateId);
    if (!tpl) return;
    const session = {
      id: PCD.uid('s'),
      templateId: templateId,
      startedAt: new Date().toISOString(),
      completedAt: null,
      items: (tpl.items || []).map(function (it) {
        return { id: it.id, text: it.text, done: false, doneAt: null };
      }),
    };
    const all = PCD.store._read('checklistSessions') || [];
    all.push(session);
    PCD.store.set('checklistSessions', all);
    openSession(session.id);
  }

  function getSession(sid) {
    const all = PCD.store._read('checklistSessions') || [];
    return all.find(function (s) { return s.id === sid; });
  }

  function updateSession(sid, mutator) {
    const all = PCD.store._read('checklistSessions') || [];
    const idx = all.findIndex(function (s) { return s.id === sid; });
    if (idx < 0) return;
    mutator(all[idx]);
    PCD.store.set('checklistSessions', all);
  }

  // ============ SESSION VIEW ============
  function openSession(sid) {
    const t = PCD.i18n.t;
    const session = getSession(sid);
    if (!session) return;
    const tpl = PCD.store.getFromTable('checklistTemplates', session.templateId);

    const body = PCD.el('div');

    function renderBody() {
      const s = getSession(sid);
      if (!s) return;
      const total = s.items.length;
      const done = s.items.filter(function (it) { return it.done; }).length;
      const pct = total ? Math.round((done / total) * 100) : 0;

      body.innerHTML = `
        <div class="mb-3" style="padding:12px;background:var(--brand-50);border-radius:var(--r-md);">
          <div class="flex items-center justify-between mb-2">
            <div style="font-weight:700;">${done}/${total} complete</div>
            <div style="font-weight:700;color:var(--brand-700);font-size:18px;">${pct}%</div>
          </div>
          <div class="progress" style="height:6px;">
            <div class="progress-bar" style="width:${pct}%;background:var(--brand-600);transition:width 0.3s;"></div>
          </div>
        </div>
        <div class="flex flex-col gap-1" id="chkItems"></div>
      `;

      const itemsEl = PCD.$('#chkItems', body);
      s.items.forEach(function (it, idx) {
        const row = PCD.el('div', {
          style: {
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 12px', border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)', background: it.done ? 'var(--brand-50)' : 'var(--surface)',
            cursor: 'pointer',
            transition: 'all 0.2s',
          },
          'data-toggle': idx
        });
        row.innerHTML = `
          <div style="width:22px;height:22px;border:2px solid ${it.done ? 'var(--brand-600)' : 'var(--border-strong)'};border-radius:4px;display:flex;align-items:center;justify-content:center;background:${it.done ? 'var(--brand-600)' : 'transparent'};color:white;flex-shrink:0;">
            ${it.done ? PCD.icon('check', 16) : ''}
          </div>
          <div style="flex:1;min-width:0;${it.done ? 'text-decoration:line-through;color:var(--text-3);' : ''}">${PCD.escapeHtml(it.text)}</div>
          ${it.doneAt ? '<div class="text-muted text-sm" style="white-space:nowrap;">' + PCD.fmtRelTime(it.doneAt) + '</div>' : ''}
        `;
        itemsEl.appendChild(row);
      });

      PCD.on(body, 'click', '[data-toggle]', function () {
        const i = parseInt(this.getAttribute('data-toggle'), 10);
        updateSession(sid, function (s) {
          s.items[i].done = !s.items[i].done;
          s.items[i].doneAt = s.items[i].done ? new Date().toISOString() : null;
        });
        PCD.haptic && PCD.haptic('light');
        renderBody();
      });
    }

    renderBody();

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('close') });
    const completeBtn = PCD.el('button', { class: 'btn btn-primary', text: t('checklist_complete') || 'Complete', style: { flex: '1' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(closeBtn);
    footer.appendChild(completeBtn);

    const m = PCD.modal.open({
      title: (tpl ? tpl.name : 'Checklist') + ' · ' + PCD.fmtDate(session.startedAt, { month: 'short', day: 'numeric' }),
      body: body, footer: footer, size: 'md', closable: true
    });

    closeBtn.addEventListener('click', function () { m.close(); });
    completeBtn.addEventListener('click', function () {
      const s = getSession(sid);
      const undone = s.items.filter(function (it) { return !it.done; }).length;
      if (undone > 0) {
        PCD.modal.confirm({
          title: 'Complete with ' + undone + ' unchecked?',
          text: 'Mark session as completed anyway?',
          okText: 'Complete',
        }).then(function (ok) {
          if (!ok) return;
          updateSession(sid, function (s) { s.completedAt = new Date().toISOString(); });
          PCD.toast.success('Checklist completed');
          m.close();
          setTimeout(function () {
            const v = PCD.$('#view');
            if (PCD.router.currentView() === 'checklist') render(v);
          }, 150);
        });
      } else {
        updateSession(sid, function (s) { s.completedAt = new Date().toISOString(); });
        PCD.toast.success('Checklist completed');
        m.close();
        setTimeout(function () {
          const v = PCD.$('#view');
          if (PCD.router.currentView() === 'checklist') render(v);
        }, 150);
      }
    });
  }

  // ============ TEMPLATE EDITOR ============
  function openTemplateEditor(tid) {
    const t = PCD.i18n.t;
    const existing = tid ? PCD.store.getFromTable('checklistTemplates', tid) : null;
    const data = existing ? PCD.clone(existing) : {
      name: '', icon: 'check-square',
      items: [{ id: PCD.uid('it'), text: '' }],
    };

    const body = PCD.el('div');

    function renderEditor() {
      body.innerHTML = `
        <div class="field">
          <label class="field-label">${t('checklist_name') || 'Name'} *</label>
          <input type="text" class="input" id="tplName" value="${PCD.escapeHtml(data.name || '')}" placeholder="e.g. Saturday Opening">
        </div>

        <div class="field">
          <label class="field-label">${t('checklist_items') || 'Items'}</label>
          <div id="itemsList" class="flex flex-col gap-1"></div>
          <button class="btn btn-ghost btn-sm mt-2" id="addItemBtn">${PCD.icon('plus',14)} ${t('checklist_add_item') || 'Add item'}</button>
        </div>
      `;

      const itemsListEl = PCD.$('#itemsList', body);
      data.items.forEach(function (it, idx) {
        const row = PCD.el('div', {
          style: { display: 'flex', gap: '6px', alignItems: 'center' }
        });
        row.innerHTML = `
          <div style="color:var(--text-3);font-size:12px;width:20px;text-align:right;">${idx + 1}.</div>
          <input type="text" class="input" data-itemtext="${idx}" value="${PCD.escapeHtml(it.text || '')}" placeholder="Task description" style="flex:1;">
          <button class="icon-btn" data-itemdel="${idx}">${PCD.icon('x',16)}</button>
        `;
        itemsListEl.appendChild(row);
      });

      PCD.$('#tplName', body).addEventListener('input', function () { data.name = this.value; });
      PCD.$('#addItemBtn', body).addEventListener('click', function () {
        data.items.push({ id: PCD.uid('it'), text: '' });
        renderEditor();
        setTimeout(function () {
          const inputs = body.querySelectorAll('[data-itemtext]');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }, 30);
      });
      PCD.on(body, 'input', '[data-itemtext]', PCD.debounce(function () {
        const idx = parseInt(this.getAttribute('data-itemtext'), 10);
        if (data.items[idx]) data.items[idx].text = this.value;
      }, 300));
      PCD.on(body, 'click', '[data-itemdel]', function () {
        const idx = parseInt(this.getAttribute('data-itemdel'), 10);
        data.items.splice(idx, 1);
        if (data.items.length === 0) data.items.push({ id: PCD.uid('it'), text: '' });
        renderEditor();
      });
    }

    renderEditor();

    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    let deleteBtn = null;
    if (existing) deleteBtn = PCD.el('button', { class: 'btn btn-ghost', text: t('delete'), style: { color: 'var(--danger)' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    if (deleteBtn) footer.appendChild(deleteBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: existing ? (existing.name || 'Template') : (t('checklist_new_template') || 'New Template'),
      body: body, footer: footer, size: 'md', closable: true
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    if (deleteBtn) deleteBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('confirm_delete'), text: t('confirm_delete_desc'), okText: t('delete')
      }).then(function (ok) {
        if (!ok) return;
        PCD.store.deleteFromTable('checklistTemplates', existing.id);
        PCD.toast.success(t('item_deleted'));
        m.close();
        setTimeout(function () {
          const v = PCD.$('#view');
          if (PCD.router.currentView() === 'checklist') render(v);
        }, 150);
      });
    });
    saveBtn.addEventListener('click', function () {
      data.name = (data.name || '').trim();
      if (!data.name) { PCD.toast.error('Name required'); return; }
      // Filter empty items
      data.items = data.items.filter(function (it) { return it.text && it.text.trim(); });
      if (data.items.length === 0) { PCD.toast.error('Add at least one item'); return; }
      if (existing) data.id = existing.id;
      PCD.store.upsertInTable('checklistTemplates', data, 'tpl');
      PCD.toast.success(t('saved'));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'checklist') render(v);
      }, 150);
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.checklist = { render: render };
})();
