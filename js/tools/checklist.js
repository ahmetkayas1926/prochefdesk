/* ================================================================
   ProChefDesk — checklist.js
   Shift checklists: opening, prep, closing, cleaning.
   - Templates: reusable item lists per shift type
   - Sessions: running checklist from a template (track who/when done)
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // Categories and priorities (v42-style). Labels via i18n.
  const CATS = [
    { id: 'prep',     labelKey: 'chk_categories_prep',     color: '#f59e0b' },
    { id: 'cooking',  labelKey: 'chk_categories_cooking',  color: '#ef4444' },
    { id: 'service',  labelKey: 'chk_categories_service',  color: '#3b82f6' },
    { id: 'cleaning', labelKey: 'chk_categories_cleaning', color: '#8b5cf6' },
    { id: 'admin',    labelKey: 'chk_categories_admin',    color: '#64748b' },
  ];
  const PRIOS = [
    { id: 'high', labelKey: 'chk_prio_high', color: '#ef4444' },
    { id: 'med',  labelKey: 'chk_prio_med',  color: '#f59e0b' },
    { id: 'low',  labelKey: 'chk_prio_low',  color: '#94a3b8' },
  ];
  function catLabel(c) { return c ? PCD.i18n.t(c.labelKey) : ''; }
  function prioLabel(p) { return p ? PCD.i18n.t(p.labelKey) : ''; }

  const DEFAULT_TEMPLATES = [
    {
      name: 'Opening Prep',
      icon: 'clock',
      items: [
        { text: 'Check fridge & freezer temperatures (2–4°C / -18°C)', cat: 'admin', prio: 'high' },
        { text: 'Receive and check morning deliveries — verify weights & dates', cat: 'admin', prio: 'high' },
        { text: 'Review today\'s reservations and covers', cat: 'admin', prio: 'high' },
        { text: 'Brief kitchen team — specials, 86\'d items, allergen alerts', cat: 'admin', prio: 'high' },
        { text: 'Set up all stations — mise en place check', cat: 'prep', prio: 'high' },
        { text: 'Prepare stocks, sauces and bases', cat: 'cooking', prio: 'med' },
        { text: 'Portion proteins for service', cat: 'prep', prio: 'high' },
        { text: 'Prep vegetable garnishes and sides', cat: 'prep', prio: 'med' },
        { text: 'Label and date all prep containers', cat: 'prep', prio: 'med' },
        { text: 'Check cleaning schedules from previous shift', cat: 'cleaning', prio: 'med' },
        { text: 'Taste test all soups, sauces, specials', cat: 'cooking', prio: 'high' },
        { text: 'Fill sanitizer buckets (200ppm)', cat: 'cleaning', prio: 'high' },
      ]
    },
    {
      name: 'Closing & Shutdown',
      icon: 'check-square',
      items: [
        { text: 'Cool all hot food to below 8°C within 90 minutes', cat: 'cooking', prio: 'high' },
        { text: 'Label, wrap and date all refrigerated leftovers', cat: 'prep', prio: 'high' },
        { text: 'Discard anything past use-by date', cat: 'admin', prio: 'high' },
        { text: 'Deep clean all cooking surfaces and equipment', cat: 'cleaning', prio: 'high' },
        { text: 'Clean and sanitize all prep boards and knives', cat: 'cleaning', prio: 'high' },
        { text: 'Degrease and clean fryers / grills', cat: 'cleaning', prio: 'high' },
        { text: 'Mop kitchen floor', cat: 'cleaning', prio: 'med' },
        { text: 'Empty bins and replace liners', cat: 'cleaning', prio: 'med' },
        { text: 'Check and restock fridges for morning service', cat: 'prep', prio: 'med' },
        { text: 'Update daily waste log', cat: 'admin', prio: 'med' },
        { text: 'Write notes for next shift — any issues, shortages', cat: 'admin', prio: 'med' },
        { text: 'Lock up and set alarms', cat: 'admin', prio: 'high' },
      ]
    },
    {
      name: 'Weekly Deep Clean',
      icon: 'recycle',
      items: [
        { text: 'Degrease canopy filters — soak in hot water solution', cat: 'cleaning', prio: 'high' },
        { text: 'Clean inside ovens — remove racks, degrease', cat: 'cleaning', prio: 'high' },
        { text: 'Descale steamers and combi ovens', cat: 'cleaning', prio: 'high' },
        { text: 'Clean walk-in fridge — shelves, walls, door seals', cat: 'cleaning', prio: 'high' },
        { text: 'Defrost and clean chest freezers', cat: 'cleaning', prio: 'med' },
        { text: 'Clean behind and under all equipment', cat: 'cleaning', prio: 'med' },
        { text: 'Sanitize all storage containers and lids', cat: 'cleaning', prio: 'med' },
        { text: 'Check and clean floor drains', cat: 'cleaning', prio: 'med' },
        { text: 'Inspect and restock first aid kit', cat: 'admin', prio: 'high' },
        { text: 'Test fire suppression system', cat: 'admin', prio: 'high' },
      ]
    },
    {
      name: 'Banquet / Event Setup',
      icon: 'calendar',
      items: [
        { text: 'Confirm final guest count with F&B manager', cat: 'admin', prio: 'high' },
        { text: 'Verify allergen list for all guests — update kitchen', cat: 'admin', prio: 'high' },
        { text: 'Scale all recipes to event count and print', cat: 'prep', prio: 'high' },
        { text: 'Complete all mise en place 2 hours before service', cat: 'prep', prio: 'high' },
        { text: 'Pre-portion appetizers and cold starters', cat: 'prep', prio: 'high' },
        { text: 'Set up service stations — plates, garnishes, sauce bottles', cat: 'service', prio: 'high' },
        { text: 'Brief all kitchen staff on sequence and timing', cat: 'admin', prio: 'high' },
        { text: 'Confirm hot holding temperatures', cat: 'cooking', prio: 'high' },
        { text: 'Set up pass — hot lamps, expo station', cat: 'service', prio: 'med' },
        { text: 'Designate allergen plates — separate garnishing area', cat: 'service', prio: 'high' },
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
          items: def.items.map(function (it) {
            // Support both string (legacy) and object (new) format
            if (typeof it === 'string') {
              return { id: PCD.uid('it'), text: it, cat: 'prep', prio: 'med' };
            }
            return { id: PCD.uid('it'), text: it.text, cat: it.cat || 'prep', prio: it.prio || 'med' };
          }),
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
        return { id: it.id, text: it.text, cat: it.cat, prio: it.prio, done: false, doneAt: null };
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
        const cat = CATS.find(function (c) { return c.id === it.cat; });
        const prio = PRIOS.find(function (p) { return p.id === it.prio; });
        const chips = '';
        const catChip = cat ? '<span style="font-size:10px;padding:2px 7px;border-radius:999px;background:' + cat.color + '22;color:' + cat.color + ';font-weight:700;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;">' + catLabel(cat) + '</span>' : '';
        const prioDot = prio ? '<span style="width:8px;height:8px;border-radius:50%;background:' + prio.color + ';flex-shrink:0;" title="' + prioLabel(prio) + '"></span>' : '';
        row.innerHTML =
          '<div style="width:22px;height:22px;border:2px solid ' + (it.done ? 'var(--brand-600)' : 'var(--border-strong)') + ';border-radius:4px;display:flex;align-items:center;justify-content:center;background:' + (it.done ? 'var(--brand-600)' : 'transparent') + ';color:white;flex-shrink:0;">' +
            (it.done ? PCD.icon('check', 16) : '') +
          '</div>' +
          prioDot +
          '<div style="flex:1;min-width:0;' + (it.done ? 'text-decoration:line-through;color:var(--text-3);' : '') + '">' + PCD.escapeHtml(it.text) + '</div>' +
          catChip +
          (it.doneAt ? '<div class="text-muted" style="white-space:nowrap;font-size:11px;">' + PCD.fmtRelTime(it.doneAt) + '</div>' : '');
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
    const printBtn = PCD.el('button', { class: 'btn btn-outline', title: 'Print / Save PDF' });
    printBtn.innerHTML = PCD.icon('print', 16);
    const shareBtn = PCD.el('button', { class: 'btn btn-outline', title: 'Share' });
    shareBtn.innerHTML = PCD.icon('share', 16);
    const completeBtn = PCD.el('button', { class: 'btn btn-primary', text: t('checklist_complete') || 'Complete', style: { flex: '1' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(closeBtn);
    footer.appendChild(printBtn);
    footer.appendChild(shareBtn);
    footer.appendChild(completeBtn);

    const m = PCD.modal.open({
      title: (tpl ? tpl.name : 'Checklist') + ' · ' + PCD.fmtDate(session.startedAt, { month: 'short', day: 'numeric' }),
      body: body, footer: footer, size: 'md', closable: true
    });

    closeBtn.addEventListener('click', function () { m.close(); });

    printBtn.addEventListener('click', function () {
      const s = getSession(sid);
      const tpl2 = PCD.store.getFromTable('checklistTemplates', s.templateId);
      const user = PCD.store.get('user') || {};
      const done = s.items.filter(function (it) { return it.done; }).length;
      const total = s.items.length;
      const rows = s.items.map(function (it, idx) {
        const check = it.done ? '☑' : '☐';
        const doneAt = it.doneAt ? ' <span style="font-size:10px;color:#888">· ' + PCD.fmtDate(it.doneAt, {hour:'numeric',minute:'2-digit'}) + '</span>' : '';
        const strike = it.done ? 'text-decoration:line-through;color:#999;' : '';
        return '<tr style="background:' + (idx%2===0 ? '#fff' : '#fafafa') + '">' +
          '<td style="width:24px;text-align:center;font-size:16px">' + check + '</td>' +
          '<td style="' + strike + '">' + PCD.escapeHtml(it.text) + doneAt + '</td>' +
        '</tr>';
      }).join('');
      const html =
        '<div style="max-width:680px;margin:0 auto">' +
        '<h1 style="margin:0 0 4px;font-size:22px">' + PCD.escapeHtml(tpl2 ? tpl2.name : 'Checklist') + '</h1>' +
        '<div style="color:#666;font-size:12px;margin-bottom:16px">Started: ' + PCD.fmtDate(s.startedAt, {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) +
        (user.name ? ' · by ' + PCD.escapeHtml(user.name) : '') +
        ' · <strong>' + done + '/' + total + ' done (' + Math.round((done/total)*100) + '%)</strong></div>' +
        '<table>' + rows + '</table>' +
        '</div>';
      PCD.print(html, (tpl2 ? tpl2.name : 'Checklist') + ' — ' + PCD.fmtDate(s.startedAt, {month:'short', day:'numeric'}));
    });

    shareBtn.addEventListener('click', function () {
      const s = getSession(sid);
      const tpl2 = PCD.store.getFromTable('checklistTemplates', s.templateId);
      const done = s.items.filter(function (it) { return it.done; }).length;
      const total = s.items.length;
      const lines = [
        (tpl2 ? tpl2.name : 'Checklist') + ' — ' + PCD.fmtDate(s.startedAt, {month:'short', day:'numeric'}),
        done + '/' + total + ' done (' + Math.round((done/total)*100) + '%)',
        '',
      ];
      s.items.forEach(function (it) {
        lines.push((it.done ? '☑ ' : '☐ ') + it.text);
      });
      const text = lines.join('\n');
      openShareSheet({ title: tpl2 ? tpl2.name : 'Checklist', text: text });
    });

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

  // Share sheet with WhatsApp / Email / Copy buttons
  function openShareSheet(opts) {
    const text = opts.text || '';
    const title = opts.title || 'Share';
    const body = PCD.el('div');
    body.innerHTML =
      '<div class="field"><label class="field-label">Message</label>' +
      '<textarea class="textarea" id="shareText" rows="8" style="font-family:var(--font-mono);font-size:13px;">' + PCD.escapeHtml(text) + '</textarea></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px">' +
        '<button class="btn btn-outline" id="shWa" style="flex-direction:column;height:auto;padding:14px 8px;gap:6px">' +
          '<div style="color:#25D366">' + PCD.icon('message-circle', 24) + '</div>' +
          '<div style="font-weight:600;font-size:13px">WhatsApp</div></button>' +
        '<button class="btn btn-outline" id="shEmail" style="flex-direction:column;height:auto;padding:14px 8px;gap:6px">' +
          '<div style="color:#EA4335">' + PCD.icon('mail', 24) + '</div>' +
          '<div style="font-weight:600;font-size:13px">Email</div></button>' +
        '<button class="btn btn-outline" id="shCopy" style="flex-direction:column;height:auto;padding:14px 8px;gap:6px">' +
          '<div style="color:var(--brand-600)">' + PCD.icon('copy', 24) + '</div>' +
          '<div style="font-weight:600;font-size:13px">Copy</div></button>' +
      '</div>';

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('btn_close') });
    const footer = PCD.el('div', { style: { display: 'flex', width: '100%' } });
    footer.appendChild(closeBtn);

    const m = PCD.modal.open({ title: 'Share · ' + title, body: body, footer: footer, size: 'md', closable: true });

    function getText() { return PCD.$('#shareText', body).value; }
    closeBtn.addEventListener('click', function () { m.close(); });
    PCD.$('#shWa', body).addEventListener('click', function () {
      window.open('https://wa.me/?text=' + encodeURIComponent(getText()), '_blank');
      m.close();
    });
    PCD.$('#shEmail', body).addEventListener('click', function () {
      window.location.href = 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(getText());
      m.close();
    });
    PCD.$('#shCopy', body).addEventListener('click', function () {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(getText()).then(function () {
          PCD.toast.success('Copied');
          m.close();
        });
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
          <input type="text" class="input" data-itemtext="${idx}" value="${PCD.escapeHtml(it.text || '')}" placeholder="Task description" style="flex:1;min-width:120px;">
          <select class="select" data-itemcat="${idx}" style="width:110px;flex-shrink:0;">
            ${CATS.map(function (c) { return '<option value="' + c.id + '"' + ((it.cat || 'prep') === c.id ? ' selected' : '') + '>' + catLabel(c) + '</option>'; }).join('')}
          </select>
          <select class="select" data-itemprio="${idx}" style="width:90px;flex-shrink:0;">
            ${PRIOS.map(function (p) { return '<option value="' + p.id + '"' + ((it.prio || 'med') === p.id ? ' selected' : '') + '>' + prioLabel(p) + '</option>'; }).join('')}
          </select>
          <button class="icon-btn" data-itemdel="${idx}" style="flex-shrink:0;">${PCD.icon('x',16)}</button>
        `;
        itemsListEl.appendChild(row);
      });

      PCD.$('#tplName', body).addEventListener('input', function () { data.name = this.value; });
      PCD.$('#addItemBtn', body).addEventListener('click', function () {
        data.items.push({ id: PCD.uid('it'), text: '', cat: 'prep', prio: 'med' });
        renderEditor();
        setTimeout(function () {
          const inputs = body.querySelectorAll('[data-itemtext]');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }, 30);
      });
      // NO debounce - sync on every keystroke so save always has fresh data
      PCD.on(body, 'input', '[data-itemtext]', function () {
        const idx = parseInt(this.getAttribute('data-itemtext'), 10);
        if (data.items[idx]) data.items[idx].text = this.value;
      });
      PCD.on(body, 'change', '[data-itemcat]', function () {
        const idx = parseInt(this.getAttribute('data-itemcat'), 10);
        if (data.items[idx]) data.items[idx].cat = this.value;
      });
      PCD.on(body, 'change', '[data-itemprio]', function () {
        const idx = parseInt(this.getAttribute('data-itemprio'), 10);
        if (data.items[idx]) data.items[idx].prio = this.value;
      });
      PCD.on(body, 'click', '[data-itemdel]', function () {
        const idx = parseInt(this.getAttribute('data-itemdel'), 10);
        data.items.splice(idx, 1);
        if (data.items.length === 0) data.items.push({ id: PCD.uid('it'), text: '', cat: 'prep', prio: 'med' });
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
      // Read fresh values from DOM — debounce-free safety net
      const nameInp = PCD.$('#tplName', body);
      if (nameInp) data.name = nameInp.value;
      body.querySelectorAll('[data-itemtext]').forEach(function (inp) {
        const idx = parseInt(inp.getAttribute('data-itemtext'), 10);
        if (data.items[idx]) data.items[idx].text = inp.value;
      });

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
