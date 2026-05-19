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

   v2.9.7 — NAKED→RICH upgrade: closeable inline guide, sharer stats hero
   (my public count + status chip + total views/likes), guest welcome
   banner. Pattern: buffet v2.8.77, nutrition v2.9.3, allergens v2.9.5.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // Module-level cache — Discover sayfası her açıldığında fetch yapmamak için
  let _cachedFeed = null;
  let _cachedAt = 0;
  let _cachedMyLikes = null;
  const CACHE_TTL_MS = 60 * 1000;  // 60sn

  // v2.9.15 — Selected tag filter (resets on refresh + cache invalidation)
  let _selectedTag = null;
  // v2.9.16 — Selected "free-from" allergen filter (single, resets on refresh)
  let _freeFromAllergen = null;

  // v2.9.24 — Safe photo URL for CSS background-image (XSS defense).
  // Chef's photo URLs come from Supabase Storage (https://) or legacy
  // base64 data URLs. A malicious value could break out of url(...) and
  // inject CSS rules. URL is wrapped in double quotes in the caller, so
  // we only need to reject chars that close the quoted url("...") string.
  // v2.9.25 relax: parens `()` and single quote `'` are SAFE inside
  // `url("...")` double-quoted form — old regex rejected real photo URLs
  // with parens in filenames. Only `"`, `\`, newlines, angle brackets
  // can actually escape.
  function safePhotoUrl(raw) {
    if (!raw) return null; // null/undefined/empty — no photo, normal case (no warn)
    if (typeof raw !== 'string') {
      if (window.PCD && PCD.warn) PCD.warn('discover safePhotoUrl rejected (not string):', typeof raw, raw);
      return null;
    }
    const s = raw.trim();
    if (!s) return null;
    if (!/^(https?:\/\/|data:image\/)/i.test(s)) {
      if (window.PCD && PCD.warn) PCD.warn('discover safePhotoUrl rejected (bad scheme):', s.slice(0, 120));
      return null;
    }
    if (/["\\\r\n<>]/.test(s)) {
      if (window.PCD && PCD.warn) PCD.warn('discover safePhotoUrl rejected (unsafe chars):', s.slice(0, 120));
      return null;
    }
    return s;
  }

  // v2.9.7 — Sharer status (chef's contribution level signal)
  function sharerStatus(count) {
    if (count >= 10) return 'expert';
    if (count >= 5) return 'active';
    if (count >= 1) return 'started';
    return 'lurker';
  }
  function sharerColor(s) {
    if (s === 'expert' || s === 'active') return '#16a34a';
    if (s === 'started') return '#f59e0b';
    return '#6b7280';
  }
  function sharerLabel(s) {
    const t = PCD.i18n.t;
    if (s === 'expert') return t('discover_status_expert') || 'Expert sharer';
    if (s === 'active') return t('discover_status_active') || 'Active sharer';
    if (s === 'started') return t('discover_status_started') || 'Getting started';
    return t('discover_status_lurker') || 'Just browsing';
  }

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

  // v2.9.18 — Rate-limited view counter via Edge Function.
  // Anonymous + authenticated. Fire-and-forget. Server-side rate limit:
  // 60min window per (client IP + recipe). Backlog #7 kapatma.
  function bumpViewCount(recipeId) {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.functions.invoke('rate-limited-view', {
      body: { recipe_id: recipeId },
    })
      .then(function (res) {
        if (res && res.error) {
          PCD.warn && PCD.warn('discover: bumpViewCount edge function error', res.error);
        }
      })
      .catch(function () { /* ignore — fire-and-forget */ });
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
      _selectedTag = null; // v2.9.15 — reset tag filter on refresh
      _freeFromAllergen = null; // v2.9.16 — reset allergen filter on refresh
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

    // v2.9.7 — Closeable inline guide
    const guideHidden = (function () {
      try { return localStorage.getItem('pcd_discover_guide_hidden') === '1'; } catch (e) { return false; }
    })();
    if (!guideHidden) {
      const guide = PCD.el('details', { class: 'card', style: { padding: '0', marginBottom: '14px', background: 'linear-gradient(135deg,var(--brand-50),var(--surface))', border: '1px solid var(--brand-300)' } });
      guide.open = true;
      guide.innerHTML =
        '<summary style="cursor:pointer;padding:12px 14px;font-weight:700;font-size:13px;color:var(--brand-700);display:flex;align-items:center;gap:8px;list-style:none;">' +
          '<span style="font-size:16px;">💡</span>' +
          '<span style="flex:1;">' + PCD.escapeHtml(t('discover_guide_title') || 'How Discover works') + '</span>' +
          '<button type="button" id="discoverGuideDismiss" style="background:transparent;border:0;color:var(--text-3);cursor:pointer;font-size:11px;padding:2px 6px;" title="' + PCD.escapeHtml(t('discover_guide_dismiss') || 'Hide') + '">✕</button>' +
        '</summary>' +
        '<div style="padding:0 14px 14px;font-size:13px;color:var(--text-2);line-height:1.65;">' +
          '<ol style="margin:0;padding-inline-start:20px;">' +
            '<li><strong>' + PCD.escapeHtml(t('discover_guide_step1_title') || 'Browse what other chefs share') + '</strong> — ' + PCD.escapeHtml(t('discover_guide_step1_body') || 'Cards are ranked by view count — most popular first. Click a card for full ingredients, method, photo, and the chef behind it.') + '</li>' +
            '<li><strong>' + PCD.escapeHtml(t('discover_guide_step2_title') || 'Share your own recipes') + '</strong> — ' + PCD.escapeHtml(t('discover_guide_step2_body') || 'Open any recipe in your library and toggle "Public on Discover". Ingredients + method become visible — costs and supplier notes stay private.') + '</li>' +
            '<li><strong>' + PCD.escapeHtml(t('discover_guide_step3_title') || 'Track engagement') + '</strong> — ' + PCD.escapeHtml(t('discover_guide_step3_body') || 'Each recipe shows view count + heart count. Your hero stats above aggregate views/likes across all your public recipes — see what resonates.') + '</li>' +
            '<li><strong>' + PCD.escapeHtml(t('discover_guide_step4_title') || 'Your chef profile') + '</strong> — ' + PCD.escapeHtml(t('discover_guide_step4_body') || 'Name + location + workplace from Account → Profile appear under every shared recipe. Fill those in to build a recognisable identity in the community.') + '</li>' +
          '</ol>' +
          '<div style="margin-top:10px;padding:8px 10px;background:var(--surface-2);border-radius:6px;font-size:12px;color:var(--text-3);">' +
            '<strong>💎 ' + PCD.escapeHtml(t('discover_guide_tip_title') || 'Pro tip') + ':</strong> ' + PCD.escapeHtml(t('discover_guide_tip_body') || 'Start by sharing 3–5 of your signature dishes. The view counter takes 1–2 weeks to climb — early shares win the long game.') +
          '</div>' +
        '</div>';
      container.appendChild(guide);

      const dismiss = guide.querySelector('#discoverGuideDismiss');
      if (dismiss) dismiss.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        try { localStorage.setItem('pcd_discover_guide_hidden', '1'); } catch (er) {}
        renderFeed(container);
      });
    }

    // v2.9.7 — Stats hero (logged-in) or welcome banner (guest)
    const myRecipes = (PCD.store.listRecipes && PCD.store.listRecipes()) || [];
    const myPublics = myRecipes.filter(function (r) { return r && r.isPublic === true; });
    const myUid = currentUserId();
    // v2.8.85 — Live fallback için current user'ın adı (kendi recipe'lerinde
    // authorName henüz enrich edilmediyse). Email değil, manuel set edilen ad
    // veya Supabase metadata.full_name (auth.js _setUser ile alınmış).
    const myUser = (PCD.store && PCD.store.get && PCD.store.get('user')) || null;
    const myDisplayName = (myUser && myUser.name && myUser.name !== myUser.email) ? myUser.name : null;

    if (isLoggedIn()) {
      // Aggregate my stats from feed (top 60 only — view/like counts)
      let myTotalViews = 0;
      let myTotalLikes = 0;
      if (myUid) {
        feed.forEach(function (r) {
          if (r.user_id === myUid) {
            myTotalViews += (r.view_count || 0);
            myTotalLikes += (r.like_count || 0);
          }
        });
      }
      const shStatus = sharerStatus(myPublics.length);
      const shColor = sharerColor(shStatus);

      const hero = PCD.el('div', { class: 'stat', style: { marginBottom: '14px', background: 'linear-gradient(135deg,' + shColor + '18,var(--surface))', borderColor: shColor, padding: '18px' } });
      hero.innerHTML =
        '<div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:14px;">' +
          '<div style="flex-shrink:0;">' +
            '<div class="stat-label" style="font-size:11px;">' + PCD.escapeHtml(t('discover_my_public') || 'My public recipes') + '</div>' +
            '<div style="font-size:42px;font-weight:900;color:' + shColor + ';line-height:1;letter-spacing:-0.02em;">' + myPublics.length + '</div>' +
          '</div>' +
          '<div style="flex:1;min-width:180px;">' +
            '<span style="display:inline-block;padding:4px 10px;background:' + shColor + '25;color:' + shColor + ';font-weight:700;font-size:11px;text-transform:uppercase;border-radius:6px;letter-spacing:0.06em;">' + PCD.escapeHtml(sharerLabel(shStatus)) + '</span>' +
            '<div class="text-muted text-sm" style="font-size:11px;margin-top:5px;line-height:1.4;">' + PCD.escapeHtml(t('discover_share_target') || 'Share 5+ recipes to become an active sharer in the community') + '</div>' +
          '</div>' +
          '<button class="btn btn-outline btn-sm" id="discoverGotoRecipes" style="align-self:flex-end;">' + PCD.escapeHtml(t('discover_share_more') || 'Share more') + '</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div><div class="stat-label" style="font-size:11px;">' + PCD.escapeHtml(t('discover_total_views') || 'Total views') + '</div><div style="font-size:18px;font-weight:700;color:var(--text-2);">' + myTotalViews + '</div></div>' +
          '<div><div class="stat-label" style="font-size:11px;">' + PCD.escapeHtml(t('discover_total_likes') || 'Total likes') + '</div><div style="font-size:18px;font-weight:700;color:var(--danger);">' + myTotalLikes + '</div></div>' +
        '</div>';
      container.appendChild(hero);
    } else {
      const banner = PCD.el('div', { class: 'card', style: { padding: '12px 16px', marginBottom: '14px', background: 'var(--surface-2)' } });
      banner.innerHTML =
        '<div style="font-size:13px;color:var(--text-2);line-height:1.5;">' +
          '<strong style="color:var(--text-1);">' + PCD.escapeHtml(t('discover_guest_intro') || 'Hoş geldin — toplulukta paylaşılan tarifleri keşfedebilirsin.') + '</strong>' +
        '</div>';
      container.appendChild(banner);
    }
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

    // v2.9.15 — Tag filter chip row (backlog #3)
    // Aggregate unique tags across feed (case-insensitive normalized to lower).
    const tagCounts = {};
    feed.forEach(function (r) {
      const tags = (r.data && Array.isArray(r.data.tags)) ? r.data.tags : [];
      tags.forEach(function (tg) {
        if (!tg || typeof tg !== 'string') return;
        const norm = tg.trim();
        if (!norm) return;
        tagCounts[norm] = (tagCounts[norm] || 0) + 1;
      });
    });
    const allTags = Object.keys(tagCounts).sort(function (a, b) { return tagCounts[b] - tagCounts[a]; });
    if (allTags.length > 0) {
      const tagBar = PCD.el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center' } });
      let html = '<span style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-3);font-weight:700;margin-inline-end:4px;">' + PCD.escapeHtml(t('discover_filter_label') || 'Filter') + ':</span>';
      const allActive = !_selectedTag;
      html += '<button type="button" class="chip" data-disc-tag="" style="cursor:pointer;padding:3px 10px;font-size:11px;' + (allActive ? 'background:var(--brand-600);color:white;font-weight:700;' : 'background:var(--surface-2);color:var(--text-2);') + '">' + PCD.escapeHtml(t('discover_filter_all') || 'All') + ' · ' + feed.length + '</button>';
      allTags.slice(0, 20).forEach(function (tg) {
        const active = _selectedTag && _selectedTag.toLowerCase() === tg.toLowerCase();
        html += '<button type="button" class="chip" data-disc-tag="' + PCD.escapeHtml(tg) + '" style="cursor:pointer;padding:3px 10px;font-size:11px;' + (active ? 'background:var(--brand-600);color:white;font-weight:700;' : 'background:var(--surface-2);color:var(--text-2);') + '">' + PCD.escapeHtml(tg) + ' · ' + tagCounts[tg] + '</button>';
      });
      tagBar.innerHTML = html;
      container.appendChild(tagBar);

      PCD.on(tagBar, 'click', '[data-disc-tag]', function () {
        const tg = this.getAttribute('data-disc-tag');
        _selectedTag = tg || null;
        renderGrid(container, feed, myLikes);
      });
    }

    // v2.9.16 — Free-from allergen filter chip row (backlog #3 second half)
    // Aggregate allergens across feed using embedded r.data.computedAllergens.
    // Only show chips for allergens that appear in at least 1 recipe.
    const allergenCounts = {};
    feed.forEach(function (r) {
      const allergens = (r.data && Array.isArray(r.data.computedAllergens)) ? r.data.computedAllergens : [];
      allergens.forEach(function (a) {
        if (!a) return;
        allergenCounts[a] = (allergenCounts[a] || 0) + 1;
      });
    });
    const allergenKeys = Object.keys(allergenCounts).sort(function (a, b) { return allergenCounts[b] - allergenCounts[a]; });
    if (allergenKeys.length > 0) {
      const aBar = PCD.el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center' } });
      let html = '<span style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-3);font-weight:700;margin-inline-end:4px;">' + PCD.escapeHtml(t('discover_free_from_label') || 'Free from') + ':</span>';
      const allActive = !_freeFromAllergen;
      html += '<button type="button" class="chip" data-disc-free="" style="cursor:pointer;padding:3px 10px;font-size:11px;' + (allActive ? 'background:var(--brand-600);color:white;font-weight:700;' : 'background:var(--surface-2);color:var(--text-2);') + '">' + PCD.escapeHtml(t('discover_free_from_all') || 'Any') + '</button>';
      // Get the allergen labels with icons via allergensDB
      const aDb = PCD.allergensDB && PCD.allergensDB.list ? PCD.allergensDB.list : [];
      const aIconMap = {};
      aDb.forEach(function (a) { aIconMap[a.key] = a.icon; });
      allergenKeys.slice(0, 8).forEach(function (ak) {
        const active = _freeFromAllergen && _freeFromAllergen === ak;
        const label = t('allerg_' + ak) || ak;
        const shortLabel = label.split(' ')[0];
        const icon = aIconMap[ak] || '';
        html += '<button type="button" class="chip" data-disc-free="' + PCD.escapeHtml(ak) + '" style="cursor:pointer;padding:3px 10px;font-size:11px;' + (active ? 'background:var(--brand-600);color:white;font-weight:700;' : 'background:var(--surface-2);color:var(--text-2);') + '">' + icon + ' ' + PCD.escapeHtml(shortLabel) + '</button>';
      });
      aBar.innerHTML = html;
      container.appendChild(aBar);

      PCD.on(aBar, 'click', '[data-disc-free]', function () {
        const ak = this.getAttribute('data-disc-free');
        _freeFromAllergen = ak || null;
        renderGrid(container, feed, myLikes);
      });
    }

    // v2.9.15 — Apply tag filter + v2.9.16 — Apply free-from allergen filter to feed
    let filteredFeed = feed;
    if (_selectedTag) {
      filteredFeed = filteredFeed.filter(function (r) {
        const tags = (r.data && Array.isArray(r.data.tags)) ? r.data.tags : [];
        return tags.some(function (tg) { return tg && tg.toLowerCase() === _selectedTag.toLowerCase(); });
      });
    }
    if (_freeFromAllergen) {
      filteredFeed = filteredFeed.filter(function (r) {
        const allergens = (r.data && Array.isArray(r.data.computedAllergens)) ? r.data.computedAllergens : [];
        return allergens.indexOf(_freeFromAllergen) < 0; // recipe must NOT contain the allergen
      });
    }

    if (filteredFeed.length === 0) {
      const empty = PCD.el('div', { class: 'card', style: { padding: '24px 20px', textAlign: 'center', marginTop: '8px' } });
      empty.innerHTML = '<div style="color:var(--text-3);font-size:13px;">' + PCD.escapeHtml(t('discover_filter_empty') || 'No recipes match this tag.') + '</div>';
      container.appendChild(empty);
      return;
    }

    // Sıralama: en çok görüntülenen üstte
    const grid = PCD.el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' } });
    filteredFeed.forEach(function (r) {
      const d = r.data || {};
      const isMine = (myUid && r.user_id === myUid);
      const liked = !!myLikes[r.id];
      const card = PCD.el('div', {
        class: 'card',
        style: { padding: '0', cursor: 'pointer', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' },
        'data-recipe': r.id,
        'data-mine': isMine ? '1' : '0',
      });
      // v2.9.24 — XSS-safe: validate URL pattern, reject if suspect
      // v2.9.27 — Temporary debug log to identify photo sync issue
      if (window.PCD && PCD.warn) {
        PCD.warn('discover card photo for "' + (d.name || '?') + '":',
          d.photo ? ('LENGTH=' + d.photo.length + ' START=' + String(d.photo).slice(0, 80)) : 'EMPTY/NULL');
      }
      const safePhoto = safePhotoUrl(d.photo);
      const photoStyle = safePhoto
        ? 'background:url("' + safePhoto + '") center/cover;'
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
          // v2.8.81 — Author satırı. v2.8.85: kendi recipe'imizse ve authorName
          // boşsa myDisplayName live fallback (Save profile gerekmez, anında
          // görünür). Başkasının recipe'i ise sadece authorName veya Anonim.
          (function () {
            const liveAuthor = d.authorName || (isMine && myDisplayName) || null;
            return liveAuthor
              ? '<div style="font-size:11px;color:var(--text-3);margin-top:3px;line-height:1.2;">' + PCD.escapeHtml(t('discover_by_chef', { name: liveAuthor })) + '</div>'
              : '<div style="font-size:11px;color:var(--text-3);margin-top:3px;line-height:1.2;font-style:italic;opacity:0.7;">' + PCD.escapeHtml(t('discover_anonymous_chef')) + '</div>';
          })() +
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
    // v2.8.85 — Live fallback: kendi recipe'imizse + authorName boşsa current
    // user.name göster (Save profile gerekmez, anında doğru görünür).
    const myUid = currentUserId();
    const isMine = (myUid && recipe.user_id === myUid);
    const myUser = (PCD.store && PCD.store.get && PCD.store.get('user')) || null;
    const myDisplayName = (myUser && myUser.name && myUser.name !== myUser.email) ? myUser.name : null;
    const liveAuthor = d.authorName || (isMine && myDisplayName) || null;

    const body = PCD.el('div');
    const ingsHtml = (d.ingredients && d.ingredients.length)
      ? '<div style="font-size:13px;line-height:1.7;">' +
          d.ingredients.map(function (ri) {
            // v2.8.52 — Separator satırı
            if (ri && ri.separator) {
              const lbl = ri.label
                ? '<div style="font-weight:700;color:var(--text-3);font-size:11px;text-transform:uppercase;letter-spacing:0.04em;margin:8px 0 2px;">' + PCD.escapeHtml(ri.label) + '</div>'
                : '';
              return '<div style="border-top:1px dashed var(--border);margin:6px 0;"></div>' + lbl;
            }
            const qty = (ri.qty != null && ri.qty !== '') ? ri.qty
                       : (ri.amount != null && ri.amount !== '') ? ri.amount : '';
            const unit = ri.unit || '';
            return '<div>• ' + PCD.escapeHtml(String(qty)) + ' ' + PCD.escapeHtml(unit) + ' — ' + PCD.escapeHtml(ri.ingredientName || ri.name || '(?)') + '</div>';
          }).join('') +
        '</div>'
      : '<div class="text-muted text-sm">' + PCD.escapeHtml(t('discover_no_ingredients') || 'Malzeme listesi yok.') + '</div>';

    const stepsHtml = d.steps
      ? '<div style="white-space:pre-wrap;line-height:1.7;font-size:14px;">' + PCD.escapeHtml(d.steps) + '</div>'
      : '<div class="text-muted text-sm">' + PCD.escapeHtml(t('discover_no_steps') || 'Hazırlanış yazılmamış.') + '</div>';

    // v2.9.24 — XSS-safe photo URL for detail modal
    const safeDetailPhoto = safePhotoUrl(d.photo);
    body.innerHTML =
      (safeDetailPhoto ? '<div style="aspect-ratio:1/1;width:100%;max-width:360px;background:url(\"' + safeDetailPhoto + '\") center/cover;border-radius:var(--r-md);margin:0 auto 12px;"></div>' : '') +
      // v2.8.81 — Author satırı (detail modal). v2.8.85: liveAuthor fallback
      // ile kendi recipe'lerinde anında doğru ad görünür.
      (liveAuthor
        ? '<div style="font-size:13px;color:var(--text-2);margin-bottom:10px;display:flex;align-items:center;gap:6px;">👨‍🍳 <strong>' + PCD.escapeHtml(t('discover_by_chef', { name: liveAuthor })) + '</strong></div>'
        : '<div style="font-size:13px;color:var(--text-3);margin-bottom:10px;display:flex;align-items:center;gap:6px;font-style:italic;">👨‍🍳 ' + PCD.escapeHtml(t('discover_anonymous_chef')) + '</div>') +
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
