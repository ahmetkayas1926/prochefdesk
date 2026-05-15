/* ================================================================
   ProChefDesk — discover.js (v2.8.41)
   Discover — Public recipe feed (MVP frontend skeleton)

   Operatör spec (backlog #8): Pinterest tarzı keşif alanı. Recipe
   başına `isPublic` toggle, anonymous SELECT, grid layout, like
   butonu, view counter. Rating yok (drama getirir).

   Bu round (v2.8.41) — FRONTEND SKELETON SADECE:
     - Discover route + sidenav entry
     - Recipe editöründe isPublic toggle (zaten v2.8.41'de eklendi)
     - Grid kullanıcının KENDİ public recipe'larını gösterir
     - Diğer kullanıcıların public recipe'ları henüz görünmez
       (backend: anonymous SELECT RLS policy henüz açılmadı)
     - Like/view UI yok (sonraki sürümde)

   Sonraki sürümlerde gelecekler (Faz 2 — operatör onayıyla):
     - Supabase migration: recipes.is_public boolean column +
       anonymous SELECT RLS policy
     - recipe_likes + recipe_views tabloları + RLS
     - cloud-pertable.js'e likes/views sync registration
     - Frontend like + view counter UI
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function listMyPublicRecipes() {
    // v2.8.41 — Kullanıcının kendi public recipe'leri. Backend anonymous
    // SELECT henüz açılmadığı için diğer kullanıcıların public recipe'ları
    // şu an erişilemez — sadece kendi gönderdiklerini önizleme görüyor.
    const recipes = (PCD.store.listRecipes && PCD.store.listRecipes()) || [];
    return recipes.filter(function (r) { return r && r.isPublic === true; });
  }

  function render(view) {
    const t = PCD.i18n.t;
    const myPublics = listMyPublicRecipes();

    view.innerHTML =
      '<div class="page-header">' +
        '<div class="page-header-text">' +
          '<div class="page-title">🌍 ' + PCD.escapeHtml(t('discover_title') || 'Discover') + '</div>' +
          '<div class="page-subtitle">' + PCD.escapeHtml(t('discover_subtitle') || 'Şefler arası tarif paylaşımı · Yakında') + '</div>' +
        '</div>' +
      '</div>';

    // Tek bir info card — operatör için skeleton mesajı + scope açıklaması
    const banner = PCD.el('div', { class: 'card', style: { padding: '16px', marginTop: '14px', marginBottom: '14px', background: 'var(--surface-2)', borderRadius: 'var(--r-md)' } });
    banner.innerHTML =
      '<div style="display:flex;gap:12px;align-items:flex-start;">' +
        '<div style="font-size:24px;line-height:1;">🌱</div>' +
        '<div style="flex:1;font-size:13px;color:var(--text-2);line-height:1.6;">' +
          '<div style="font-weight:600;color:var(--text-1);margin-bottom:4px;">' + PCD.escapeHtml(t('discover_banner_title') || 'Discover yapım aşamasında') + '</div>' +
          PCD.escapeHtml(t('discover_banner_body') || 'Recipe editöründe "Discover\'da paylaş" toggle\'ı eklendi. Backend (diğer şeflerin tariflerini görme, beğenme, görüntülenme sayısı) sonraki güncellemelerde gelecek. Şu an aşağıda sadece kendi public işaretlediğin tariflerin önizlemesi görünür.') +
        '</div>' +
      '</div>';
    view.appendChild(banner);

    if (myPublics.length === 0) {
      // Empty state
      const empty = PCD.el('div', { class: 'card', style: { padding: '32px 20px', textAlign: 'center', marginTop: '10px' } });
      empty.innerHTML =
        '<div style="font-size:42px;margin-bottom:8px;">📖</div>' +
        '<div style="font-weight:600;font-size:15px;margin-bottom:4px;">' + PCD.escapeHtml(t('discover_empty_title') || 'Henüz public tarif yok') + '</div>' +
        '<div style="color:var(--text-2);font-size:13px;line-height:1.5;max-width:380px;margin:0 auto;">' + PCD.escapeHtml(t('discover_empty_body') || 'Recipes ekranında bir tarifi açıp "Discover\'da paylaş" kutusunu işaretlersen, burada önizleme olarak görünür.') + '</div>';
      view.appendChild(empty);
      return;
    }

    // Grid header
    const gridHeader = PCD.el('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '10px', marginBottom: '10px' } });
    gridHeader.innerHTML =
      '<div style="font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-3);">' +
        PCD.escapeHtml(t('discover_my_public_heading') || 'Senin public tariflerin') +
        ' <span style="color:var(--brand-700);">(' + myPublics.length + ')</span>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-3);">' + PCD.escapeHtml(t('discover_preview_note') || 'Önizleme · sadece sen görüyorsun') + '</div>';
    view.appendChild(gridHeader);

    // Pinterest-style grid (CSS Grid auto-fit)
    const grid = PCD.el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' } });
    myPublics.forEach(function (r) {
      const card = PCD.el('div', {
        class: 'card',
        style: { padding: '0', cursor: 'pointer', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
        'data-recipe': r.id,
      });
      const photoStyle = r.photo
        ? 'background:url(' + r.photo + ') center/cover;'
        : 'background:linear-gradient(135deg,var(--brand-50),var(--surface-2));';
      card.innerHTML =
        '<div style="aspect-ratio:1/1;width:100%;' + photoStyle + 'display:flex;align-items:flex-end;justify-content:flex-start;padding:8px;">' +
          (r.photo ? '' : '<span style="font-size:32px;opacity:0.4;">🍽</span>') +
        '</div>' +
        '<div style="padding:10px 12px;">' +
          '<div style="font-weight:600;font-size:13px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + PCD.escapeHtml(r.name || '—') + '</div>' +
          '<div style="display:flex;gap:8px;margin-top:6px;font-size:11px;color:var(--text-3);align-items:center;">' +
            '<span style="opacity:0.5;">♡ —</span>' +
            '<span style="opacity:0.5;">👁 —</span>' +
            '<span style="margin-inline-start:auto;background:var(--brand-50);color:var(--brand-700);padding:2px 6px;border-radius:4px;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.04em;">' + PCD.escapeHtml(t('discover_chip_public') || 'Public') + '</span>' +
          '</div>' +
        '</div>';
      grid.appendChild(card);
    });
    view.appendChild(grid);

    // Card click → open recipe in Recipes tool
    PCD.on(view, 'click', '[data-recipe]', function () {
      const rid = this.getAttribute('data-recipe');
      if (rid && PCD.tools.recipes && PCD.tools.recipes.openEditor) {
        PCD.tools.recipes.openEditor(rid);
      } else {
        PCD.router.go('recipes');
      }
    });
  }

  // ============ EXPORT ============
  PCD.tools = PCD.tools || {};
  PCD.tools.discover = {
    render: render,
  };
})();
