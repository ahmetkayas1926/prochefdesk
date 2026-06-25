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
      // İçerik limitleri (sayısal; Infinity = sınırsız)
      maxRecipes:       4,
      maxIngredients:   20,
      maxWorkspaces:    1,
      // Diğer araçlar: her birinden 1'er (free = "bir tane dene")
      maxMenus:         1,
      maxEvents:        1,
      maxBuffets:       1,
      maxRosters:       1,
      maxWhiteboards:   1,
      maxChecklists:    1,
      maxPrepSheets:    1,
      // Özellik gate'leri
      cloudSync:        false,
      haccp:            false,
      laborCost:        false,
      costViewShare:    false,
      publicShare:      false,  // link / URL / QR paylaşımı = yalnız Pro
      watermark:        true,   // free çıktı/paylaşımda footer KALIR (pazarlama)
      // Çıktı: araç başına İLK çıktı ücretsiz (kanca), sonrası Pro duvarı.
      exportFirstFree:  true,
      rosterExport:     false,  // roster çıktısı free'de TAMAMEN kapalı (Pro)
      discoverPublish:  true,
    },
    pro: {
      maxRecipes:       Infinity,
      maxIngredients:   Infinity,
      maxWorkspaces:    Infinity,
      maxMenus:         Infinity,
      maxEvents:        Infinity,
      maxBuffets:       Infinity,
      maxRosters:       Infinity,
      maxWhiteboards:   Infinity,
      maxChecklists:    Infinity,
      maxPrepSheets:    Infinity,
      cloudSync:        true,
      haccp:            true,
      laborCost:        true,
      costViewShare:    true,
      publicShare:      true,
      watermark:        false,  // pro çıktı/URL/QR paylaşım TEMİZ — marka yok
      exportFirstFree:  false,  // sınırsız çıktı
      rosterExport:     true,
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
