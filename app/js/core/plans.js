/* ================================================================
   ProChefDesk — plans.js
   ----------------------------------------------------------------
   TEK DOĞRULUK KAYNAĞI — tüm plan limitleri / feature gate'leri
   SADECE buradan okunur. Hiçbir yere dağınık `if (plan==='pro')`
   yazılmaz; bunun yerine PCD.plans.getPlanLimits() çağrılır ve
   ilgili anahtar kontrol edilir (gate.js bunu sarmalar).

   Operatör notu: bir özelliği plana açmak/kapamak için AŞAĞIDAKİ
   tabloda ilgili satırı değiştirmen yeterli. Başka hiçbir dosyaya
   dokunmana gerek yok.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD || (window.PCD = {});

  // ==============================================================
  // PLAN LİMİTLERİ — başlangıç değerleri (spec Bölüm 2 tablosu)
  // maxRecipes / maxIngredients / maxWorkspaces sayısaldır;
  // Infinity = sınırsız. Diğerleri boolean (açık/kapalı).
  // ==============================================================
  const PLAN_LIMITS = {
    free: {
      maxRecipes:       15,
      maxIngredients:   50,
      maxWorkspaces:    1,
      cloudSync:        false,
      haccp:            false,
      laborCost:        false,
      costViewShare:    false,
      watermark:        true,   // free çıktı/paylaşımda footer KALIR (pazarlama)
      exports:          true,   // print/excel free'de de açık (bağımlılık = satış)
      discoverPublish:  true,
    },
    pro: {
      maxRecipes:       Infinity,
      maxIngredients:   Infinity,
      maxWorkspaces:    Infinity,
      cloudSync:        true,
      haccp:            true,
      laborCost:        true,
      costViewShare:    true,
      watermark:        false,  // pro çıktı/URL/QR paylaşım TEMİZ — marka yok
      exports:          true,
      discoverPublish:  true,
    },
  };

  // ==============================================================
  // getUserPlan() → 'free' | 'pro'
  // ----------------------------------------------------------------
  // Aktif kullanıcının planını döndürür. Kaynak: PCD.store.get('plan')
  // (boot'ta Supabase user_prefs.plan kolonundan doldurulur —
  // server otoriter, IndexedDB cache; bkz. cloud.js pull).
  //   - plan_source frontend'i İLGİLENDİRMEZ (manuel mi Stripe mi
  //     fark etmez); sadece plan değeri önemli.
  //   - Eski veri uyumu: 'team' değeri varsa pro muamelesi görür.
  //   - Plan tanımsız / bilinmeyen → güvenli varsayılan 'free'.
  // ==============================================================
  function getUserPlan() {
    let plan = 'free';
    try {
      if (PCD.store && PCD.store.get) plan = PCD.store.get('plan') || 'free';
    } catch (e) { /* store hazır değilse free */ }
    if (plan === 'pro' || plan === 'team') return 'pro';
    return 'free';
  }

  // ==============================================================
  // getPlanLimits() → aktif kullanıcının limit objesi.
  // TÜM gate'ler ve UI bunu çağırır.
  // ==============================================================
  function getPlanLimits() {
    return PLAN_LIMITS[getUserPlan()] || PLAN_LIMITS.free;
  }

  PCD.plans = {
    PLAN_LIMITS: PLAN_LIMITS,
    getUserPlan: getUserPlan,
    getPlanLimits: getPlanLimits,
  };
})();
