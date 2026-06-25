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
            price: (it.price !== undefined && it.price !== null && it.price !== '') ? it.price : (r && r.salePrice != null ? r.salePrice : undefined),
            codes: it.codes || [],            // v2.16 fix: dietary/allergen codes
          };
        }).filter(function (x) { return x.name; }),
      };
    });
    const out = {
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
    // v2.20 — Studio tasarımı varsa standalone HTML'i göm; public sayfa
    // Studio'yu yüklemeden bu HTML'i render eder (WYSIWYG, snapshot anında üretilir).
    try {
      const mst = PCD.tools && PCD.tools.menuStudio && PCD.tools.menuStudio.renderShareDoc;
      if (m.studio && mst) {
        const doc = mst(m.studio);
        out._studio = true; out.studioHtml = doc.html; out.studioW = doc.w; out.studioH = doc.h; out.studioBg = doc.bg; out.studioFonts = doc.fonts;
      }
    } catch (e) { /* renderer yoksa klasik snapshot kalır */ }
    return out;
  }

  // Forwards to kitchen_cards.js's snapshot function. The tools module
  // owns the canvas data shape, so it owns the snapshot logic too.
  function snapshotKitchenCard(canvasId) {
    if (PCD.tools && PCD.tools.kitchenCards && PCD.tools.kitchenCards.snapshot) {
      return PCD.tools.kitchenCards.snapshot(canvasId);
    }
    return null;
  }

  // ============ v2.17 — COST-VIEW ENRICHMENT ============
  // Maliyet verisini snapshot payload'una gömer (yalnızca cost-share için).
  // Mevcut PCD.recipes.computeFoodCost yeniden kullanılır → app ile bire bir
  // aynı sayılar. Para birimi PCD.currencySymbol() ile aktif tercihten gelir.
  function _ingMap() {
    const m = {}; PCD.store.listIngredients().forEach(function (i) { m[i.id] = i; }); return m;
  }
  function _cur() { return (PCD.currencySymbol ? PCD.currencySymbol() : '$'); }

  function recipeCostNumbers(r, ingMap, recipeMap) {
    const total = (PCD.recipes && PCD.recipes.computeFoodCost) ? PCD.recipes.computeFoodCost(r, ingMap, recipeMap) : 0;
    const servings = Number(r.servings) || 1;
    const perServing = servings > 0 ? total / servings : total;
    const sale = (r.salePrice != null && r.salePrice !== '') ? Number(r.salePrice) : null;
    return {
      total: total,
      servings: servings,
      perServing: perServing,
      salePrice: sale,
      foodCostPct: (sale && sale > 0) ? (perServing / sale * 100) : null,
      grossProfit: (sale != null) ? (sale - perServing) : null,
    };
  }

  function enrichRecipeCost(payload, rid) {
    const r = PCD.store.getRecipe(rid);
    if (!r) return;
    const ingMap = _ingMap();
    const recipeMap = (PCD.recipes && PCD.recipes.buildRecipeMap) ? PCD.recipes.buildRecipeMap() : null;
    const n = recipeCostNumbers(r, ingMap, recipeMap);
    n.currency = _cur();
    // v2.44.34 — Per-ingredient breakdown gömülür ki cost-share sayfası iç-uygulama
    // Cost Report'la AYNI tabloyu (birim fiyat · miktar · satır maliyeti) basabilsin.
    // Görüntüleyende fiyat DB'si yok → kırılım payload ile gitmek zorunda.
    if (PCD.recipes && PCD.recipes.costBreakdownRows) {
      n.rows = PCD.recipes.costBreakdownRows(r, ingMap, recipeMap, false).map(function (row) {
        return { name: row.name, isSub: !!row.isSub, unitPrice: row.unitPrice, stockUnit: row.stockUnit, amount: row.amount, qtyUnit: row.qtyUnit, lineCost: row.lineCost };
      });
    }
    n.isSubRecipe = (PCD.recipes && PCD.recipes.isPrep ? PCD.recipes.isPrep(r) : false) || !!(r.yieldAmount && r.yieldUnit);
    n.yieldAmount = r.yieldAmount || null;
    n.yieldUnit = r.yieldUnit || null;
    payload.cost = n;
  }

  function enrichMenuCost(payload, mid) {
    const m = PCD.store.getFromTable('menus', mid);
    if (!m) return;
    const ingMap = _ingMap();
    const recipeMap = (PCD.recipes && PCD.recipes.buildRecipeMap) ? PCD.recipes.buildRecipeMap() : null;
    const recById = {}; PCD.store.listRecipes().forEach(function (r) { recById[r.id] = r; });
    let totRev = 0, totCost = 0, counted = 0;
    // v2.20 — Studio menüsü varsa kalemler studio.blocks içindedir (m.sections boş olabilir).
    const itemLists = [];
    if (m.studio && m.studio.blocks) {
      m.studio.blocks.forEach(function (b) { if (b.type === 'section' && b.items) itemLists.push(b.items); });
    } else {
      (m.sections || []).forEach(function (sec) { itemLists.push(sec.items || []); });
    }
    itemLists.forEach(function (items) {
      items.forEach(function (it) {
        const r = it.recipeId ? recById[it.recipeId] : null;
        const price = (it.price !== undefined && it.price !== null && it.price !== '') ? Number(it.price) : (r && r.salePrice != null ? Number(r.salePrice) : null);
        if (r) {
          const n = recipeCostNumbers(r, ingMap, recipeMap);
          if (price != null) { totRev += price; totCost += n.perServing; counted++; }
        }
      });
    });
    payload.cost = {
      currency: _cur(),
      totalRevenue: totRev,
      totalCost: totCost,
      items: counted,
      avgFoodCostPct: (totRev > 0) ? (totCost / totRev * 100) : null,
    };
  }

  // Get or create a share for a recipe/menu/kitchencard.
  // Returns Promise resolving to URL.
  // Idempotent: same (owner, kind, sourceId, mode) -> same share ID/URL.
  // Snapshot is refreshed on every call so the public view stays current.
  function createOrGetShareUrl(kind, sourceId, mode) {
    // v2.17 — mode: 'public' (varsayılan) veya 'cost' (patron/muhasebeci görünümü).
    mode = (mode === 'cost') ? 'cost' : 'public';
    return new Promise(function (resolve, reject) {
      if (!PCD.cloud || !PCD.cloud.ready) {
        return reject(new Error('Cloud not configured'));
      }
      const supabase = window._supabaseClient;
      if (!supabase) return reject(new Error('Supabase client missing'));
      const user = PCD.store.get('user');
      if (!user || !user.id) return reject(new Error('Sign in to share'));

      // Tüm public paylaşım (link / URL / QR) yalnız Pro — merkezi net.
      if (PCD.gate && PCD.gate.canShare && !PCD.gate.canShare()) {
        return reject(new Error('share-pro-only'));
      }

      // v2.17 — Cost-view yalnızca Pro'da üretilir (spec 5.2).
      if (mode === 'cost' && PCD.gate && !PCD.gate.canUseCostView()) {
        return reject(new Error('cost-view-pro-only'));
      }

      const payload =
        (kind === 'recipe')      ? snapshotRecipe(sourceId) :
        (kind === 'menu')        ? snapshotMenu(sourceId) :
        (kind === 'kitchencard') ? snapshotKitchenCard(sourceId) :
        null;
      if (!payload) return reject(new Error('Item not found'));

      payload._mode = mode;
      // v2.17 — Cost-view: maliyet verisini snapshot'a göm (yalnızca cost mode).
      // Normal public paylaşımda maliyet/fiyat ASLA payload'a girmez → public
      // link maliyet sızdırmaz. Cost link unlisted (tahmin edilemez ID) güvenlikli.
      if (mode === 'cost') {
        if (kind === 'recipe') enrichRecipeCost(payload, sourceId);
        else if (kind === 'menu') enrichMenuCost(payload, sourceId);
      }

      // v2.17 — Watermark PAYLAŞANIN planına göre snapshot'a gömülür (payload
      // her create/refresh'te yenilenir → flag güncel kalır). Pro sharer →
      // temiz (footer'sız) link; free → footer kalır. Görüntüleyenin planı
      // etkilemez (footer view anında p._wm'den okunur).
      payload._wm = !PCD.gate || PCD.gate.showWatermark();

      // 1) Check if a share already exists for this (owner, kind, source, mode)
      supabase.from('public_shares')
        .select('id, paused')
        .eq('owner_id', user.id)
        .eq('kind', kind)
        .eq('source_id', sourceId)
        .eq('share_mode', mode)
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
                const url = location.origin + location.pathname + '?share=' + shareId + (mode === 'cost' ? '&view=cost' : '');
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
              share_mode: mode,
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
  // v2.17 — Cost-view paneli HTML'i. payload.cost'tan okur (recipe veya menu).
  // Food cost % anlamsal renk: yeşil <30, amber 30-35, kırmızı >35.
  function costPanelHtml(p, t) {
    const c = p.cost || {};
    const cur = c.currency || '$';
    const money = function (n) { return cur + (Number(n) || 0).toFixed(2); };
    const pctColor = function (pct) {
      if (pct == null) return '#6b7280';
      if (pct < 30) return '#16a34a';
      if (pct <= 35) return '#d97706';
      return '#dc2626';
    };
    const cell = function (lbl, val, color) {
      return '<div class="cost-cell"><div class="lbl">' + escapeHtml(lbl) + '</div>' +
        '<div class="val"' + (color ? ' style="color:' + color + '"' : '') + '>' + val + '</div></div>';
    };
    let cells = '', title = t('cost_panel_title');
    if (p.kind === 'menu') {
      title = t('cost_panel_title_menu');
      cells += cell(t('cost_menu_revenue'), money(c.totalRevenue));
      cells += cell(t('cost_menu_cost'), money(c.totalCost));
      cells += cell(t('cost_avg_food_cost'), (c.avgFoodCostPct != null ? c.avgFoodCostPct.toFixed(1) + '%' : '—'), pctColor(c.avgFoodCostPct));
    } else {
      if (c.salePrice != null) cells += cell(t('cost_sale_price'), money(c.salePrice));
      cells += cell(t('cost_food_cost_pct'), (c.foodCostPct != null ? c.foodCostPct.toFixed(1) + '%' : '—'), pctColor(c.foodCostPct));
      cells += cell(t('cost_per_serving'), money(c.perServing));
      if (c.grossProfit != null) cells += cell(t('cost_gross_profit'), money(c.grossProfit), c.grossProfit < 0 ? '#dc2626' : '');
    }
    return '<div class="cost-panel"><h2>' + escapeHtml(title) + '</h2>' +
      '<div class="cost-grid">' + cells + '</div>' +
      (p.kind !== 'menu' && c.total != null ? '<div class="cost-note">' + escapeHtml(t('cost_batch_total')) + ': ' + money(c.total) + ' · ' + (c.servings || 1) + '×</div>' : '') +
      '<div class="cost-note">' + escapeHtml(t('cost_disclaimer')) + '</div>' +
    '</div>';
  }

  // v2.44.34 — Recipe cost-share için tam maliyet kırılım tablosu. İç-uygulama
  // Cost Report (Simple) ile aynı: Ingredient · Unit price · Qty · Cost + toplam.
  // payload.cost.rows'tan okur (paylaşım anında gömülür). Etiketler İngilizce —
  // patron/muhasebeci için özel iç belge; iç-uygulama önizlemesiyle birebir.
  function costTableHtml(p) {
    const c = p.cost || {};
    if (!c.rows || !c.rows.length) return '';
    const cur = c.currency || '$';
    const money = function (n) { return cur + (Number(n) || 0).toFixed(2); };
    const num = function (n) { const x = Number(n) || 0; return (Math.round(x * 100) / 100).toString(); };
    let body = '';
    c.rows.forEach(function (row) {
      const up = (row.unitPrice != null) ? (cur + (Number(row.unitPrice) || 0).toFixed(2) + (row.stockUnit ? '/' + row.stockUnit : '')) : '—';
      const qty = num(row.amount) + (row.qtyUnit ? ' ' + row.qtyUnit : '');
      const sub = row.isSub ? ' <span class="ct-sub">SUB</span>' : '';
      body += '<tr><td class="ct-name">' + escapeHtml(row.name) + sub + '</td>' +
        '<td class="ct-up">' + escapeHtml(up) + '</td>' +
        '<td class="ct-qty">' + escapeHtml(qty) + '</td>' +
        '<td class="ct-cost">' + money(row.lineCost) + '</td></tr>';
    });
    let foot = '<tr class="ct-total"><td colspan="3">Total food cost</td><td>' + money(c.total) + '</td></tr>';
    if (c.isSubRecipe && c.yieldAmount) {
      foot += '<tr class="ct-sub2"><td colspan="3">Cost per ' + escapeHtml(c.yieldUnit || 'unit') + '</td><td>' + money((Number(c.total) || 0) / (Number(c.yieldAmount) || 1)) + '</td></tr>';
    } else if (c.servings) {
      foot += '<tr class="ct-sub2"><td colspan="3">Cost per serving</td><td>' + money(c.perServing) + '</td></tr>';
    }
    return '<div class="share-section"><h2>Cost breakdown</h2>' +
      '<table class="cost-table"><thead><tr>' +
        '<th class="ct-name">Ingredient</th><th class="ct-up">Unit price</th><th class="ct-qty">Qty</th><th class="ct-cost">Cost</th>' +
      '</tr></thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table></div>';
  }

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
      var _kcUnavailable = '<div style="padding:40px;text-align:center;color:#666;">Kitchen card renderer unavailable</div>';
      var _kcRender = function () {
        if (PCD.tools && PCD.tools.kitchenCards && PCD.tools.kitchenCards.renderFromSnapshot) {
          appEl.innerHTML = PCD.tools.kitchenCards.renderFromSnapshot(p);
        } else {
          appEl.innerHTML = _kcUnavailable;
        }
      };
      if (PCD.tools && PCD.tools.kitchenCards && PCD.tools.kitchenCards.renderFromSnapshot) {
        _kcRender();
      } else {
        // v2.44 fix — The public share page is the app shell with tools
        // lazy-loaded; the kitchen_cards renderer isn't loaded here (no route
        // navigation happens on a share view). Inject it on demand so shared
        // kitchen card links render instead of "renderer unavailable".
        var _kc = document.createElement('script');
        _kc.src = 'js/tools/kitchen_cards.js';
        _kc.onload = _kcRender;
        _kc.onerror = function () { appEl.innerHTML = _kcUnavailable; };
        document.head.appendChild(_kc);
      }
      return;
    }

    let html = '<style>' +
      '.share-page { max-width: 800px; margin: 0 auto; padding: 24px; font-family: "Inter", -apple-system, "Segoe UI", Roboto, sans-serif; font-variant-numeric:tabular-nums; }' +
      '.share-topbrand { text-align:center;padding:14px 16px 18px;font-size:13px;color:#888;border-bottom:1px solid #eee;margin-bottom:24px; }' +
      '.share-topbrand a { color:#1f9d6b;font-weight:700;text-decoration:none; }' +
      '.share-topbrand a:hover { text-decoration:underline; }' +
      '.share-content h1 { font-family:"Fraunces","Georgia",serif;font-size:28px;font-weight:600;letter-spacing:-0.01em;color:#16433a;margin:0 0 8px; }' +
      '.share-meta { color:#666;font-size:14px;margin-bottom:18px; }' +
      /* v2.8.67 — 1:1 standard (8 surfaces consistent). max-w 360px on desktop,
         100% width on mobile but still square. */
      '.share-photo { display:block;width:100%;max-width:360px;aspect-ratio:1/1;object-fit:cover;border-radius:12px;margin:0 auto 18px; }' +
      '.share-section { margin-bottom:22px; }' +
      '.share-section h2 { font-size:16px;color:#16433a;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.04em; }' +
      '.ing-row { display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:14px; }' +
      '.ing-row strong { color:#1f9d6b;font-family:var(--font-mono, monospace);font-variant-numeric:tabular-nums; }' +
      '.steps { white-space:pre-wrap;line-height:1.7;font-size:14px;color:#333; }' +
      '.menu-section { margin-bottom:24px; }' +
      '.menu-section-title { font-size:14px;text-transform:uppercase;letter-spacing:0.2em;color:#888;text-align:center;margin-bottom:14px; }' +
      '.menu-item { padding:10px 0;border-bottom:1px dashed #ddd; }' +
      '.menu-item-name { font-weight:600;font-size:16px;display:flex;justify-content:space-between; }' +
      '.menu-item-desc { color:#666;font-size:13px;font-style:italic;margin-top:4px; }' +
      '.share-footer { text-align:center;padding:24px;color:#999;font-size:12px;border-top:1px solid #eee;margin-top:32px; }' +
      '.share-footer a { color:#1f9d6b;text-decoration:none; }' +
      '.share-footer a:hover { text-decoration:underline; }' +
      /* v2.17 — Cost-view paneli (patron/muhasebeci) */
      '.cost-panel{background:#edf6f0;border:1px solid #cbe8d8;border-radius:12px;padding:18px;margin-bottom:24px;}' +
      '.cost-panel h2{font-family:"Fraunces","Georgia",serif;font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#16433a;margin:0 0 12px;}' +
      '.cost-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;}' +
      '.cost-cell{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;}' +
      '.cost-cell .lbl{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;}' +
      '.cost-cell .val{font-size:20px;font-weight:800;margin-top:2px;font-variant-numeric:tabular-nums;}' +
      '.cost-table{width:100%;border-collapse:collapse;font-size:13px;margin-top:4px;font-variant-numeric:tabular-nums;}' +
      '.cost-table th{text-align:right;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;color:#78716c;border-bottom:2px solid #16433a;font-weight:700;}' +
      '.cost-table th.ct-name{text-align:left;}' +
      '.cost-table td{padding:7px 10px;border-bottom:1px solid #e7e5e4;text-align:right;color:#1c1917;}' +
      '.cost-table td.ct-name{text-align:left;}' +
      '.cost-table td.ct-up,.cost-table td.ct-qty{color:#78716c;font-size:12px;}' +
      '.cost-table td.ct-cost{color:#1f9d6b;font-weight:700;}' +
      '.cost-table .ct-sub{display:inline-block;font-size:9px;font-weight:700;color:#16433a;background:#eaf6f0;border-radius:4px;padding:1px 5px;letter-spacing:0.04em;vertical-align:middle;margin-inline-start:4px;}' +
      '.cost-table tfoot .ct-total td{border-top:2px solid #16433a;border-bottom:none;font-weight:800;color:#16433a;padding-top:10px;}' +
      '.cost-table tfoot .ct-sub2 td{border-bottom:none;color:#78716c;padding-top:2px;}' +
      '.cost-table tfoot td:first-child{text-align:right;}' +
      '@media print{.cost-table td.ct-cost,.cost-table .ct-sub,.cost-table tfoot .ct-total td{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}}' +
      '.cost-note{font-size:11px;color:#6b7280;margin-top:10px;}' +
      '@media print{.cost-panel,.cost-cell{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}}' +
    '</style>';

    html += '<div class="share-page">';
    // Subtle top brand line — small unobtrusive promo strip at the top.
    // Old large green banner and "Try free" CTA removed; footer
    // already says "Made with ProChefDesk".
    html += '<div class="share-topbrand">' +
      '<a href="' + location.origin + location.pathname + '" target="_blank" rel="noopener">ProChefDesk</a>' +
    '</div>';

    html += '<div class="share-content">';

    // v2.17 — Cost-view paneli (yalnızca cost-share'de payload.cost olur).
    if (p.cost) html += costPanelHtml(p, t);

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

      if (p.ingredients && p.ingredients.length > 0 && !(p.cost && p.cost.rows && p.cost.rows.length)) {
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
      if (p.cost && p.cost.rows && p.cost.rows.length) html += costTableHtml(p);
      if (p.steps) {
        html += '<div class="share-section"><h2>' + escapeHtml(t('share_method', 'Method')) + '</h2><div class="steps">' + escapeHtml(p.steps) + '</div></div>';
      }
      if (p.plating) {
        html += '<div class="share-section"><h2>' + escapeHtml(t('share_plating', 'Plating')) + '</h2><div class="steps">' + escapeHtml(p.plating) + '</div></div>';
      }
    } else if (p.kind === 'menu') {
      if (p._studio && p.studioHtml) {
        // v2.20 — Studio tasarımı: snapshot anında üretilmiş standalone HTML'i
        // doğrudan render et (Studio yüklü değil). Responsive ölçek innerHTML sonrası.
        if (p.studioFonts) html = html.replace('<style>', '<style>@import url("' + p.studioFonts + '");');
        var _sw = p.studioW || 794, _sh = p.studioH || 1123;
        html += '<div class="ms-share-wrap" style="width:100%;max-width:' + _sw + 'px;margin:0 auto;overflow:hidden;">' +
          '<div id="msShareScale" data-sw="' + _sw + '" data-sh="' + _sh + '" style="width:' + _sw + 'px;transform-origin:top left;">' + p.studioHtml + '</div></div>';
      } else {
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
      var currSym = (PCD.currencySymbol && PCD.currencySymbol()) || (PCD.settings && PCD.settings.currencySymbol) || '$';
      var sectionDecorCSS = '';
      if (th.sectionDecor === 'lines') sectionDecorCSS = '.sm-sec-title::before,.sm-sec-title::after{content:"";display:inline-block;width:20px;height:1px;background:'+accent+';vertical-align:middle;margin:0 12px;}';
      else if (th.sectionDecor === 'underline') sectionDecorCSS = '.sm-sec-title{border-bottom:2px solid '+accent+';padding-bottom:4px;display:inline-block;padding-left:20px;padding-right:20px;}';
      else if (th.sectionDecor === 'wavy') sectionDecorCSS = '.sm-sec-title::after{content:"~";display:block;color:'+accent+';font-size:1.3em;line-height:0.4;margin-top:4px;}';

      // Font import (all themes — share page may use any theme)
      var fontImport = '@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&family=Caveat:wght@400;600;700&family=Inter:wght@300;400;500;600;700;800&family=Nunito:wght@300;400;500;600;700&display=swap");';

      // Inject into shared page HTML
      html = html.replace('<style>', '<style>' + fontImport);
      html += '<style>' +
        '.sm-page{background:'+bg+';color:'+ink+';max-width:'+(p.pageSize==='landscape'?842:595)+'pt;margin:0 auto;padding:'+pagePadding+'pt '+(pagePadding+6)+'pt;font-family:'+th.bodyFont+';font-weight:'+th.bodyWeight+';border-radius:8px;}' +
        '.sm-cover{width:100%;height:180px;object-fit:cover;border-radius:6px;display:block;margin:0 0 '+(Math.round(pagePadding*0.5))+'pt;}' +
        '.sm-logo{display:block;width:'+logoSize+'pt;height:'+logoSize+'pt;margin:0 auto 12pt;object-fit:cover;border-radius:50%;}' +
        '.sm-header{text-align:center;margin-bottom:'+Math.round(pagePadding*0.75)+'pt;}' +
        '.sm-title{font-family:'+th.titleFont+';font-size:'+titleSize+'pt;font-weight:'+th.titleWeight+';letter-spacing:'+th.titleLetterSpacing+';margin:0 0 8pt;color:'+ink+';line-height:1.1;}' +
        '.sm-subtitle{font-size:11pt;color:'+mutedInk+';letter-spacing:0.24em;text-transform:uppercase;font-weight:400;margin:0;}' +
        '.sm-title-rule{width:40px;height:2px;background:'+accent+';margin:10pt auto 0;border:none;display:block;}' +
        '.sm-sections{'+(cols===2?'column-count:2;column-gap:'+(pagePadding*0.7)+'pt;':'')+'margin-top:0;}' +
        '.sm-section{break-inside:avoid;margin-bottom:'+Math.round(itemGap*secMult)+'pt;}' +
        '.sm-sec-title{font-family:'+th.titleFont+';font-size:'+sectionSize+'pt;font-weight:700;text-transform:'+th.sectionTransform+';letter-spacing:'+th.sectionLetterSpacing+';color:'+accent+';text-align:center;margin:0 0 '+Math.round(itemGap*1.2)+'pt;}' +
        sectionDecorCSS +
        '.sm-items{}' +
        '.sm-item{display:flex;justify-content:space-between;align-items:baseline;gap:8pt;margin-bottom:'+itemGap+'pt;break-inside:avoid;}' +
        '.sm-item-name{font-family:'+th.titleFont+';font-size:'+itemSize+'pt;font-weight:'+th.itemWeight+';color:'+ink+';flex-shrink:1;min-width:0;}' +
        '.sm-item-desc{font-size:'+Math.max(9,itemSize-4)+'pt;color:'+mutedInk+';margin-top:2pt;font-style:italic;}' +
        '.sm-item-codes{font-size:'+(itemSize-6)+'pt;color:'+mutedInk+';margin-top:2pt;}' +
        '.sm-item-leader{flex:1;border-bottom:1px dotted #ccc;margin:0 4pt 3pt;}' +
        '.sm-item-price{font-family:'+th.titleFont+';font-size:'+itemSize+'pt;font-weight:600;color:'+accent+';white-space:nowrap;flex-shrink:0;}' +
        '.sm-footer{text-align:center;margin-top:'+Math.round(pagePadding*0.75)+'pt;font-size:11pt;color:'+mutedInk+';text-transform:uppercase;letter-spacing:0.12em;border-top:1px solid '+(accent+'33')+';padding-top:'+Math.round(pagePadding*0.5)+'pt;}' +
        '.sm-allergen-legend{margin-top:'+Math.round(pagePadding*0.5)+'pt;padding-top:'+Math.round(pagePadding*0.3)+'pt;border-top:1px solid '+(accent+'33')+';font-size:10pt;color:'+mutedInk+';text-align:center;}' +
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
          var showPrice = (priceStyle !== 'hidden') && it.price != null && it.price !== '' && price >= 0;
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
    }

    html += '</div>';
    // v2.8.54 — Standard clickable footer. Brand name + URL link;
    // Same format across all app print + share + QR flows
    // (matches PCD.print in utils.js for visual consistency).
    // v2.17 — Watermark plana bağlı: p._wm===false (Pro sharer) ise footer
    // gösterilmez. Eski paylaşımlarda flag yok (undefined) → footer kalır.
    if (p._wm !== false) {
      html += '<div class="share-footer">' +
        'Made with <a href="https://prochefdesk.com" target="_blank" rel="noopener"><strong>ProChefDesk</strong></a> · <a href="https://prochefdesk.com" target="_blank" rel="noopener">prochefdesk.com</a>' +
      '</div>';
    }
    html += '</div>';

    appEl.innerHTML = html;
    appEl.classList.remove('hidden');
    document.title = (p.name || 'ProChefDesk') + ' · ProChefDesk';

    // v2.20 — Studio paylaşımı: sabit-px sayfayı viewport'a sığacak şekilde ölçekle.
    if (p._studio) {
      const scaleEl = document.getElementById('msShareScale');
      if (scaleEl && scaleEl.parentElement) {
        const wrap = scaleEl.parentElement;
        const sw = parseFloat(scaleEl.getAttribute('data-sw')) || 794;
        const sh = parseFloat(scaleEl.getAttribute('data-sh')) || 1123;
        const fit = function () { const w = wrap.clientWidth || sw; const k = Math.min(1, w / sw); scaleEl.style.transform = 'scale(' + k + ')'; wrap.style.height = (sh * k) + 'px'; };
        fit(); setTimeout(fit, 60); window.addEventListener('resize', fit);
      }
    }
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
          '<a href="' + location.origin + location.pathname + '" style="color:#1f9d6b;font-weight:700;text-decoration:none;margin-top:14px;">Open ProChefDesk →</a>' +
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
          '<a href="' + location.origin + location.pathname + '" style="color:#1f9d6b;font-weight:700;text-decoration:none;margin-top:24px;">' + escapeHtml(back) + '</a>' +
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
