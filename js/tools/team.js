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
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  const ROLES = ['owner', 'manager', 'cook', 'viewer'];

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
    const team = PCD.store._read('team') || [];
    const user = PCD.store.get('user') || {};

    view.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <div class="page-title">${t('team_title')}</div>
          <div class="page-subtitle">${t('team_subtitle')}</div>
        </div>
        ${plan === 'pro' || team.length > 0 ? '<div class="page-header-actions"><button class="btn btn-primary" id="inviteBtn">+ ' + t('team_invite') + '</button></div>' : ''}
      </div>
      <div id="teamBody"></div>
    `;

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
          ℹ️ The invitee will receive a link. Until they accept, their status remains "Pending".
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
      if (!email || email.indexOf('@') < 0) { PCD.toast.error('Valid email required'); return null; }
      const existing = PCD.store._read('team') || [];
      if (existing.some(function (x) { return x.email === email; })) {
        PCD.toast.warning('Already invited'); return null;
      }
      const member = {
        id: PCD.uid('mem'), email: email, name: '', role: role,
        status: 'pending', invitedAt: new Date().toISOString()
      };
      const next = existing.concat([member]);
      PCD.store.set('team', next);
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
        navigator.clipboard.writeText(link).then(function () { PCD.toast.success('Link copied'); });
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
    const team = PCD.store._read('team') || [];
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
        <label class="field-label">Name</label>
        <input type="text" class="input" id="tmName" value="${PCD.escapeHtml(data.name || '')}" placeholder="Optional display name">
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
        <label class="field-label">Status</label>
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
        const next = (PCD.store._read('team') || []).filter(function (x) { return x.id !== mid; });
        PCD.store.set('team', next);
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
      const next = (PCD.store._read('team') || []).map(function (x) { return x.id === mid ? data : x; });
      PCD.store.set('team', next);
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
