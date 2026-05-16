/* ================================================================
   ProChefDesk — discover.js (v2.8.46 — Faz 2)
   Discover — Public recipe feed

   Faz 1 (v2.8.41): frontend skeleton, kullanıcı sadece kendi public
   recipe'lerinin önizlemesini görüyordu.

   Faz 2 (v2.8.46) — BACKEND DEVRİYE GİRDİ:
     - Supabase RLS: anonymous + authenticated user public recipe'leri
       okuyabilir (sadece data->>'isPublic' = 'true' olanlar).
     - recipe_likes tablosu: per-user like flag. recipes.like_count
       trigger ile senkron.
     - recipes.view_count: increment_recipe_view RPC ile artırılır
       (anonymous bile çağırabilir).
     - Discover sayfası gerçek public feed gösteriyor — diğer şeflerin
       public recipe'leri, en çok görüntülenen / beğenilen sıralamayla.
     - Recipe card tıklanınca view_count +1 ve detail modal açılır.
     - Login user like butonuyla toggle yapabilir.

   Tek bir noktada işlemiyor: misafir kullanıcı (login yok) like
   atamaz — butona basınca "giriş yap" toast'ı görür.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // Module-level cache — Discover sayfası her açıldığında fetch yapmamak için
  let _cachedFeed = null;
  let _cachedAt = 0;
  let _cachedMyLikes = null;
  const CACHE_TTL_MS = 60 * 1000;  // 60sn

  function getSupabase() {
    if (!PCD.cloud || !PCD.cloud.getClient) return null;
    return PCD.cloud.getClient();
  }

  function isLoggedIn() {
    const u = PCD.store && PCD.store.get && PCD.store.get('user');
    return !!(u && u.id);
  }

  function currentUserId() {
    const u = PCD.store && PCD.store.get && PCD.store.get('user');
    return (u && u.id) || null;
  }

  // ============ FETCHERS ============
  // Public feed: tüm public recipe'leri view_count DESC ile çek (max 60).
  // İlk fetch RLS check'ten geçer — anon key + auth token ne olursa olsun
  // sadece isPublic=true olanlar döner.
  function fetchPublicFeed() {
    const supabase = getSupabase();
    if (!supabase) return Promise.resolve([]);
    return supabase.from('recipes')
      .select('id, user_id, data, view_count, like_count, updated_at')
      .order('view_count', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(60)
      .then(function (res) {
        if (res.error) {
          PCD.warn && PCD.warn('discover: fetchPublicFeed error', res.error);
          return [];
        }
        // RLS zaten filtreliyor ama defansif: data.isPublic check'i tekrarla
        return (res.data || []).filter(function (r) {
          return r.data && r.data.isPublic === true;
        });
      })
      .catch(function (e) {
        PCD.warn && PCD.warn('discover: fetchPublicFeed exception', e);
        return [];
      });
  }

  // Kullanıcının like'ladığı recipe id seti. Login değilse boş.
  function fetchMyLikes() {
    if (!isLoggedIn()) return Promise.resolve({});
    const supabase = getSupabase();
    if (!supabase) return Promise.resolve({});
    const uid = currentUserId();
    return supabase.from('recipe_likes')
      .select('recipe_id')
      .eq('user_id', uid)
      .then(function (res) {
        if (res.error) {
          PCD.warn && PCD.warn('discover: fetchMyLikes error', res.error);
          return {};
        }
        const set = {};
        (res.data || []).forEach(function (r) { set[r.recipe_id] = true; });
        return set;
      })
      .catch(function (e) {
        PCD.warn && PCD.warn('discover: fetchMyLikes exception', e);
        return {};
      });
  }

  // Increment view counter (anonymous + authenticated). Fire-and-forget.
  function bumpViewCount(recipeId) {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.rpc('increment_recipe_view', { _recipe_id: recipeId })
      .then(function (res) {
        if (res.error) {
          PCD.warn && PCD.warn('discover: bumpViewCount error', res.error);
        }
      })
      .catch(function () { /* ignore */ });
  }

  // Toggle like. Auth gerekir. Optimistic UI — UI önce güncellenir, sonra DB.
  function toggleLike(recipeId, currentlyLiked) {
    if (!isLoggedIn()) {
      PCD.toast.warning(PCD.i18n.t('discover_login_required'));
      return Promise.resolve({ liked: currentlyLiked });
    }
    const supabase = getSupabase();
    if (!supabase) return Promise.resolve({ liked: currentlyLiked });
    const uid = currentUserId();
    if (currentlyLiked) {
      return supabase.from('recipe_likes')
        .delete()
        .eq('recipe_id', recipeId)
        .eq('user_id', uid)
        .then(function (res) {
          if (res.error) {
            PCD.warn && PCD.warn('discover: unlike error', res.error);
            return { liked: currentlyLiked };  // rollback hint
          }
          return { liked: false };
        })
        .catch(function () { return { liked: currentlyLiked }; });
    } else {
      return supabase.from('recipe_likes')
        .insert({ recipe_id: recipeId, user_id: uid })
        .then(function (res) {
          if (res.error) {
            PCD.warn && PCD.warn('discover: like error', res.error);
            return { liked: currentlyLiked };
          }
          return { liked: true };
        })
        .catch(function () { return { liked: currentlyLiked }; });
    }
  }

  // ============ RENDER ============
  function render(view) {
    const t = PCD.i18n.t;

    view.innerHTML =
      '<div class="page-header">' +
        '<div class="page-header-text">' +
          '<div class="page-title">🌍 ' + PCD.escapeHtml(t('discover_title')) + '</div>' +
          '<div class="page-subtitle">' + PCD.escapeHtml(t('discover_subtitle_live') || 'Şefler arası tarif paylaşımı · En çok görüntülenenler') + '</div>' +
        '</div>' +
        '<div class="page-header-actions">' +
          '<button class="btn btn-outline btn-sm" id="discoverRefresh">' + PCD.icon('refresh', 14) + ' <span>' + PCD.escapeHtml(t('discover_refresh') || 'Yenile') + '</span></button>' +
        '</div>' +
      '</div>';

    const feedContainer = PCD.el('div', { id: 'discoverFeed', style: { marginTop: '14px' } });
    view.appendChild(feedContainer);

    // Loading state
    feedContainer.innerHTML =
      '<div class="card" style="padding:32px 20px;text-align:center;">' +
        '<div style="font-size:14px;color:var(--text-3);">' + PCD.escapeHtml(t('discover_loading') || 'Yükleniyor…') + '</div>' +
      '</div>';

    PCD.$('#discoverRefresh', view).addEventListener('click', function () {
      _cachedFeed = null;
      _cachedMyLikes = null;
      _cachedAt = 0;
      renderFeed(feedContainer);
    });

    renderFeed(feedContainer);
  }

  function renderFeed(container) {
    const t = PCD.i18n.t;
    const now = Date.now();
    const cacheValid = _cachedFeed && (now - _cachedAt < CACHE_TTL_MS);

    const feedPromise = cacheValid ? Promise.resolve(_cachedFeed) : fetchPublicFeed();
    const likesPromise = cacheValid ? Promise.resolve(_cachedMyLikes || {}) : fetchMyLikes();

    Promise.all([feedPromise, likesPromise]).then(function (results) {
      const feed = results[0];
      const myLikes = results[1];
      if (!cacheValid) {
        _cachedFeed = feed;
        _cachedMyLikes = myLikes;
        _cachedAt = Date.now();
      }
      renderGrid(container, feed, myLikes);
    });
  }

  function renderGrid(container, feed, myLikes) {
    const t = PCD.i18n.t;
    container.innerHTML = '';

    // Üst banner: kullanıcının kendi public recipe sayısı + paylaşma çağrısı
    const myRecipes = (PCD.store.listRecipes && PCD.store.listRecipes()) || [];
    const myPublics = myRecipes.filter(function (r) { return r && r.isPublic === true; });
    const myUid = currentUserId();
    const banner = PCD.el('div', { class: 'card', style: { padding: '12px 16px', marginBottom: '14px', background: 'var(--surface-2)' } });
    banner.innerHTML =
      '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:200px;font-size:13px;color:var(--text-2);line-height:1.5;">' +
          '<strong style="color:var(--text-1);">' + (isLoggedIn() ? PCD.escapeHtml(t('discover_my_count_label', { n: myPublics.length })) : PCD.escapeHtml(t('discover_guest_intro') || 'Hoş geldin — toplulukta paylaşılan tarifleri keşfedebilirsin.')) + '</strong>' +
        '</div>' +
        (isLoggedIn() ? '<button class="btn btn-outline btn-sm" id="discoverGotoRecipes">' + PCD.escapeHtml(t('discover_share_more') || 'Daha çok paylaş') + '</button>' : '') +
      '</div>';
    container.appendChild(banner);
    const gotoBtn = PCD.$('#discoverGotoRecipes', container);
    if (gotoBtn) gotoBtn.addEventListener('click', function () { PCD.router.go('recipes'); });

    if (!feed || feed.length === 0) {
      const empty = PCD.el('div', { class: 'card', style: { padding: '32px 20px', textAlign: 'center' } });
      empty.innerHTML =
        '<div style="font-size:42px;margin-bottom:8px;">📖</div>' +
        '<div style="font-weight:600;font-size:15px;margin-bottom:4px;">' + PCD.escapeHtml(t('discover_feed_empty_title') || 'Henüz tarif yok') + '</div>' +
        '<div style="color:var(--text-2);font-size:13px;line-height:1.5;max-width:380px;margin:0 auto;">' + PCD.escapeHtml(t('discover_feed_empty_body') || 'İlk paylaşan sen ol — bir tarifi açıp "Discover\'da paylaş" işaretle.') + '</div>';
      container.appendChild(empty);
      return;
    }

    // Sıralama: en çok görüntülenen üstte
    const grid = PCD.el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' } });
    feed.forEach(function (r) {
      const d = r.data || {};
      const isMine = (myUid && r.user_id === myUid);
      const liked = !!myLikes[r.id];
      const card = PCD.el('div', {
        class: 'card',
        style: { padding: '0', cursor: 'pointer', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' },
        'data-recipe': r.id,
        'data-mine': isMine ? '1' : '0',
      });
      const photoStyle = d.photo
        ? 'background:url(' + d.photo + ') center/cover;'
        : 'background:linear-gradient(135deg,var(--brand-50),var(--surface-2));';
      const heartIcon = liked ? '❤' : '♡';
      const heartColor = liked ? 'var(--danger)' : 'var(--text-3)';
      card.innerHTML =
        '<div style="aspect-ratio:1/1;width:100%;' + photoStyle + 'display:flex;align-items:flex-start;justify-content:flex-end;padding:8px;position:relative;">' +
          (!d.photo ? '<span style="font-size:32px;opacity:0.4;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);">🍽</span>' : '') +
          (isMine ? '<span style="background:rgba(255,255,255,0.92);color:var(--brand-700);padding:2px 7px;border-radius:4px;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:0.04em;">' + PCD.escapeHtml(t('discover_chip_mine') || 'Seninki') + '</span>' : '') +
        '</div>' +
        '<div style="padding:10px 12px;">' +
          '<div style="font-weight:600;font-size:13px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:34px;">' + PCD.escapeHtml(d.name || '—') + '</div>' +
          '<div style="display:flex;gap:10px;margin-top:6px;font-size:12px;color:var(--text-3);align-items:center;">' +
            '<button data-like="' + PCD.escapeHtml(r.id) + '" data-liked="' + (liked ? '1' : '0') + '" class="btn-like" style="background:transparent;border:0;padding:2px 4px;cursor:pointer;color:' + heartColor + ';font-size:13px;display:inline-flex;align-items:center;gap:3px;" title="' + PCD.escapeHtml(t('discover_like_tip') || 'Beğen') + '">' +
              '<span style="font-size:14px;">' + heartIcon + '</span>' +
              '<span data-like-count>' + (r.like_count || 0) + '</span>' +
            '</button>' +
            '<span style="display:inline-flex;align-items:center;gap:3px;">👁 ' + (r.view_count || 0) + '</span>' +
          '</div>' +
        '</div>';
      grid.appendChild(card);
    });
    container.appendChild(grid);

    // Card tıklama → detail modal + view count bump
    PCD.on(container, 'click', '[data-recipe]', function (ev) {
      // Like button tıklamasını dışla
      if (ev.target.closest('[data-like]')) return;
      const rid = this.getAttribute('data-recipe');
      const recipe = feed.find(function (r) { return r.id === rid; });
      if (!recipe) return;
      bumpViewCount(rid);
      // Local view count'u optimistic güncelle
      recipe.view_count = (recipe.view_count || 0) + 1;
      openPublicRecipeDetail(recipe, myLikes);
    });

    // Like buton tıklama → optimistic toggle
    PCD.on(container, 'click', '[data-like]', function (ev) {
      ev.stopPropagation();
      const rid = this.getAttribute('data-like');
      const wasLiked = this.getAttribute('data-liked') === '1';
      if (!isLoggedIn()) {
        PCD.toast.warning(PCD.i18n.t('discover_login_required'));
        return;
      }
      // Optimistic UI
      const newLiked = !wasLiked;
      this.setAttribute('data-liked', newLiked ? '1' : '0');
      this.style.color = newLiked ? 'var(--danger)' : 'var(--text-3)';
      this.querySelector('span').textContent = newLiked ? '❤' : '♡';
      const countEl = this.querySelector('[data-like-count]');
      const curCount = parseInt(countEl.textContent, 10) || 0;
      countEl.textContent = String(Math.max(0, curCount + (newLiked ? 1 : -1)));
      // Mevcut myLikes set'ini de güncelle (cache)
      if (myLikes) {
        if (newLiked) myLikes[rid] = true;
        else delete myLikes[rid];
      }
      // Feed cache'inde like_count'u senkron tut
      const rec = feed.find(function (r) { return r.id === rid; });
      if (rec) rec.like_count = Math.max(0, (rec.like_count || 0) + (newLiked ? 1 : -1));

      toggleLike(rid, wasLiked).then(function (res) {
        // Backend rollback gerektiriyorsa UI'ı geri al
        if (res.liked !== newLiked) {
          this.setAttribute('data-liked', res.liked ? '1' : '0');
          this.style.color = res.liked ? 'var(--danger)' : 'var(--text-3)';
          this.querySelector('span').textContent = res.liked ? '❤' : '♡';
          countEl.textContent = String(Math.max(0, curCount));
          PCD.toast.error(PCD.i18n.t('discover_like_failed') || 'Beğeni kaydedilemedi');
        }
      }.bind(this));
    });
  }

  // ============ PUBLIC RECIPE DETAIL (read-only) ============
  // Başkasının tarifini düzenlemeden görüntülemek için kompakt modal.
  // Recipes tool'un editor'ünden farklı — sadece okunur, save/edit yok.
  function openPublicRecipeDetail(recipe, myLikes) {
    const t = PCD.i18n.t;
    const d = recipe.data || {};
    const liked = !!(myLikes && myLikes[recipe.id]);

    const body = PCD.el('div');
    const ingsHtml = (d.ingredients && d.ingredients.length)
      ? '<div style="font-size:13px;line-height:1.7;">' +
          d.ingredients.map(function (ri) {
            const qty = (ri.qty != null && ri.qty !== '') ? ri.qty : '';
            const unit = ri.unit || '';
            return '<div>• ' + PCD.escapeHtml(qty) + ' ' + PCD.escapeHtml(unit) + ' — ' + PCD.escapeHtml(ri.ingredientName || ri.name || '(?)') + '</div>';
          }).join('') +
        '</div>'
      : '<div class="text-muted text-sm">' + PCD.escapeHtml(t('discover_no_ingredients') || 'Malzeme listesi yok.') + '</div>';

    const stepsHtml = d.steps
      ? '<div style="white-space:pre-wrap;line-height:1.7;font-size:14px;">' + PCD.escapeHtml(d.steps) + '</div>'
      : '<div class="text-muted text-sm">' + PCD.escapeHtml(t('discover_no_steps') || 'Hazırlanış yazılmamış.') + '</div>';

    body.innerHTML =
      (d.photo ? '<div style="aspect-ratio:16/9;width:100%;background:url(' + d.photo + ') center/cover;border-radius:var(--r-md);margin-bottom:12px;"></div>' : '') +
      '<div style="display:flex;gap:14px;margin-bottom:14px;font-size:12px;color:var(--text-3);">' +
        '<span>👁 ' + (recipe.view_count || 0) + '</span>' +
        '<span>❤ ' + (recipe.like_count || 0) + '</span>' +
        (d.prepTime ? '<span>⏱ ' + PCD.escapeHtml(t('recipes_prep_time')) + ': ' + d.prepTime + ' min</span>' : '') +
        (d.cookTime ? '<span>🔥 ' + PCD.escapeHtml(t('recipes_cook_time')) + ': ' + d.cookTime + ' min</span>' : '') +
      '</div>' +
      '<div style="font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-3);margin-bottom:6px;">' + PCD.escapeHtml(t('recipe_ingredients') || 'Malzemeler') + '</div>' +
      ingsHtml +
      '<div style="font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-3);margin:14px 0 6px 0;">' + PCD.escapeHtml(t('recipe_steps') || 'Hazırlanış') + '</div>' +
      stepsHtml;

    const likeBtn = PCD.el('button', {
      class: 'btn ' + (liked ? 'btn-danger' : 'btn-outline'),
      style: { flex: '1' }
    });
    likeBtn.innerHTML = (liked ? '❤ ' : '♡ ') + PCD.escapeHtml(liked ? (t('discover_unlike_btn') || 'Beğeniden çıkar') : (t('discover_like_btn') || 'Beğen')) + ' · ' + (recipe.like_count || 0);
    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('close'), style: { flexShrink: '0' } });

    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } });
    footer.appendChild(closeBtn);
    footer.appendChild(likeBtn);

    const m = PCD.modal.open({
      title: '🌍 ' + (d.name || ''),
      body: body, footer: footer, size: 'md', closable: true,
    });
    closeBtn.addEventListener('click', function () { m.close(); });

    let curLiked = liked;
    likeBtn.addEventListener('click', function () {
      if (!isLoggedIn()) {
        PCD.toast.warning(PCD.i18n.t('discover_login_required'));
        return;
      }
      const wasLiked = curLiked;
      const newLiked = !wasLiked;
      // Optimistic
      curLiked = newLiked;
      recipe.like_count = Math.max(0, (recipe.like_count || 0) + (newLiked ? 1 : -1));
      if (myLikes) {
        if (newLiked) myLikes[recipe.id] = true;
        else delete myLikes[recipe.id];
      }
      likeBtn.className = 'btn ' + (newLiked ? 'btn-danger' : 'btn-outline');
      likeBtn.innerHTML = (newLiked ? '❤ ' : '♡ ') + PCD.escapeHtml(newLiked ? (t('discover_unlike_btn') || 'Beğeniden çıkar') : (t('discover_like_btn') || 'Beğen')) + ' · ' + recipe.like_count;
      toggleLike(recipe.id, wasLiked).then(function (res) {
        if (res.liked !== newLiked) {
          // Rollback
          curLiked = wasLiked;
          recipe.like_count = Math.max(0, (recipe.like_count || 0) + (wasLiked ? 1 : -1));
          likeBtn.className = 'btn ' + (wasLiked ? 'btn-danger' : 'btn-outline');
          likeBtn.innerHTML = (wasLiked ? '❤ ' : '♡ ') + PCD.escapeHtml(wasLiked ? (t('discover_unlike_btn') || 'Beğeniden çıkar') : (t('discover_like_btn') || 'Beğen')) + ' · ' + recipe.like_count;
          PCD.toast.error(PCD.i18n.t('discover_like_failed') || 'Beğeni kaydedilemedi');
        }
      });
    });
  }

  // ============ EXPORT ============
  PCD.tools = PCD.tools || {};
  PCD.tools.discover = {
    render: render,
  };
})();
