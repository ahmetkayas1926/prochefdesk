/* ================================================================
   ProChefDesk — allergens-db.js
   Shared allergen database used by Allergens tool + Recipe editor.

   EU FIC Regulation 1169/2011 — Annex II: 14 major allergens
   Reference: https://www.efsa.europa.eu/en/safe2eat/food-allergens
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // The 14 EU allergens with icon + common-name keywords for auto-detection.
  // Icons chosen to be universally recognized.
  const ALLERGENS = [
    { key: 'gluten',      icon: '🌾', keywords: ['wheat', 'flour', 'rye', 'barley', 'oat', 'spelt', 'semolina', 'couscous', 'bulgur', 'pasta', 'spaghetti', 'penne', 'fusilli', 'linguine', 'tagliatelle', 'fettuccine', 'macaroni', 'lasagne', 'lasagna', 'ravioli', 'tortellini', 'noodle', 'ramen', 'udon', 'soba', 'bread', 'baguette', 'brioche', 'ciabatta', 'focaccia', 'breadcrumb', 'panko', 'biscuit', 'cracker', 'cookie', 'cake', 'muffin', 'pastry', 'pizza dough', 'tortilla', 'pita', 'cereal', 'beer', 'malt', 'buğday', 'un', 'arpa', 'yulaf', 'çavdar', 'ekmek', 'makarna', 'erişte', 'mantı', 'lahmacun', 'pide', 'börek', 'simit'] },
    { key: 'crustaceans', icon: '🦐', keywords: ['shrimp', 'prawn', 'lobster', 'crab', 'crayfish', 'langoustine', 'karides', 'istakoz', 'yengeç'] },
    { key: 'eggs',        icon: '🥚', keywords: ['egg', 'albumen', 'meringue', 'mayonnaise', 'yumurta'] },
    { key: 'fish',        icon: '🐟', keywords: ['fish', 'salmon', 'tuna', 'cod', 'anchovy', 'sardine', 'bass', 'trout', 'mackerel', 'halibut', 'haddock', 'balık', 'somon', 'ton', 'morina', 'hamsi'] },
    { key: 'peanuts',     icon: '🥜', keywords: ['peanut', 'groundnut', 'arachide', 'yer fıstığı', 'yerfıstığı'] },
    { key: 'soybeans',    icon: '🫘', keywords: ['soy', 'soya', 'soybean', 'edamame', 'tofu', 'tempeh', 'miso', 'soya sosu'] },
    { key: 'dairy',       icon: '🥛', keywords: ['milk', 'cream', 'butter', 'cheese', 'yogurt', 'yoghurt', 'whey', 'casein', 'lactose', 'mozzarella', 'cheddar', 'parmigian', 'parmesan', 'pecorino', 'ricotta', 'feta', 'gouda', 'süt', 'krema', 'tereyağ', 'peynir', 'yoğurt', 'kaymak', 'lor', 'kaşar'] },
    { key: 'nuts',        icon: '🌰', keywords: ['almond', 'hazelnut', 'walnut', 'cashew', 'pecan', 'brazil nut', 'pistachio', 'macadamia', 'badem', 'fındık', 'ceviz', 'kaju', 'antep fıstığı'] },
    { key: 'celery',      icon: '🌿', keywords: ['celery', 'celeriac', 'kereviz'] },
    { key: 'mustard',     icon: '🟡', keywords: ['mustard', 'dijon', 'hardal'] },
    { key: 'sesame',      icon: '⚪', keywords: ['sesame', 'tahini', 'susam', 'tahin'] },
    { key: 'sulphites',   icon: '🍷', keywords: ['sulphite', 'sulfite', 'wine', 'dried fruit', 'sülfit', 'şarap'] },
    { key: 'lupin',       icon: '🌼', keywords: ['lupin', 'lupine', 'acıbakla'] },
    { key: 'molluscs',    icon: '🦪', keywords: ['mussel', 'oyster', 'clam', 'squid', 'octopus', 'scallop', 'snail', 'cuttlefish', 'midye', 'istiridye', 'kalamar', 'ahtapot', 'deniz tarağı'] },
  ];

  // Auto-detect allergens in ingredient name (returns array of allergen keys)
  function autoDetect(ingredientName) {
    if (!ingredientName) return [];
    const lower = ingredientName.toLowerCase();
    const detected = [];

    // Compound exceptions: "peanut/almond/cashew/... butter" is NOT dairy
    // "coconut milk/cream" is NOT dairy (coconut isn't a tree nut per EU FIC either)
    // "soy milk/cream" is NOT dairy but still soybeans
    const nutButterRe = /\b(peanut|almond|cashew|hazelnut|pistachio|macadamia|walnut|pecan|sunflower|sesame)\s+butter\b/i;
    const plantMilkRe = /\b(coconut|almond|soy|soya|oat|rice|cashew|hazelnut|hemp|pea)\s+(milk|cream|yogurt|yoghurt)\b/i;
    const isNutButter = nutButterRe.test(lower);
    const isPlantMilk = plantMilkRe.test(lower);

    ALLERGENS.forEach(function (a) {
      for (let i = 0; i < a.keywords.length; i++) {
        const kw = a.keywords[i].toLowerCase();
        if (lower.indexOf(kw) >= 0) {
          // Skip dairy match if this is a nut-butter or plant-milk compound
          if (a.key === 'dairy' && (isNutButter || isPlantMilk)) {
            // But oat milk contains gluten via oat keyword, so don't block oat match
            continue;
          }
          detected.push(a.key);
          return;
        }
      }
    });
    return detected;
  }

  // Get recipe's allergen set (union of all ingredient allergens)
  function recipeAllergens(recipe, ingredients) {
    const set = {};
    if (!recipe || !recipe.ingredients) return [];
    const ingMap = {};
    ingredients.forEach(function (i) { ingMap[i.id] = i; });

    recipe.ingredients.forEach(function (ri) {
      const ing = ingMap[ri.ingredientId];
      if (!ing) return;
      // Prefer explicit allergens array on ingredient, else auto-detect
      let tags = ing.allergens;
      if (!tags || !tags.length) tags = autoDetect(ing.name);
      tags.forEach(function (k) { set[k] = true; });
    });

    // Also include explicit recipe-level allergens
    if (recipe.allergens) {
      recipe.allergens.forEach(function (k) {
        // accept either legacy keys or EU keys
        const found = ALLERGENS.find(function (a) { return a.key === k; });
        if (found) set[k] = true;
      });
    }

    return Object.keys(set);
  }

  PCD.allergensDB = {
    list: ALLERGENS,
    getByKey: function (k) { return ALLERGENS.find(function (a) { return a.key === k; }); },
    autoDetect: autoDetect,
    recipeAllergens: recipeAllergens,
  };
})();
