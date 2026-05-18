/* ================================================================
   ProChefDesk — team.js
   Team/staff management with role-based permissions.

   Roles:
   - owner:   full access (just one, the signed-in user)
   - manager: everything except team + billing
   - cook:    recipes, ingredients, waste, inventory
   - viewer:  read-only

   Data stored as flat array: PCD.store.team = [{
     id, email, name, role, status: 'pending'|'active', invitedAt
   }]

   Free plan: show upsell gate. Actual email invites require backend
   implementation (out of scope for Phase 4 — clipboard invite link only).

   v2.9.9 — NAKED→RICH upgrade: closeable inline guide, team composition
   stats hero (member count + role breakdown), hardcoded English string
   sweep → i18n. Pattern: buffet v2.8.77.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  const ROLES = ['owner', 'manager', 'cook', 'viewer'];

  // v2.9.17 — Workspace-scoped team storage with soft-delete pattern (waste benzeri).
  //   readTeamAll() → raw, _deletedAt'lı tombstone'lar dahil
  //   readTeam()    → görünür, _deletedAt'sız (UI render için)
  //   writeTeam()   → queueArraySync ile cloud'a push (UPSERT only, tombstone hard-delete atmaz)
  // Legacy global array (workspace-scoped olmadan) tespit edilirse aktif ws'e taşınır.
  function readTeamAll() {
    const wsId = PCD.store.getActiveWorkspaceId();
    const all = PCD.store._read('team') || {};
    if (Array.isArray(all)) return all; // legacy: pre-v2.9.17 global array — current ws'e map
    return all[wsId] || [];
  }
  function readTeam() {
    return readTeamAll().filter(function (e) { return !e._deletedAt; });
  }
  function writeTeam(arr) {
    const wsId = PCD.store.getActiveWorkspaceId();
    const root = PCD.store._read('team') || {};
    let next = Array.isArray(root) ? {} : Object.assign({}, root);
    const oldArr = Array.isArray(root) ? root : (root[wsId] || []);
    next[wsId] = arr;
    PCD.store.set('team', next);
    if (PCD.cloudPerTable) {
      PCD.cloudPerTable.queueArraySync('team', wsId, oldArr, arr);
    }
  }

  function roleColor(role) {
    return {
      owner: 'var(--brand-700)',
      manager: 'var(--info)',
      cook: 'var(--success)',
      viewer: 'var(--text-3)',
    }[role] || 'var(--text-3)';
  }

  function render(view) {
    const t = PCD.i18n.t;
    const plan = PCD.store.get('plan') || 'free';
    const team = readTeam(); // v2.9.17 — workspace-scoped, soft-delete filtered
    const user = PCD.store.get('user') || {};

    // v2.9.9 — Closeable inline guide
    const guideHidden = (function () {
      try { return localStorage.getItem('pcd_team_guide_hidden') === '1'; } catch (e) { return false; }
    })();

    // v2.9.9 — Team composition stats
    const roleCounts = { manager: 0, cook: 0, viewer: 0 };
    const activeCount = team.filter(function (m) { return m.status === 'active'; }).length;
    const pendingCount = team.filter(function (m) { return m.status === 'pending'; }).length;
    team.forEach(function (m) { if (roleCounts[m.role] != null) roleCounts[m.role]++; });

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('team_title')}</div>
          <div class="page-subtitle">${t('team_subtitle')}</div>
        </div>
        ${plan === 'pro' || team.length > 0 ? '<div class="page-header-actions"><button class="btn btn-primary" id="inviteBtn">+ ' + t('team_invite') + '</button></div>' : ''}
      </div>

      ${!guideHidden ? `
        <details class="card" open style="padding:0;margin-bottom:14px;background:linear-gradient(135deg,var(--brand-50),var(--surface));border:1px solid var(--brand-300);">
          <summary style="cursor:pointer;padding:12px 14px;font-weight:700;font-size:13px;color:var(--brand-700);display:flex;align-items:center;gap:8px;list-style:none;">
            <span style="font-size:16px;">💡</span>
            <span style="flex:1;">${PCD.escapeHtml(t('team_guide_title') || 'How team access works')}</span>
            <button type="button" id="teamGuideDismiss" style="background:transparent;border:0;color:var(--text-3);cursor:pointer;font-size:11px;padding:2px 6px;" title="${PCD.escapeHtml(t('team_guide_dismiss') || 'Hide')}">✕</button>
          </summary>
          <div style="padding:0 14px 14px;font-size:13px;color:var(--text-2);line-height:1.65;">
            <ol style="margin:0;padding-inline-start:20px;">
              <li><strong>${PCD.escapeHtml(t('team_guide_step1_title') || 'Pick the right role')}</strong> — ${PCD.escapeHtml(t('team_guide_step1_body') || 'Manager = everything except billing + team. Cook = recipes/ingredients/waste/inventory. Viewer = read-only. Default to least privilege, escalate if needed.')}</li>
              <li><strong>${PCD.escapeHtml(t('team_guide_step2_title') || 'Send invite via email or link')}</strong> — ${PCD.escapeHtml(t('team_guide_step2_body') || 'Email sends a join request. Copy Link gives you a sharable URL — paste in WhatsApp or SMS. Until they accept, status stays "Pending".')}</li>
              <li><strong>${PCD.escapeHtml(t('team_guide_step3_title') || 'Each workspace is isolated')}</strong> — ${PCD.escapeHtml(t('team_guide_step3_body') || 'A member added to one workspace does not see your other workspaces. If you run two concepts, invite the cook separately to each.')}</li>
              <li><strong>${PCD.escapeHtml(t('team_guide_step4_title') || 'Remove + audit any time')}</strong> — ${PCD.escapeHtml(t('team_guide_step4_body') || 'Tap a member row to edit role, change status, or remove. Removal is instant — they lose access on next page load.')}</li>
            </ol>
            <div style="margin-top:10px;padding:8px 10px;background:var(--surface-2);border-radius:6px;font-size:12px;color:var(--text-3);">
              <strong>💎 ${PCD.escapeHtml(t('team_guide_tip_title') || 'Pro tip')}:</strong> ${PCD.escapeHtml(t('team_guide_tip_body') || 'When a chef leaves, set status to Pending instead of removing — keeps audit trail but instantly cuts access. Remove for good once handover is done.')}
            </div>
          </div>
        </details>
      ` : ''}

      ${team.length > 0 ? `
        <div class="stat mb-3" style="background:linear-gradient(135deg,#16a34a18,var(--surface));border-color:#16a34a;padding:18px;">
          <div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:14px;">
            <div style="flex-shrink:0;">
              <div class="stat-label" style="font-size:11px;">${PCD.escapeHtml(t('team_total_members') || 'Team members')}</div>
              <div style="font-size:42px;font-weight:900;color:#16a34a;line-height:1;letter-spacing:-0.02em;">${team.length + 1}</div>
            </div>
            <div style="flex:1;min-width:180px;">
              <span style="display:inline-block;padding:4px 10px;background:#16a34a25;color:#16a34a;font-weight:700;font-size:11px;text-transform:uppercase;border-radius:6px;letter-spacing:0.06em;">${activeCount} ${PCD.escapeHtml(t('team_active') || 'active')}${pendingCount > 0 ? ' · ' + pendingCount + ' ' + PCD.escapeHtml(t('team_pending') || 'pending') : ''}</span>
              <div class="text-muted text-sm" style="font-size:11px;margin-top:5px;line-height:1.4;">${PCD.escapeHtml(t('team_owner_plus') || 'You (owner) + invited members')}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
            <div><div class="stat-label" style="font-size:11px;">${t('team_role_manager')}</div><div style="font-size:18px;font-weight:700;color:var(--info);">${roleCounts.manager}</div></div>
            <div><div class="stat-label" style="font-size:11px;">${t('team_role_cook')}</div><div style="font-size:18px;font-weight:700;color:var(--success);">${roleCounts.cook}</div></div>
            <div><div class="stat-label" style="font-size:11px;">${t('team_role_viewer')}</div><div style="font-size:18px;font-weight:700;color:var(--text-3);">${roleCounts.viewer}</div></div>
          </div>
        </div>
      ` : ''}

      <div id="teamBody"></div>
    `;

    // Guide dismiss handler
    const dismissBtn = PCD.$('#teamGuideDismiss', view);
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        try { localStorage.setItem('pcd_team_guide_hidden', '1'); } catch (er) {}
        render(view);
      });
    }

    const bodyEl = PCD.$('#teamBody', view);

    // Pro gate for free users with no existing team
    if (plan !== 'pro' && team.length === 0) {
      bodyEl.innerHTML = `
        <div class="card" style="padding:24px;text-align:center;background:linear-gradient(135deg,var(--brand-50),var(--brand-100));border-color:var(--brand-300);">
          <div style="font-size:48px;margin-bottom:12px;">🔒</div>
          <div style="font-weight:800;font-size:20px;letter-spacing:-0.01em;margin-bottom:6px;">${t('team_requires_pro')}</div>
          <div class="text-muted mb-4" style="max-width:420px;margin:0 auto 16px;">${t('team_empty_desc')}</div>
          <button class="btn btn-primary" id="upgradeBtn">Upgrade to Pro</button>
        </div>

        <div class="section mt-4">
          <div class="section-title" style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-3);margin-bottom:8px;">Roles</div>
          ${renderRoleCards()}
        </div>
      `;
      PCD.$('#upgradeBtn', bodyEl).addEventListener('click', function () {
        PCD.router.go('account');
      });
      return;
    }

    // Owner row (you)
    let html = '<div class="flex flex-col gap-2">';
    html += '<div class="list-item" style="background:linear-gradient(135deg,var(--brand-50),var(--brand-100));border-color:var(--brand-300);">';
    html += '<div class="list-item-thumb" style="background:var(--brand-600);color:white;font-weight:800;">' +
      ((user.name || user.email || 'Y').charAt(0).toUpperCase()) + '</div>';
    html += '<div class="list-item-body">';
    html += '<div class="list-item-title">' + PCD.escapeHtml(user.name || 'You') + '</div>';
    html += '<div class="list-item-meta"><span>' + PCD.escapeHtml(user.email || '(offline)') + '</span></div>';
    html += '</div>';
    html += '<span class="chip chip-brand">' + t('team_role_owner') + '</span>';
    html += '</div>';

    // Team members
    team.forEach(function (m) {
      html += '<div class="list-item" data-mid="' + m.id + '">';
      html += '<div class="list-item-thumb" style="background:' + roleColor(m.role) + ';color:white;font-weight:700;">' +
        ((m.name || m.email || '?').charAt(0).toUpperCase()) + '</div>';
      html += '<div class="list-item-body">';
      html += '<div class="list-item-title">' + PCD.escapeHtml(m.name || m.email) + '</div>';
      html += '<div class="list-item-meta"><span>' + PCD.escapeHtml(m.email) + '</span>';
      if (m.invitedAt) html += '<span>·</span><span>invited ' + PCD.fmtRelTime(m.invitedAt) + '</span>';
      html += '</div></div>';
      html += '<span class="chip" style="background:' + roleColor(m.role) + '20;color:' + roleColor(m.role) + ';font-weight:700;margin-inline-end:4px;">' + t('team_role_' + m.role) + '</span>';
      html += '<span class="chip' + (m.status === 'active' ? ' chip-success' : '') + '" style="font-size:10px;">' + t('team_' + (m.status || 'pending')) + '</span>';
      html += '</div>';
    });
    html += '</div>';

    bodyEl.innerHTML = html;

    PCD.$('#inviteBtn', view).addEventListener('click', openInviteModal);
    PCD.on(bodyEl, 'click', '[data-mid]', function () {
      openMemberEditor(this.getAttribute('data-mid'));
    });
  }

  function renderRoleCards() {
    const t = PCD.i18n.t;
    let html = '<div class="grid" style="grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:8px;">';
    ROLES.forEach(function (role) {
      html += '<div class="card" style="padding:10px;border-inline-start:4px solid ' + roleColor(role) + ';">';
      html += '<div style="font-weight:700;color:' + roleColor(role) + ';margin-bottom:4px;">' + t('team_role_' + role) + '</div>';
      html += '<div class="text-muted text-sm">' + t('team_role_desc_' + role) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  function openInviteModal() {
    const t = PCD.i18n.t;
    const body = PCD.el('div');
    body.innerHTML = `
      <div class="field">
        <label class="field-label">${t('team_member_email')} *</label>
        <input type="email" class="input" id="tmEmail" placeholder="chef@example.com">
      </div>
      <div class="field">
        <label class="field-label">${t('team_role')}</label>
        <select class="select" id="tmRole">
          ${['manager', 'cook', 'viewer'].map(function (r) {
            return '<option value="' + r + '">' + t('team_role_' + r) + ' — ' + t('team_role_desc_' + r) + '</option>';
          }).join('')}
        </select>
      </div>
      <div class="card mt-3" style="background:var(--info-bg);border-color:var(--info);padding:12px;">
        <div class="text-sm" style="color:var(--info);line-height:1.5;">
          ℹ️ ${PCD.escapeHtml(t('team_invite_note') || 'The invitee will receive a link. Until they accept, their status remains "Pending".')}
        </div>
      </div>
    `;

    const inviteBtn = PCD.el('button', { class: 'btn btn-primary', text: t('team_invite'), style: { flex: '1' } });
    const copyBtn = PCD.el('button', { class: 'btn btn-outline' });
    copyBtn.innerHTML = '🔗 ' + t('team_copy_invite');
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    footer.appendChild(cancelBtn);
    footer.appendChild(copyBtn);
    footer.appendChild(inviteBtn);

    const m = PCD.modal.open({
      title: t('team_invite'), body: body, footer: footer, size: 'md', closable: true,
    });

    function addMember() {
      const email = (PCD.$('#tmEmail', body).value || '').trim();
      const role = PCD.$('#tmRole', body).value;
      if (!email || email.indexOf('@') < 0) { PCD.toast.error(t('team_invalid_email') || 'Valid email required'); return null; }
      // v2.9.17 — workspace-scoped read (visible only — already filtered by ws + soft-delete)
      const existing = readTeam();
      if (existing.some(function (x) { return x.email === email; })) {
        PCD.toast.warning(t('team_already_invited') || 'Already invited'); return null;
      }
      const member = {
        id: PCD.uid('mem'), email: email, name: '', role: role,
        status: 'pending', invitedAt: new Date().toISOString()
      };
      // v2.9.17 — readTeamAll keeps tombstones so queueArraySync diff is correct
      const allCur = readTeamAll();
      const next = allCur.concat([member]);
      writeTeam(next);
      return member;
    }

    cancelBtn.addEventListener('click', function () { m.close(); });
    inviteBtn.addEventListener('click', function () {
      const mem = addMember();
      if (!mem) return;
      PCD.toast.success(t('team_invite_sent'));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'team') render(v);
      }, 250);
    });
    copyBtn.addEventListener('click', function () {
      const mem = addMember();
      if (!mem) return;
      const link = (PCD.config && PCD.config.APP_URL ? PCD.config.APP_URL : 'https://prochefdesk.com') + '/join?token=' + mem.id;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(function () { PCD.toast.success(t('team_link_copied') || 'Link copied'); });
      } else {
        PCD.toast.info(link);
      }
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'team') render(v);
      }, 250);
    });
  }

  function openMemberEditor(mid) {
    const t = PCD.i18n.t;
    const team = readTeam(); // v2.9.17 — workspace-scoped, visible
    const existing = team.find(function (m) { return m.id === mid; });
    if (!existing) return;
    const data = PCD.clone(existing);

    const body = PCD.el('div');
    body.innerHTML = `
      <div class="field">
        <label class="field-label">${t('team_member_email')}</label>
        <input type="email" class="input" id="tmEmail" value="${PCD.escapeHtml(data.email)}" disabled>
      </div>
      <div class="field">
        <label class="field-label">${PCD.escapeHtml(t('team_member_name') || 'Name')}</label>
        <input type="text" class="input" id="tmName" value="${PCD.escapeHtml(data.name || '')}" placeholder="${PCD.escapeHtml(t('team_member_name_ph') || 'Optional display name')}">
      </div>
      <div class="field">
        <label class="field-label">${t('team_role')}</label>
        <select class="select" id="tmRole">
          ${['manager', 'cook', 'viewer'].map(function (r) {
            return '<option value="' + r + '"' + (data.role === r ? ' selected' : '') + '>' + t('team_role_' + r) + '</option>';
          }).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label">${PCD.escapeHtml(t('team_status') || 'Status')}</label>
        <div class="flex gap-2">
          ${['pending', 'active'].map(function (s) {
            return '<button type="button" class="chip' + (data.status === s ? ' chip-brand' : '') + '" data-status="' + s + '" style="cursor:pointer;padding:6px 12px;">' + t('team_' + s) + '</button>';
          }).join('')}
        </div>
      </div>
    `;

    PCD.on(body, 'click', '[data-status]', function () {
      data.status = this.getAttribute('data-status');
      PCD.$$('[data-status]', body).forEach(function (b) { b.classList.remove('chip-brand'); });
      this.classList.add('chip-brand');
    });

    const saveBtn = PCD.el('button', { class: 'btn btn-primary', text: t('save'), style: { flex: '1' } });
    const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
    const removeBtn = PCD.el('button', { class: 'btn btn-ghost', text: t('team_remove'), style: { color: 'var(--danger)' } });
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(removeBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    const m = PCD.modal.open({
      title: data.email, body: body, footer: footer, size: 'md', closable: true,
    });

    cancelBtn.addEventListener('click', function () { m.close(); });
    removeBtn.addEventListener('click', function () {
      PCD.modal.confirm({
        icon: '🗑', iconKind: 'danger', danger: true,
        title: t('confirm_delete'), text: t('team_remove') + ' ' + data.email + '?', okText: t('team_remove')
      }).then(function (ok) {
        if (!ok) return;
        // v2.9.17 — Soft-delete pattern: tombstone bırak, array'den çıkarma.
        // Cross-device sync'te _deletedAt'lı kayıt newest-wins ile kazanır,
        // item geri gelmez (waste/recipes pattern).
        const cur = readTeamAll().slice();
        const idx = cur.findIndex(function (x) { return x.id === mid; });
        if (idx !== -1) {
          cur[idx] = Object.assign({}, cur[idx], { _deletedAt: new Date().toISOString() });
          writeTeam(cur);
        }
        PCD.toast.success(t('item_deleted'));
        m.close();
        setTimeout(function () {
          const v = PCD.$('#view');
          if (PCD.router.currentView() === 'team') render(v);
        }, 250);
      });
    });
    saveBtn.addEventListener('click', function () {
      data.name = PCD.$('#tmName', body).value.trim();
      data.role = PCD.$('#tmRole', body).value;
      // v2.9.17 — readTeamAll keeps tombstones for correct diff
      const next = readTeamAll().map(function (x) { return x.id === mid ? data : x; });
      writeTeam(next);
      PCD.toast.success(t('saved'));
      m.close();
      setTimeout(function () {
        const v = PCD.$('#view');
        if (PCD.router.currentView() === 'team') render(v);
      }, 250);
    });
  }

  PCD.tools = PCD.tools || {};
  PCD.tools.team = { render: render };
})();
