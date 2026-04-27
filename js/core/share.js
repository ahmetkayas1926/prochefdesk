/* ================================================================
   ProChefDesk — share.js
   Public share URLs for recipes & menus.

   Architecture:
   - Each share gets a random 8-char ID (e.g. ?share=abc12345)
   - Share record stored in Supabase 'public_shares' table:
       { id, kind, payload, owner_id, created_at }
   - 'public_shares' table needs RLS policy:
       SELECT — anyone (anon role)
       INSERT — authenticated only
       UPDATE/DELETE — owner only
   - URL format: prochefdesk.com/?share=abc12345
   - On boot, app.js checks for ?share param and routes to public view

   The share payload is a SNAPSHOT (frozen copy) — if owner edits the
   recipe later, public link still shows the original. This is desired
   behavior (predictable, cacheable, no privacy leak).
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function genShareId() {
    // 8-char base36 random ID
    return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  }

  // Build a self-contained snapshot of a recipe with embedded ingredient details
  function snapshotRecipe(rid) {
    const r = PCD.store.getRecipe(rid);
    if (!r) return null;
    const ingMap = {};
    PCD.store.listIngredients().forEach(function (i) { ingMap[i.id] = i; });
    // Embed ingredient names + units inline so public viewer doesn't need the user's library
    const ingredients = (r.ingredients || []).map(function (ri) {
      const ing = ingMap[ri.ingredientId];
      return {
        name: ing ? ing.name : '?',
        amount: ri.amount,
        unit: ri.unit || (ing && ing.unit) || '',
      };
    });
    return {
      kind: 'recipe',
      name: r.name,
      category: r.category,
      servings: r.servings,
      prepTime: r.prepTime,
      cookTime: r.cookTime,
      photo: r.photo,
      ingredients: ingredients,
      steps: r.steps,
      plating: r.plating,
      allergens: r.allergens,
      sharedAt: new Date().toISOString(),
    };
  }

  function snapshotMenu(mid) {
    const m = PCD.store.getFromTable('menus', mid);
    if (!m) return null;
    const recipes = PCD.store.listRecipes();
    const recipeMap = {};
    recipes.forEach(function (r) { recipeMap[r.id] = r; });

    const sections = (m.sections || []).map(function (sec) {
      return {
        title: sec.title,
        items: (sec.items || []).map(function (it) {
          const r = it.recipeId ? recipeMap[it.recipeId] : null;
          return {
            name: it.recipeId ? (r ? r.name : '(removed)') : it.customName,
            description: it.description || (r && r.plating) || '',
            price: it.price,
          };
        }).filter(function (x) { return x.name; }),
      };
    });
    return {
      kind: 'menu',
      name: m.name,
      subtitle: m.subtitle,
      footer: m.footer,
      sections: sections,
      hidePrices: m.hidePrices,
      printDensity: m.printDensity,
      sharedAt: new Date().toISOString(),
    };
  }

  // Get or create a share for a recipe/menu. Returns Promise resolving to URL.
  function createOrGetShareUrl(kind, id) {
    return new Promise(function (resolve, reject) {
      if (!PCD.cloud || !PCD.cloud.ready) {
        // No cloud → can't share. Fallback: nothing.
        return reject(new Error('Cloud not configured'));
      }
      const supabase = window._supabaseClient;
      if (!supabase) return reject(new Error('Supabase client missing'));
      const user = PCD.store.get('user');
      if (!user || !user.id) return reject(new Error('Sign in to share'));

      const payload = (kind === 'recipe') ? snapshotRecipe(id) : snapshotMenu(id);
      if (!payload) return reject(new Error('Item not found'));

      const shareId = genShareId();
      console.log('[Share] Creating share:', shareId, 'for', kind, id);
      supabase.from('public_shares').insert({
        id: shareId,
        kind: kind,
        payload: payload,
        owner_id: user.id,
        created_at: new Date().toISOString(),
      }).then(function (res) {
        if (res.error) {
          console.error('[Share] insert error:', res.error);
          PCD.err('share insert error', res.error);
          return reject(new Error(res.error.message || 'Insert failed'));
        }
        console.log('[Share] Created OK:', shareId);
        const url = location.origin + location.pathname + '?share=' + shareId;
        resolve(url);
      }).catch(function (err) {
        console.error('[Share] insert catch:', err);
        reject(err);
      });
    });
  }

  // Fetch a public share by ID — used when ?share= is in URL
  function fetchShare(shareId) {
    return new Promise(function (resolve, reject) {
      const supabase = window._supabaseClient;
      if (!supabase) {
        console.error('[Share] Supabase client missing');
        return reject(new Error('Supabase client missing'));
      }
      console.log('[Share] Fetching share:', shareId);
      supabase.from('public_shares').select('*').eq('id', shareId).maybeSingle()
        .then(function (res) {
          if (res.error) {
            console.error('[Share] fetch error:', res.error);
            return reject(new Error(res.error.message || 'Database error'));
          }
          if (!res.data) {
            console.warn('[Share] No record found for id:', shareId);
            return reject(new Error('Share link not found or expired'));
          }
          console.log('[Share] Fetched OK');
          resolve(res.data);
        }).catch(function (err) {
          console.error('[Share] catch:', err);
          reject(err);
        });
    });
  }

  // Render a share's payload as a self-contained read-only HTML page.
  // Replaces the entire #app content.
  function renderSharePage(share) {
    const appEl = document.getElementById('app');
    if (!appEl) return;
    const p = share.payload || {};

    let html = '<style>' +
      '.share-page { max-width: 800px; margin: 0 auto; padding: 24px; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }' +
      '.share-banner { display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;border-radius:12px;margin-bottom:24px;flex-wrap:wrap;gap:10px; }' +
      '.share-banner .brand { font-weight:800;font-size:18px;letter-spacing:-0.01em; }' +
      '.share-banner .tagline { font-size:12px;opacity:0.9;margin-top:2px; }' +
      '.share-banner .cta { background:#fff;color:#16a34a;padding:8px 16px;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none;border:0;cursor:pointer; }' +
      '.share-content h1 { font-size:28px;margin:0 0 8px; }' +
      '.share-meta { color:#666;font-size:14px;margin-bottom:18px; }' +
      '.share-photo { width:100%;max-height:400px;object-fit:cover;border-radius:12px;margin-bottom:18px; }' +
      '.share-section { margin-bottom:22px; }' +
      '.share-section h2 { font-size:16px;color:#16a34a;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.04em; }' +
      '.ing-row { display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:14px; }' +
      '.ing-row strong { color:#16a34a;font-family:monospace; }' +
      '.steps { white-space:pre-wrap;line-height:1.7;font-size:14px;color:#333; }' +
      '.menu-section { margin-bottom:24px; }' +
      '.menu-section-title { font-size:14px;text-transform:uppercase;letter-spacing:0.2em;color:#888;text-align:center;margin-bottom:14px; }' +
      '.menu-item { padding:10px 0;border-bottom:1px dashed #ddd; }' +
      '.menu-item-name { font-weight:600;font-size:16px;display:flex;justify-content:space-between; }' +
      '.menu-item-desc { color:#666;font-size:13px;font-style:italic;margin-top:4px; }' +
      '.share-footer { text-align:center;padding:24px;color:#999;font-size:12px;border-top:1px solid #eee;margin-top:32px; }' +
    '</style>';

    html += '<div class="share-page">';
    html += '<div class="share-banner">' +
      '<div><div class="brand">ProChefDesk</div><div class="tagline">Made by chefs, for chefs</div></div>' +
      '<button class="cta" onclick="window.location.href=window.location.origin+window.location.pathname">Try ProChefDesk free →</button>' +
    '</div>';

    html += '<div class="share-content">';

    if (p.kind === 'recipe') {
      html += '<h1>' + escapeHtml(p.name || 'Recipe') + '</h1>';
      html += '<div class="share-meta">';
      if (p.servings) html += p.servings + ' servings';
      if (p.prepTime) html += ' · ' + p.prepTime + 'min prep';
      if (p.cookTime) html += ' · ' + p.cookTime + 'min cook';
      html += '</div>';
      if (p.photo) html += '<img class="share-photo" src="' + escapeHtml(p.photo) + '" alt="">';

      if (p.ingredients && p.ingredients.length > 0) {
        html += '<div class="share-section"><h2>Ingredients</h2>';
        p.ingredients.forEach(function (ri) {
          html += '<div class="ing-row"><span>' + escapeHtml(ri.name) + '</span><strong>' + escapeHtml(formatAmt(ri.amount, ri.unit)) + '</strong></div>';
        });
        html += '</div>';
      }
      if (p.steps) {
        html += '<div class="share-section"><h2>Method</h2><div class="steps">' + escapeHtml(p.steps) + '</div></div>';
      }
      if (p.plating) {
        html += '<div class="share-section"><h2>Plating</h2><div class="steps">' + escapeHtml(p.plating) + '</div></div>';
      }
    } else if (p.kind === 'menu') {
      html += '<div style="text-align:center;margin-bottom:30px;">';
      html += '<h1 style="font-size:36px;margin-bottom:8px;">' + escapeHtml(p.name || 'Menu') + '</h1>';
      if (p.subtitle) html += '<div style="font-size:12px;letter-spacing:0.24em;color:#888;text-transform:uppercase;">' + escapeHtml(p.subtitle) + '</div>';
      html += '</div>';
      (p.sections || []).forEach(function (sec) {
        html += '<div class="menu-section">';
        if (sec.title) html += '<div class="menu-section-title">' + escapeHtml(sec.title) + '</div>';
        (sec.items || []).forEach(function (it) {
          html += '<div class="menu-item">';
          html += '<div class="menu-item-name">' +
            '<span>' + escapeHtml(it.name) + '</span>' +
            (!p.hidePrices && it.price ? '<span style="color:#c5a572;">$' + Number(it.price).toFixed(2) + '</span>' : '') +
            '</div>';
          if (it.description) html += '<div class="menu-item-desc">' + escapeHtml(it.description) + '</div>';
          html += '</div>';
        });
        html += '</div>';
      });
      if (p.footer) html += '<div style="text-align:center;margin-top:30px;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;">' + escapeHtml(p.footer) + '</div>';
    }

    html += '</div>';
    html += '<div class="share-footer">' +
      'Bu ' + (p.kind === 'recipe' ? 'tarif' : 'menü') + ' ProChefDesk ile paylaşıldı · ' +
      'Shared with ProChefDesk · ' +
      '<a href="' + location.origin + location.pathname + '" style="color:#16a34a;">Try it free</a>' +
    '</div>';
    html += '</div>';

    appEl.innerHTML = html;
    appEl.classList.remove('hidden');
    document.title = (p.name || 'ProChefDesk') + ' · ProChefDesk';
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function formatAmt(amt, unit) {
    if (amt == null) return unit || '';
    return amt + (unit ? ' ' + unit : '');
  }

  // ============ INIT — check for ?share=... in URL on boot ============
  // Returns true if this is a share page (caller should NOT continue normal boot)
  function initShareCheck() {
    const params = new URLSearchParams(location.search);
    const shareId = params.get('share');
    if (!shareId) return false;

    // Hide splash screen (since normal boot flow won't run)
    function hideSplash() {
      const splash = document.getElementById('splash');
      if (splash) {
        splash.classList.add('hide');
        setTimeout(function () { splash.style.display = 'none'; }, 340);
      }
    }

    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:80vh;font-family:sans-serif;color:#666;">Loading shared content...</div>';
      appEl.classList.remove('hidden');
    }
    hideSplash();

    // Need cloud for fetchShare. cloud.init runs on PCD bootstrap; wait briefly.
    function tryFetch(retries) {
      if (!window._supabaseClient) {
        if (retries > 0) return setTimeout(function () { tryFetch(retries - 1); }, 200);
        return showError('Cloud not available');
      }
      fetchShare(shareId).then(function (share) {
        renderSharePage(share);
        hideSplash();
      }).catch(function (e) {
        showError(e.message || 'Share not found');
        hideSplash();
      });
    }
    function showError(msg) {
      if (appEl) {
        appEl.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;font-family:sans-serif;color:#666;text-align:center;padding:20px;">' +
          '<h1 style="font-size:24px;color:#dc2626;">Share not found</h1>' +
          '<p>' + escapeHtml(msg) + '</p>' +
          '<a href="' + location.origin + location.pathname + '" style="color:#16a34a;font-weight:700;text-decoration:none;margin-top:14px;">Open ProChefDesk →</a>' +
          '</div>';
      }
    }
    setTimeout(function () { tryFetch(20); }, 100);
    return true;
  }

  PCD.share = {
    createOrGetShareUrl: createOrGetShareUrl,
    fetchShare: fetchShare,
    renderSharePage: renderSharePage,
    snapshotRecipe: snapshotRecipe,
    snapshotMenu: snapshotMenu,
    initShareCheck: initShareCheck,
  };
})();
