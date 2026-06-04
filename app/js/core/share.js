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
    // v2.8.58 — Sub-recipe lookup. v2.8.41-v2.8.52 snapshot only checked
    // ingMap[ri.ingredientId]; sub-recipe rows have ri.recipeId (no ingredientId)
    // → ing=undefined → name='?'. Now resolved from recipeMap.
    const recipeMap = {};
    if (PCD.store.listRecipes) {
      PCD.store.listRecipes().forEach(function (rr) { recipeMap[rr.id] = rr; });
    }
    // Embed ingredient names + units inline so public viewer doesn't need the user's library.
    // PRICE/COST intentionally excluded — name + amount + unit only.
    // pricePerUnit, supplier, yieldPercent etc. remain private;
    // Discover viewer sees only the recipe profile.
    const ingredients = (r.ingredients || []).map(function (ri) {
      // v2.8.52 — Separator row passed through as-is to snapshot (renderer
      // displays it as a thin dashed line).
      if (ri && ri.separator) {
        return { separator: true, label: ri.label || '' };
      }
      // v2.8.58 — Sub-recipe row: resolve name from recipeMap.
      if (ri.recipeId) {
        const sub = recipeMap[ri.recipeId];
        return {
          name: sub ? sub.name : '(sub-recipe)',
          amount: ri.amount,
          unit: ri.unit || (sub && sub.yieldUnit) || 'portion',
        };
      }
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
      // v2.8.30 — Capture prep classification so the share page renders
      // the correct subtitle. Older shares (created before this) lack
      // these fields; the renderer falls back to legacy servings line.
      isSubRecipe: r.isSubRecipe,
      yieldAmount: r.yieldAmount,
      yieldUnit: r.yieldUnit,
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
        title: sec.name || sec.title || '',   // v2.16 fix: menus.js uses sec.name, not sec.title
        items: (sec.items || []).map(function (it) {
          const r = it.recipeId ? recipeMap[it.recipeId] : null;
          return {
            name: it.recipeId ? (r ? r.name : '(removed)') : it.customName,
            description: it.description || (r && r.plating) || '',
            price: it.price,
            codes: it.codes || [],            // v2.16 fix: dietary/allergen codes
          };
        }).filter(function (x) { return x.name; }),
      };
    });
    return {
      kind: 'menu',
      name: m.name,
      subtitle: m.subtitle,
      footer: m.footer,
      // Design
      theme: m.theme || 'fine_dining',
      accentColor: m.accentColor || '',
      inkColor: m.inkColor || '',
      bgColor: m.bgColor || '',
      logo: m.logo || '',
      coverPhoto: m.coverPhoto || '',
      coverRatio: m.coverRatio || '16/9',
      coverHeight: m.coverHeight || '40mm',
      // Layout
      columns: m.columns || 1,
      pageSize: m.pageSize || 'portrait',
      // Display options
      priceStyle: m.priceStyle || (m.hidePrices ? 'hidden' : 'symbol'),
      allergenStyle: m.allergenStyle || (m.hideAllergens ? 'off' : 'codes'),
      // Print opts (v2.18 independent controls)
      printFontSize:    m.printFontSize    || 'medium',
      printMargin:      m.printMargin      || 'medium',
      printLineSpacing: m.printLineSpacing || 'normal',
      printSecSpacing:  m.printSecSpacing  || 'normal',
      printLogoSize:    m.printLogoSize    || 'medium',
      // Data
      sections: sections,
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

  // v2.6.56 — Detect viewer's preferred locale for the share page.
  // Order of preference:
  //   1. ?lang=xx URL parameter (explicit override)
  //   2. localStorage pcd_state prefs.locale (if viewer is also a PCD user)
  //   3. navigator.language (browser default, e.g. "tr-TR" → "tr")
  //   4. 'en' fallback
  // Only switches if the bundle is loaded for that locale (otherwise falls
  // back to en — i18n.t() already handles missing keys gracefully).
  function autoDetectShareLocale() {
    try {
      const supported = ['en', 'tr', 'es', 'fr', 'de', 'ar'];
      // 1) URL override
      const params = new URLSearchParams(location.search);
      const langParam = params.get('lang');
      if (langParam && supported.indexOf(langParam) >= 0) return langParam;
      // 2) Existing PCD user preference
      try {
        const raw = localStorage.getItem('pcd_state');
        if (raw) {
          const parsed = JSON.parse(raw);
          const stored = parsed && parsed.prefs && parsed.prefs.locale;
          if (stored && supported.indexOf(stored) >= 0) return stored;
        }
      } catch (e) { /* ignore */ }
      // 3) Browser language (en-GB → en, tr-TR → tr, ar-SA → ar, etc.)
      const navLang = (navigator.language || 'en').toLowerCase().split('-')[0];
      if (supported.indexOf(navLang) >= 0) return navLang;
    } catch (e) { /* ignore */ }
    return 'en';
  }

  // Render a share's payload as a self-contained read-only HTML page.
  // Replaces the entire #app content.
  function renderSharePage(share) {
    const appEl = document.getElementById('app');
    if (!appEl) return;
    const p = share.payload || {};

    // v2.6.56 — Set i18n locale based on viewer's preference so labels
    // ("Ingredients", "Method", "servings", etc.) render in their language.
    // Recipe content (steps, plating) stays in the owner's original language
    // — that's correct, we don't want to machine-translate user content.
    const viewerLocale = autoDetectShareLocale();
    if (PCD.i18n && PCD.i18n.setLocale) {
      try { PCD.i18n.setLocale(viewerLocale); } catch (e) { /* ignore */ }
    }
    // Use t() with English fallback for safety
    const t = (PCD.i18n && PCD.i18n.t) ? PCD.i18n.t : function (k, fb) { return fb || k; };

    // Apply RTL direction for Arabic share pages
    if (viewerLocale === 'ar') {
      document.documentElement.setAttribute('dir', 'rtl');
      document.documentElement.setAttribute('lang', 'ar');
    } else {
      document.documentElement.setAttribute('lang', viewerLocale);
    }

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
      /* v2.8.67 — 1:1 standard (8 surfaces consistent). max-w 360px on desktop,
         100% width on mobile but still square. */
      '.share-photo { display:block;width:100%;max-width:360px;aspect-ratio:1/1;object-fit:cover;border-radius:12px;margin:0 auto 18px; }' +
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
    // Subtle top brand line — small unobtrusive promo strip at the top.
    // Old large green banner and "Try free" CTA removed; footer
    // already says "Made with ProChefDesk".
    html += '<div class="share-topbrand">' +
      '<a href="' + location.origin + location.pathname + '" target="_blank" rel="noopener">ProChefDesk</a>' +
    '</div>';

    html += '<div class="share-content">';

    if (p.kind === 'recipe') {
      html += '<h1>' + escapeHtml(p.name || t('share_default_recipe', 'Recipe')) + '</h1>';
      html += '<div class="share-meta">';
      // v2.8.30 — Prep-aware subtitle. Snapshot includes isSubRecipe +
      // yield since v2.8.30; older snapshots fall back to the legacy
      // servings line (treated as menu item).
      const isPrepShare = (p.isSubRecipe === true) || (p.isSubRecipe == null && !!(p.yieldAmount && p.yieldUnit));
      if (isPrepShare) {
        if (p.yieldAmount && p.yieldUnit) {
          html += p.yieldAmount + ' ' + p.yieldUnit;
        }
      } else if (p.servings) {
        html += p.servings + ' ' + t('share_servings_unit', 'servings');
      }
      if (p.prepTime) html += ' · ' + p.prepTime + ' ' + t('share_min_prep', 'min prep');
      if (p.cookTime) html += ' · ' + p.cookTime + ' ' + t('share_min_cook', 'min cook');
      html += '</div>';
      if (p.photo) html += '<img class="share-photo" src="' + escapeHtml(p.photo) + '" alt="">';

      if (p.ingredients && p.ingredients.length > 0) {
        html += '<div class="share-section"><h2>' + escapeHtml(t('share_ingredients', 'Ingredients')) + '</h2>';
        p.ingredients.forEach(function (ri) {
          // v2.8.52 — Separator row: thin divider line + optional label
          if (ri && ri.separator) {
            const label = ri.label ? ('<span style="display:block;font-weight:600;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;margin:8px 0 2px;">' + escapeHtml(ri.label) + '</span>') : '';
            html += '<div style="border-top:1px dashed #999;margin:6px 0;"></div>' + label;
            return;
          }
          html += '<div class="ing-row"><span>' + escapeHtml(ri.name) + '</span><strong>' + escapeHtml(formatAmt(ri.amount, ri.unit)) + '</strong></div>';
        });
        html += '</div>';
      }
      if (p.steps) {
        html += '<div class="share-section"><h2>' + escapeHtml(t('share_method', 'Method')) + '</h2><div class="steps">' + escapeHtml(p.steps) + '</div></div>';
      }
      if (p.plating) {
        html += '<div class="share-section"><h2>' + escapeHtml(t('share_plating', 'Plating')) + '</h2><div class="steps">' + escapeHtml(p.plating) + '</div></div>';
      }
    } else if (p.kind === 'menu') {
      // v2.17/v2.18 — Share page menu render: theme, font, colour, logo, cover, 2-column.
      // Produces identical output to buildStyledHtml() in menus.js.
      var SHARE_THEMES = {
        fine_dining: { titleFont: '"Cormorant Garamond",Georgia,serif', bodyFont: '"Inter",-apple-system,sans-serif', bodyWeight: 300, titleWeight: 500, itemWeight: 600, accent: '#c5a572', bg: '#ffffff', ink: '#111111', mutedInk: '#666666', sectionTransform: 'uppercase', sectionLetterSpacing: '0.18em', sectionDecor: 'lines', titleLetterSpacing: '0.02em' },
        modern_bistro: { titleFont: '"Playfair Display",Georgia,serif', bodyFont: '"Inter",-apple-system,sans-serif', bodyWeight: 400, titleWeight: 700, itemWeight: 700, accent: '#c2410c', bg: '#fffaf5', ink: '#1a1a1a', mutedInk: '#7a6b5d', sectionTransform: 'none', sectionLetterSpacing: '0', sectionDecor: 'underline', titleLetterSpacing: '-0.01em' },
        cafe: { titleFont: '"Caveat","Brush Script MT",cursive', bodyFont: '"Nunito",-apple-system,sans-serif', bodyWeight: 400, titleWeight: 700, itemWeight: 700, accent: '#b45309', bg: '#fdf6e3', ink: '#3a2e1f', mutedInk: '#8a7355', sectionTransform: 'none', sectionLetterSpacing: '0', sectionDecor: 'wavy', titleLetterSpacing: '0' },
        minimalist: { titleFont: '"Inter",-apple-system,sans-serif', bodyFont: '"Inter",-apple-system,sans-serif', bodyWeight: 400, titleWeight: 800, itemWeight: 600, accent: '#111111', bg: '#ffffff', ink: '#0a0a0a', mutedInk: '#666666', sectionTransform: 'uppercase', sectionLetterSpacing: '0.16em', sectionDecor: 'none', titleLetterSpacing: '-0.02em' },
      };
      var SHARE_PALETTES = { gold:'#c5a572', burgundy:'#8b1a1a', navy:'#1e3a5f', forest:'#2d5016', black:'#111111', choco:'#5c2c0f', cream:'#c8a96e', sage:'#7a9e7e', blush:'#c47c8a', slate:'#607d8b', dustrose:'#b07080', olive:'#8a8a4a' };
      var th = SHARE_THEMES[p.theme] || SHARE_THEMES.fine_dining;
      var accent = (p.accentColor && SHARE_PALETTES[p.accentColor]) ? SHARE_PALETTES[p.accentColor] : th.accent;
      var ink = p.inkColor || th.ink;
      var mutedInk = (function() {
        if (p.inkColor) {
          var h = p.inkColor.replace('#',''); if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
          var r=parseInt(h.substr(0,2),16),g=parseInt(h.substr(2,2),16),b=parseInt(h.substr(4,2),16);
          return 'rgba('+r+','+g+','+b+',0.6)';
        }
        return th.mutedInk;
      })();
      var bg = p.bgColor || th.bg;
      // v2.18 — Resolve print opts using same logic as menus.js resolvePrintOpts()
      var fontMap = { xsmall: 8, small: 10, medium: 12, large: 14, xlarge: 16 };
      var itemSize = fontMap[p.printFontSize] || 12;
      var titleSize = Math.round(itemSize * 2.4);
      var sectionSize = Math.round(itemSize * 1.4);
      var marginMap = { very_narrow: 18, narrow: 26, medium: 36, wide: 50 };
      var pagePadding = marginMap[p.printMargin] || 36;
      var lineMap = { tight: Math.round(itemSize*0.5), normal: Math.round(itemSize*0.9), spacious: Math.round(itemSize*1.4) };
      var itemGap = lineMap[p.printLineSpacing] || Math.round(itemSize*0.9);
      var secMap = { tight: 1.2, normal: 1.8, spacious: 2.8 };
      var secMult = secMap[p.printSecSpacing] || 1.8;
      var logoMap = { small: 44, medium: 64, large: 88 };
      var logoSize = logoMap[p.printLogoSize] || 64;
      var cols = (p.columns === 2) ? 2 : 1;
      var priceStyle = p.priceStyle || 'symbol';
      var showAllergens = (p.allergenStyle !== 'off');
      var currSym = (PCD.currencySymbol && PCD.currencySymbol()) || '$';
      var sectionDecorCSS = '';
      if (th.sectionDecor === 'lines') sectionDecorCSS = '.sm-sec-title::before,.sm-sec-title::after{content:"";display:inline-block;width:20px;height:1px;background:'+accent+';vertical-align:middle;margin:0 12px;}';
      else if (th.sectionDecor === 'underline') sectionDecorCSS = '.sm-sec-title{border-bottom:2px solid '+accent+';padding-bottom:4px;display:inline-block;padding-left:20px;padding-right:20px;}';
      else if (th.sectionDecor === 'wavy') sectionDecorCSS = '.sm-sec-title::after{content:"~";display:block;color:'+accent+';font-size:1.3em;line-height:0.4;margin-top:4px;}';

      // Font import (all themes — share page may use any theme)
      var fontImport = '@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&family=Caveat:wght@400;600;700&family=Inter:wght@300;400;500;600;700;800&family=Nunito:wght@300;400;500;600;700&display=swap");';

      // Inject into shared page HTML
      // Inject font import as separate <link> tag before closing </head> equivalent
      // More reliable than string replace which may miss nested <style> tags
      html += '<style>' + fontImport + '</style>';
      html += '<style>' +
        '.sm-page{background:'+bg+';color:'+ink+';max-width:620px;margin:0 auto;padding:'+pagePadding+'px '+(pagePadding+8)+'px;font-family:'+th.bodyFont+' !important;font-weight:'+th.bodyWeight+';border-radius:8px;box-sizing:border-box;}' +
        '.sm-cover{width:100%;height:180px;object-fit:cover;border-radius:6px;display:block;margin:0 0 '+(Math.round(pagePadding*0.5))+'px;}' +
        '.sm-logo{display:block;width:'+logoSize+'px;height:'+logoSize+'px;margin:0 auto 12px;object-fit:cover;border-radius:50%;}' +
        '.sm-header{text-align:center;margin-bottom:'+Math.round(pagePadding*0.75)+'px;}' +
        '.sm-title{font-family:'+th.titleFont+' !important;font-size:'+titleSize+'px;font-weight:'+th.titleWeight+';letter-spacing:'+th.titleLetterSpacing+';margin:0 0 8px;color:'+ink+';line-height:1.1;}' +
        '.sm-subtitle{font-size:11px;color:'+mutedInk+';letter-spacing:0.24em;text-transform:uppercase;font-weight:400;margin:0;}' +
        '.sm-title-rule{width:40px;height:2px;background:'+accent+';margin:10px auto 0;border:none;display:block;}' +
        '.sm-sections{'+(cols===2?'column-count:2;column-gap:'+(pagePadding*0.7)+'px;':'')+'margin-top:0;}' +
        '.sm-section{break-inside:avoid;margin-bottom:'+Math.round(itemGap*secMult)+'px;}' +
        '.sm-sec-title{font-size:'+sectionSize+'px;font-weight:700;text-transform:'+th.sectionTransform+';letter-spacing:'+th.sectionLetterSpacing+';color:'+accent+';text-align:center;margin:0 0 '+Math.round(itemGap*1.2)+'px;}' +
        sectionDecorCSS +
        '.sm-items{}' +
        '.sm-item{display:flex;justify-content:space-between;align-items:flex-start;gap:4px;margin-bottom:'+itemGap+'px;break-inside:avoid;}' +
        '.sm-item-name{font-size:'+itemSize+'px;font-weight:'+th.itemWeight+';color:'+ink+';flex-shrink:1;min-width:0;font-family:inherit;}' +
        '.sm-item-desc{font-size:'+(itemSize-3)+'px;color:'+mutedInk+';margin-top:2px;font-style:italic;}' +
        '.sm-item-codes{font-size:'+(itemSize-6)+'px;color:'+mutedInk+';margin-top:2px;}' +
        '.sm-item-leader{flex:1;min-width:10px;border-bottom:1px dotted #ccc;margin:0 4px 3px;align-self:flex-end;}' +
        '.sm-item-price{font-size:'+itemSize+'px;font-weight:600;color:'+accent+';white-space:nowrap;flex-shrink:0;}' +
        '.sm-footer{text-align:center;margin-top:'+Math.round(pagePadding*0.75)+'px;font-size:11px;color:'+mutedInk+';text-transform:uppercase;letter-spacing:0.12em;border-top:1px solid '+(accent+'33')+';padding-top:'+Math.round(pagePadding*0.5)+'px;}' +
        '.sm-allergen-legend{margin-top:'+Math.round(pagePadding*0.5)+'px;padding-top:'+Math.round(pagePadding*0.3)+'px;border-top:1px solid '+(accent+'33')+';font-size:10px;color:'+mutedInk+';text-align:center;}' +
      '</style>';

      html += '<div class="sm-page">';
      if (p.coverPhoto) html += '<img class="sm-cover" src="' + escapeHtml(p.coverPhoto) + '" alt="">';
      html += '<div class="sm-header">';
      if (p.logo) html += '<img class="sm-logo" src="' + escapeHtml(p.logo) + '" alt="">';
      html += '<h1 class="sm-title">' + escapeHtml(p.name || t('share_default_menu','Menu')) + '</h1>';
      if (p.subtitle) html += '<p class="sm-subtitle">' + escapeHtml(p.subtitle) + '</p>';
      html += '<hr class="sm-title-rule">';
      html += '</div>';
      html += '<div class="sm-sections">';
      var usedCodes = {};
      (p.sections || []).forEach(function (sec) {
        if (!sec.items || !sec.items.length) return;
        html += '<div class="sm-section">';
        if (sec.title) html += '<div class="sm-sec-title">' + escapeHtml(sec.title) + '</div>';
        html += '<div class="sm-items">';
        sec.items.forEach(function (it) {
          var price = it.price ? Number(it.price) : 0;
          var showPrice = (priceStyle !== 'hidden') && price > 0;
          var priceStr = showPrice ? (priceStyle === 'plain' ? (price % 1 === 0 ? String(price) : price.toFixed(2)) : (currSym + (price % 1 === 0 ? String(price) : price.toFixed(2)))) : '';
          html += '<div class="sm-item">';
          html += '<div style="flex:1;min-width:0;">';
          html += '<div class="sm-item-name">' + escapeHtml(it.name) + '</div>';
          if (it.description) html += '<div class="sm-item-desc">' + escapeHtml(it.description) + '</div>';
          if (showAllergens && it.codes && it.codes.length) {
            it.codes.forEach(function(c){ usedCodes[c] = true; });
            html += '<div class="sm-item-codes">' + it.codes.map(function(c){ return '('+escapeHtml(c)+')'; }).join(' ') + '</div>';
          }
          html += '</div>';
          if (showPrice) {
            html += '<div class="sm-item-leader"></div>';
            html += '<div class="sm-item-price">' + escapeHtml(priceStr) + '</div>';
          }
          html += '</div>';
        });
        html += '</div></div>';
      });
      html += '</div>';
      if (showAllergens && Object.keys(usedCodes).length) {
        html += '<div class="sm-allergen-legend"><b>' + escapeHtml(t('menu_allergen_legend') || 'Key') + '</b> ' +
          Object.keys(usedCodes).map(function(c){ return '<b>'+escapeHtml(c)+'</b>'; }).join(' · ') + '</div>';
      }
      if (p.footer) html += '<div class="sm-footer">' + escapeHtml(p.footer) + '</div>';
      html += '</div>';
    }

    html += '</div>';
    // v2.8.54 — Standard clickable footer. Brand name + URL link;
    // Same format across all app print + share + QR flows
    // (matches PCD.print in utils.js for visual consistency).
    html += '<div class="share-footer">' +
      'Made with <a href="https://prochefdesk.com" target="_blank" rel="noopener"><strong>ProChefDesk</strong></a> · <a href="https://prochefdesk.com" target="_blank" rel="noopener">prochefdesk.com</a>' +
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
