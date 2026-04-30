/* ================================================================
   ProChefDesk — share.js
   Public share URLs for recipes, menus & kitchen cards.

   Architecture (v2.5.7):
   - Each share gets a random ID (e.g. ?share=abc12345xyz1)
   - Stored in Supabase 'public_shares' with full lifecycle support:
       { id, kind, source_id, payload, owner_id, paused, view_count,
         created_at, updated_at }
   - One share per (owner, kind, source_id) — UNIQUE constraint.
     Same recipe/menu/canvas always returns the same URL.
   - createOrGetShareUrl auto-refreshes the snapshot every call,
     so the share always reflects the current state of the source item.
   - Owners can pause (temporarily disable) or delete shares from
     Account → My shares.
   - View count incremented atomically via RPC on each public view.
   - Paused shares show a "this share is paused" page instead of content.
   - URL format: prochefdesk.com/?share=abc12345xyz1
   - On boot, app.js checks for ?share param and routes to public view.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  function genShareId() {
    // 12-char base36 random ID — collision risk negligible
    return Math.random().toString(36).slice(2, 10) +
           Math.random().toString(36).slice(2, 6);
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

  // Forwards to kitchen_cards.js's snapshot function. The tools module
  // owns the canvas data shape, so it owns the snapshot logic too.
  function snapshotKitchenCard(canvasId) {
    if (PCD.tools && PCD.tools.kitchenCards && PCD.tools.kitchenCards.snapshot) {
      return PCD.tools.kitchenCards.snapshot(canvasId);
    }
    return null;
  }

  // Get or create a share for a recipe/menu/kitchencard.
  // Returns Promise resolving to URL.
  // Idempotent: same (owner, kind, sourceId) -> same share ID/URL.
  // Snapshot is refreshed on every call so the public view stays current.
  function createOrGetShareUrl(kind, sourceId) {
    return new Promise(function (resolve, reject) {
      if (!PCD.cloud || !PCD.cloud.ready) {
        return reject(new Error('Cloud not configured'));
      }
      const supabase = window._supabaseClient;
      if (!supabase) return reject(new Error('Supabase client missing'));
      const user = PCD.store.get('user');
      if (!user || !user.id) return reject(new Error('Sign in to share'));

      const payload =
        (kind === 'recipe')      ? snapshotRecipe(sourceId) :
        (kind === 'menu')        ? snapshotMenu(sourceId) :
        (kind === 'kitchencard') ? snapshotKitchenCard(sourceId) :
        null;
      if (!payload) return reject(new Error('Item not found'));

      // 1) Check if a share already exists for this (owner, kind, source)
      supabase.from('public_shares')
        .select('id, paused')
        .eq('owner_id', user.id)
        .eq('kind', kind)
        .eq('source_id', sourceId)
        .maybeSingle()
        .then(function (sel) {
          if (sel.error) {
            PCD.err('share lookup error', sel.error);
            return reject(sel.error);
          }

          if (sel.data) {
            // Existing share → refresh snapshot, keep the URL stable
            const shareId = sel.data.id;
            supabase.from('public_shares')
              .update({ payload: payload })
              .eq('id', shareId)
              .then(function (upd) {
                if (upd.error) {
                  PCD.err('share update error', upd.error);
                  return reject(upd.error);
                }
                const url = location.origin + location.pathname + '?share=' + shareId;
                resolve(url);
              }).catch(reject);
            return;
          }

          // 2) No existing share → create a new one
          const shareId = genShareId();
          supabase.from('public_shares')
            .insert({
              id: shareId,
              kind: kind,
              source_id: sourceId,
              payload: payload,
              owner_id: user.id,
              paused: false,
            })
            .then(function (ins) {
              if (ins.error) {
                PCD.err('share insert error', ins.error);
                return reject(ins.error);
              }
              const url = location.origin + location.pathname + '?share=' + shareId;
              resolve(url);
            }).catch(reject);
        }).catch(reject);
    });
  }

  // Fetch a public share by ID — used when ?share= is in URL.
  // Calls the `fetch_share_by_id` SECURITY DEFINER RPC (v2.6.39): direct
  // SELECT on public_shares is no longer permitted to anonymous users
  // because USING (true) was leaking the entire shares table.
  // The RPC returns only { id, kind, payload, paused } — owner_id and
  // view_count are NEVER exposed to anonymous callers.
  // Rejects with special 'paused' error if share exists but is paused,
  // so initShareCheck can render a friendly "this share is paused" page.
  function fetchShare(shareId) {
    return new Promise(function (resolve, reject) {
      const supabase = window._supabaseClient;
      if (!supabase) return reject(new Error('Supabase client missing'));
      supabase.rpc('fetch_share_by_id', { share_id: shareId })
        .then(function (res) {
          if (res.error) return reject(res.error);
          // RPC with TABLE return → res.data is an array (possibly empty)
          const rows = res.data;
          const row = Array.isArray(rows) ? rows[0] : rows;
          if (!row) return reject(new Error('Share not found'));
          if (row.paused) {
            const e = new Error('paused');
            e.code = 'paused';
            return reject(e);
          }
          // Fire-and-forget view counter; never block render.
          try {
            supabase.rpc('increment_share_view', { share_id: shareId })
              .then(function () {}).catch(function () {});
          } catch (e) { /* ignore */ }
          resolve(row);
        }).catch(reject);
    });
  }

  // ============ LIFECYCLE: list / pause / unpause / delete ============

  // List all shares owned by current user.
  // Returns Promise<Array<{id,kind,source_id,payload,paused,view_count,created_at,updated_at}>>
  function listMyShares() {
    return new Promise(function (resolve, reject) {
      const supabase = window._supabaseClient;
      if (!supabase) return reject(new Error('Cloud not available'));
      const user = PCD.store.get('user');
      if (!user || !user.id) return reject(new Error('Sign in required'));

      supabase.from('public_shares')
        .select('id, kind, source_id, payload, paused, view_count, created_at, updated_at')
        .eq('owner_id', user.id)
        .order('updated_at', { ascending: false })
        .then(function (res) {
          if (res.error) return reject(res.error);
          resolve(res.data || []);
        }).catch(reject);
    });
  }

  // Pause or unpause a share.
  function setSharePaused(shareId, paused) {
    return new Promise(function (resolve, reject) {
      const supabase = window._supabaseClient;
      if (!supabase) return reject(new Error('Cloud not available'));
      supabase.from('public_shares')
        .update({ paused: !!paused })
        .eq('id', shareId)
        .then(function (res) {
          if (res.error) return reject(res.error);
          resolve();
        }).catch(reject);
    });
  }

  // Permanently delete a share. The URL stops working.
  function deleteShare(shareId) {
    return new Promise(function (resolve, reject) {
      const supabase = window._supabaseClient;
      if (!supabase) return reject(new Error('Cloud not available'));
      supabase.from('public_shares').delete().eq('id', shareId)
        .then(function (res) {
          if (res.error) return reject(res.error);
          resolve();
        }).catch(reject);
    });
  }

  // Render a share's payload as a self-contained read-only HTML page.
  // Replaces the entire #app content.
  function renderSharePage(share) {
    const appEl = document.getElementById('app');
    if (!appEl) return;
    const p = share.payload || {};

    // Kitchen cards have their own A4 sheet renderer that lives in
    // kitchen_cards.js (so the layout & CSS stay in sync with the live
    // editor's print output). Delegate and return early.
    if (p.kind === 'kitchencard') {
      if (PCD.tools && PCD.tools.kitchenCards && PCD.tools.kitchenCards.renderFromSnapshot) {
        appEl.innerHTML = PCD.tools.kitchenCards.renderFromSnapshot(p);
      } else {
        appEl.innerHTML = '<div style="padding:40px;text-align:center;color:#666;">Kitchen card renderer unavailable</div>';
      }
      return;
    }

    let html = '<style>' +
      '.share-page { max-width: 800px; margin: 0 auto; padding: 24px; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }' +
      '.share-topbrand { text-align:center;padding:14px 16px 18px;font-size:13px;color:#888;border-bottom:1px solid #eee;margin-bottom:24px; }' +
      '.share-topbrand a { color:#16a34a;font-weight:700;text-decoration:none; }' +
      '.share-topbrand a:hover { text-decoration:underline; }' +
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
      '.share-footer a { color:#16a34a;text-decoration:none; }' +
      '.share-footer a:hover { text-decoration:underline; }' +
    '</style>';

    html += '<div class="share-page">';
    // Subtle top brand line — kibar, üst tarafta küçük bir tanıtım çizgisi.
    // Eski büyük yeşil banner ve "Try free" CTA'sı çıkartıldı; alttaki footer
    // zaten "Made with ProChefDesk" yazıyor.
    html += '<div class="share-topbrand">' +
      '<a href="' + location.origin + location.pathname + '" target="_blank" rel="noopener">ProChefDesk</a>' +
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
      'Made with <a href="' + location.origin + location.pathname + '" target="_blank" rel="noopener"><strong>ProChefDesk</strong></a> · prochefdesk.com' +
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

    // Hide splash immediately — share path bypasses normal app boot,
    // which is what normally hides the splash. Without this, user sees
    // an indefinite spinner on the "Kitchen OS" splash screen.
    const splash = document.getElementById('splash');
    if (splash) {
      splash.classList.add('fade-out');
      setTimeout(function () { splash.style.display = 'none'; }, 340);
    }

    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:80vh;font-family:sans-serif;color:#666;">Loading shared content...</div>';
      appEl.classList.remove('hidden');
    }

    // Need cloud for fetchShare. cloud.init runs on PCD bootstrap; wait briefly.
    function tryFetch(retries) {
      if (!window._supabaseClient) {
        if (retries > 0) return setTimeout(function () { tryFetch(retries - 1); }, 200);
        return showError('Cloud not available');
      }
      fetchShare(shareId).then(renderSharePage).catch(function (e) {
        if (e && e.code === 'paused') return showPaused();
        showError(e.message || 'Share not found');
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
    function showPaused() {
      // Try to localise; fall back to English if i18n isn't ready.
      const t = (PCD.i18n && PCD.i18n.t) ? PCD.i18n.t : function (k, fb) { return fb; };
      const title = t('share_paused_page_title', 'This share is paused');
      const body = t('share_paused_page_msg', 'The owner has temporarily disabled this share. It may become available again later.');
      const back = t('share_back_to_app', 'Open ProChefDesk →');
      if (appEl) {
        appEl.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#666;text-align:center;padding:24px;">' +
          '<div style="font-size:56px;margin-bottom:18px;">⏸</div>' +
          '<h1 style="font-size:22px;color:#444;margin:0;font-weight:700;">' + escapeHtml(title) + '</h1>' +
          '<p style="margin:14px 0 0;max-width:420px;line-height:1.6;">' + escapeHtml(body) + '</p>' +
          '<a href="' + location.origin + location.pathname + '" style="color:#16a34a;font-weight:700;text-decoration:none;margin-top:24px;">' + escapeHtml(back) + '</a>' +
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
    snapshotKitchenCard: snapshotKitchenCard,
    initShareCheck: initShareCheck,
    listMyShares: listMyShares,
    setSharePaused: setSharePaused,
    deleteShare: deleteShare,
  };
})();
