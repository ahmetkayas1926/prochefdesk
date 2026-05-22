/* ================================================================
   ProChefDesk — demo-recipes.js
   Three international recipes seeded on first load so users can
   explore the app immediately. They can be removed from Account
   or by using bulk delete.

   All photos are from Unsplash (free to use license, no attribution).
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  // --- Shared ingredient set used across demo recipes ---
  const demoIngredients = [
    // Pasta / Italian
    { name: 'Spaghetti pasta',        unit: 'g',  pricePerUnit: 0.004, category: 'cat_dry_goods' },
    { name: 'Pancetta',               unit: 'g',  pricePerUnit: 0.028, category: 'cat_meat' },
    { name: 'Eggs (large)',           unit: 'pcs',pricePerUnit: 0.45,  category: 'cat_dairy' },
    { name: 'Pecorino Romano',        unit: 'g',  pricePerUnit: 0.035, category: 'cat_dairy' },
    { name: 'Parmigiano Reggiano',    unit: 'g',  pricePerUnit: 0.040, category: 'cat_dairy' },
    { name: 'Black pepper',           unit: 'g',  pricePerUnit: 0.020, category: 'cat_spices' },
    { name: 'Sea salt',               unit: 'g',  pricePerUnit: 0.003, category: 'cat_spices' },
    // Indian
    { name: 'Chicken thigh boneless', unit: 'g',  pricePerUnit: 0.012, category: 'cat_poultry' },
    { name: 'Tomato puree',           unit: 'ml', pricePerUnit: 0.004, category: 'cat_produce' },
    { name: 'Heavy cream',            unit: 'ml', pricePerUnit: 0.008, category: 'cat_dairy' },
    { name: 'Plain yogurt',           unit: 'g',  pricePerUnit: 0.004, category: 'cat_dairy' },
    { name: 'Butter',                 unit: 'g',  pricePerUnit: 0.012, category: 'cat_dairy' },
    { name: 'Garam masala',           unit: 'g',  pricePerUnit: 0.050, category: 'cat_spices' },
    { name: 'Ground cumin',           unit: 'g',  pricePerUnit: 0.030, category: 'cat_spices' },
    { name: 'Paprika (smoked)',       unit: 'g',  pricePerUnit: 0.040, category: 'cat_spices' },
    { name: 'Turmeric',               unit: 'g',  pricePerUnit: 0.030, category: 'cat_spices' },
    { name: 'Ginger fresh',           unit: 'g',  pricePerUnit: 0.010, category: 'cat_produce' },
    { name: 'Garlic cloves',          unit: 'g',  pricePerUnit: 0.012, category: 'cat_produce' },
    { name: 'Onion',                  unit: 'g',  pricePerUnit: 0.003, category: 'cat_produce' },
    { name: 'Basmati rice',           unit: 'g',  pricePerUnit: 0.005, category: 'cat_dry_goods' },
    // Burger
    { name: 'Beef mince (80/20)',     unit: 'g',  pricePerUnit: 0.015, category: 'cat_meat' },
    { name: 'Burger buns brioche',    unit: 'pcs',pricePerUnit: 0.80,  category: 'cat_baking' },
    { name: 'Cheddar cheese slices',  unit: 'pcs',pricePerUnit: 0.35,  category: 'cat_dairy' },
    { name: 'Iceberg lettuce',        unit: 'g',  pricePerUnit: 0.004, category: 'cat_produce' },
    { name: 'Tomato',                 unit: 'g',  pricePerUnit: 0.005, category: 'cat_produce' },
    { name: 'Red onion',              unit: 'g',  pricePerUnit: 0.003, category: 'cat_produce' },
    { name: 'Pickles',                unit: 'g',  pricePerUnit: 0.007, category: 'cat_produce' },
    { name: 'Mayonnaise',             unit: 'g',  pricePerUnit: 0.005, category: 'cat_oils' },
    { name: 'Mustard Dijon',          unit: 'g',  pricePerUnit: 0.010, category: 'cat_spices' },
    { name: 'Ketchup',                unit: 'g',  pricePerUnit: 0.004, category: 'cat_spices' },
    { name: 'Olive oil',              unit: 'ml', pricePerUnit: 0.012, category: 'cat_oils' },
    // Mediterranean / salad (v2.14.3 demo expansion) — supplier + yield% showcase
    { name: 'Cucumber',               unit: 'g',  pricePerUnit: 0.004, category: 'cat_produce', supplier: 'Fresh Farm Co.', yieldPercent: 95 },
    { name: 'Feta cheese',            unit: 'g',  pricePerUnit: 0.018, category: 'cat_dairy',   supplier: 'Dairy Direct' },
    { name: 'Kalamata olives',        unit: 'g',  pricePerUnit: 0.016, category: 'cat_produce', supplier: 'Fresh Farm Co.' },
    { name: 'Dried oregano',          unit: 'g',  pricePerUnit: 0.045, category: 'cat_spices',  supplier: 'Spice Importers' },
    // Pizza
    { name: 'Pizza flour 00',         unit: 'g',  pricePerUnit: 0.003, category: 'cat_baking',  supplier: 'Bakery Wholesale' },
    { name: 'Mozzarella',             unit: 'g',  pricePerUnit: 0.014, category: 'cat_dairy',   supplier: 'Dairy Direct' },
    { name: 'Fresh basil',            unit: 'g',  pricePerUnit: 0.060, category: 'cat_produce', supplier: 'Fresh Farm Co.' },
    // Seafood
    { name: 'Salmon fillet',          unit: 'g',  pricePerUnit: 0.032, category: 'cat_seafood', yieldPercent: 90 },
    { name: 'Lemon',                  unit: 'g',  pricePerUnit: 0.005, category: 'cat_produce', supplier: 'Fresh Farm Co.', yieldPercent: 45 },
  ];

  // Helper to find ingredient ID by name (after seeding)
  function findId(list, name) {
    const found = list.find(function (x) { return x.name === name; });
    return found ? found.id : null;
  }

  function seedDemo() {
    if (PCD.store.get('onboarding.demoSeeded')) return;

    // 1) Upsert ingredients and keep their IDs
    const upserted = demoIngredients.map(function (ing) {
      const obj = {
        name: ing.name,
        unit: ing.unit,
        pricePerUnit: ing.pricePerUnit,
        category: ing.category,
        supplier: ing.supplier || '',
        _demo: true,
      };
      if (ing.yieldPercent != null) obj.yieldPercent = ing.yieldPercent;
      return PCD.store.upsertIngredient(obj);
    });

    // 2) Seed recipes
    // Using Unsplash CC0 URLs (free to use, no attribution required)
    // Pasta: https://unsplash.com/photos/spaghetti
    // Tikka: https://unsplash.com/photos/chicken-tikka
    // Burger: https://unsplash.com/photos/cheeseburger

    const carbonara = {
      name: 'Spaghetti alla Carbonara',
      category: 'cat_main',
      cuisine: 'Italian',
      servings: 4,
      prepTime: 10,
      cookTime: 15,
      photo: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=1200&q=80',
      salePrice: 18,
      ingredients: [
        { ingredientId: findId(upserted, 'Spaghetti pasta'),     amount: 400, unit: 'g' },
        { ingredientId: findId(upserted, 'Pancetta'),            amount: 150, unit: 'g' },
        { ingredientId: findId(upserted, 'Eggs (large)'),        amount: 4,   unit: 'pcs' },
        { ingredientId: findId(upserted, 'Pecorino Romano'),     amount: 60,  unit: 'g' },
        { ingredientId: findId(upserted, 'Parmigiano Reggiano'), amount: 40,  unit: 'g' },
        { ingredientId: findId(upserted, 'Black pepper'),        amount: 3,   unit: 'g' },
        { ingredientId: findId(upserted, 'Sea salt'),            amount: 10,  unit: 'g' },
      ],
      steps: [
        'Bring a large pot of well-salted water to a boil.',
        'Dice the pancetta and render it in a dry pan over medium heat until crisp. Set aside.',
        'Whisk the yolks and whole eggs with grated Pecorino and Parmigiano, plus plenty of black pepper.',
        'Cook the spaghetti al dente. Reserve 1 cup of pasta water.',
        'Off the heat, toss hot pasta with pancetta, then stir in the egg-cheese mix quickly. Add splashes of pasta water until silky.',
        'Serve immediately with extra cheese and pepper.'
      ].join('\n\n'),
      plating: 'Twirl in a shallow bowl. Top with extra cheese and a crack of pepper. Serve fast.',
      allergens: ['eggs', 'dairy', 'gluten'],
      _demo: true,
    };

    const tikka = {
      name: 'Chicken Tikka Masala',
      category: 'cat_main',
      cuisine: 'Indian / British',
      servings: 4,
      prepTime: 20,
      cookTime: 35,
      photo: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=1200&q=80',
      salePrice: 22,
      ingredients: [
        { ingredientId: findId(upserted, 'Chicken thigh boneless'), amount: 800, unit: 'g' },
        { ingredientId: findId(upserted, 'Plain yogurt'),           amount: 250, unit: 'g' },
        { ingredientId: findId(upserted, 'Tomato puree'),           amount: 400, unit: 'ml' },
        { ingredientId: findId(upserted, 'Heavy cream'),            amount: 200, unit: 'ml' },
        { ingredientId: findId(upserted, 'Butter'),                 amount: 40,  unit: 'g' },
        { ingredientId: findId(upserted, 'Garam masala'),           amount: 8,   unit: 'g' },
        { ingredientId: findId(upserted, 'Ground cumin'),           amount: 5,   unit: 'g' },
        { ingredientId: findId(upserted, 'Paprika (smoked)'),       amount: 5,   unit: 'g' },
        { ingredientId: findId(upserted, 'Turmeric'),               amount: 3,   unit: 'g' },
        { ingredientId: findId(upserted, 'Ginger fresh'),           amount: 20,  unit: 'g' },
        { ingredientId: findId(upserted, 'Garlic cloves'),          amount: 15,  unit: 'g' },
        { ingredientId: findId(upserted, 'Onion'),                  amount: 200, unit: 'g' },
        { ingredientId: findId(upserted, 'Basmati rice'),           amount: 300, unit: 'g' },
        { ingredientId: findId(upserted, 'Sea salt'),               amount: 10,  unit: 'g' },
        { ingredientId: findId(upserted, 'Olive oil'),              amount: 30,  unit: 'ml' },
      ],
      steps: [
        'Marinate chicken in yogurt, half the spices, minced ginger and garlic for at least 2 hours.',
        'Sear chicken on a hot grill or skillet until charred but not fully cooked. Set aside.',
        'Sweat onions in butter + oil until golden. Add remaining spices, ginger, garlic.',
        'Add tomato puree and simmer 10 minutes until color deepens.',
        'Stir in cream and the chicken, simmer 12-15 minutes until sauce thickens.',
        'Meanwhile steam basmati rice. Finish sauce with salt and a knob of butter.',
        'Serve over rice with fresh coriander.'
      ].join('\n\n'),
      plating: 'Bowl of rice centered, ladle sauce around. Garnish with coriander and a swirl of cream.',
      allergens: ['dairy'],
      _demo: true,
    };

    const burger = {
      name: 'Classic Cheeseburger',
      category: 'cat_main',
      cuisine: 'American',
      servings: 2,
      prepTime: 10,
      cookTime: 10,
      photo: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=1200&q=80',
      salePrice: 15,
      ingredients: [
        { ingredientId: findId(upserted, 'Beef mince (80/20)'),     amount: 320, unit: 'g' },
        { ingredientId: findId(upserted, 'Burger buns brioche'),    amount: 2,   unit: 'pcs' },
        { ingredientId: findId(upserted, 'Cheddar cheese slices'),  amount: 2,   unit: 'pcs' },
        { ingredientId: findId(upserted, 'Iceberg lettuce'),        amount: 40,  unit: 'g' },
        { ingredientId: findId(upserted, 'Tomato'),                 amount: 80,  unit: 'g' },
        { ingredientId: findId(upserted, 'Red onion'),              amount: 30,  unit: 'g' },
        { ingredientId: findId(upserted, 'Pickles'),                amount: 20,  unit: 'g' },
        { ingredientId: findId(upserted, 'Mayonnaise'),             amount: 20,  unit: 'g' },
        { ingredientId: findId(upserted, 'Mustard Dijon'),          amount: 8,   unit: 'g' },
        { ingredientId: findId(upserted, 'Ketchup'),                amount: 15,  unit: 'g' },
        { ingredientId: findId(upserted, 'Sea salt'),               amount: 3,   unit: 'g' },
        { ingredientId: findId(upserted, 'Black pepper'),           amount: 1,   unit: 'g' },
      ],
      steps: [
        'Form mince into two 160g patties slightly wider than the buns. Season with salt and pepper only.',
        'Heat a skillet or flat-top very hot. Cook patties 2 minutes per side for medium.',
        'After the flip, add a slice of cheddar; cover briefly to melt.',
        'Toast buns cut-side down in the same pan.',
        'Spread mayo + mustard on the bottom bun, ketchup on the top. Build: bun, lettuce, patty, onion, pickles, tomato, top bun.',
        'Serve immediately while cheese is molten.'
      ].join('\n\n'),
      plating: 'Stack on a wooden board with fries alongside. Pierce with a skewer to hold shape.',
      allergens: ['dairy', 'gluten', 'eggs'],
      _demo: true,
    };

    // v2.14.3 — 3 ek demo recipe: Akdeniz/İtalyan/deniz ürünü çeşitliliği +
    // vejetaryen/glutensiz diyet kodu sergisi (menüde gösterilir). Foto yok
    // (operatör editörden ekleyebilir / çalışan Unsplash linki verirse bağlarım).
    const greek = {
      name: 'Greek Salad',
      category: 'cat_salad',
      cuisine: 'Greek',
      servings: 4,
      prepTime: 15,
      cookTime: 0,
      salePrice: 12,
      ingredients: [
        { ingredientId: findId(upserted, 'Tomato'),          amount: 400, unit: 'g' },
        { ingredientId: findId(upserted, 'Cucumber'),        amount: 300, unit: 'g' },
        { ingredientId: findId(upserted, 'Red onion'),       amount: 80,  unit: 'g' },
        { ingredientId: findId(upserted, 'Feta cheese'),     amount: 200, unit: 'g' },
        { ingredientId: findId(upserted, 'Kalamata olives'), amount: 80,  unit: 'g' },
        { ingredientId: findId(upserted, 'Olive oil'),       amount: 40,  unit: 'ml' },
        { ingredientId: findId(upserted, 'Dried oregano'),   amount: 3,   unit: 'g' },
        { ingredientId: findId(upserted, 'Sea salt'),        amount: 4,   unit: 'g' },
        { ingredientId: findId(upserted, 'Black pepper'),    amount: 2,   unit: 'g' },
      ],
      steps: [
        'Cut tomatoes into wedges and cucumber into thick half-moons.',
        'Slice red onion thinly. Combine vegetables in a bowl with the olives.',
        'Dress with olive oil, dried oregano, salt and pepper. Toss gently.',
        'Top with a slab (not crumbled) of feta. Finish with a little more oregano and oil.'
      ].join('\n\n'),
      plating: 'Pile high in a shallow bowl, feta slab on top, drizzle of oil. Rustic, generous.',
      allergens: ['dairy'],
      _demo: true,
    };

    const pizza = {
      name: 'Margherita Pizza',
      category: 'cat_main',
      cuisine: 'Italian',
      servings: 2,
      prepTime: 90,
      cookTime: 8,
      salePrice: 14,
      ingredients: [
        { ingredientId: findId(upserted, 'Pizza flour 00'), amount: 320, unit: 'g' },
        { ingredientId: findId(upserted, 'Tomato puree'),   amount: 150, unit: 'ml' },
        { ingredientId: findId(upserted, 'Mozzarella'),     amount: 200, unit: 'g' },
        { ingredientId: findId(upserted, 'Fresh basil'),    amount: 10,  unit: 'g' },
        { ingredientId: findId(upserted, 'Olive oil'),      amount: 20,  unit: 'ml' },
        { ingredientId: findId(upserted, 'Sea salt'),       amount: 6,   unit: 'g' },
      ],
      steps: [
        'Make a dough with flour, water, salt and a pinch of yeast. Knead, then prove 1-2 hours.',
        'Stretch into two bases. Heat the oven as hot as it goes with a stone or steel.',
        'Spread a thin layer of seasoned tomato puree, leaving a border for the crust.',
        'Tear over mozzarella. Bake until the crust is blistered and the cheese bubbles.',
        'Finish with fresh basil and a drizzle of olive oil.'
      ].join('\n\n'),
      plating: 'Whole, uncut, basil centered. Slice at the table for the aroma.',
      allergens: ['gluten', 'dairy'],
      _demo: true,
    };

    const salmon = {
      name: 'Pan-Seared Salmon',
      category: 'cat_main',
      cuisine: 'Modern',
      servings: 2,
      prepTime: 10,
      cookTime: 12,
      salePrice: 24,
      ingredients: [
        { ingredientId: findId(upserted, 'Salmon fillet'),  amount: 360, unit: 'g' },
        { ingredientId: findId(upserted, 'Lemon'),          amount: 60,  unit: 'g' },
        { ingredientId: findId(upserted, 'Butter'),         amount: 30,  unit: 'g' },
        { ingredientId: findId(upserted, 'Garlic cloves'),  amount: 10,  unit: 'g' },
        { ingredientId: findId(upserted, 'Olive oil'),      amount: 15,  unit: 'ml' },
        { ingredientId: findId(upserted, 'Sea salt'),       amount: 4,   unit: 'g' },
        { ingredientId: findId(upserted, 'Black pepper'),   amount: 2,   unit: 'g' },
      ],
      steps: [
        'Pat the salmon dry and season skin-side with salt.',
        'Sear skin-side down in hot oil, pressing flat, until the skin is crisp (about 6 minutes).',
        'Flip, add butter and crushed garlic, and baste for 2-3 minutes to medium.',
        'Squeeze over lemon off the heat and rest 1 minute before plating.'
      ].join('\n\n'),
      plating: 'Skin up to stay crisp, lemon cheek alongside, spoon the garlic butter over.',
      allergens: ['fish', 'dairy'],
      _demo: true,
    };

    PCD.store.upsertRecipe(carbonara);
    PCD.store.upsertRecipe(tikka);
    PCD.store.upsertRecipe(burger);
    PCD.store.upsertRecipe(greek);
    PCD.store.upsertRecipe(pizza);
    PCD.store.upsertRecipe(salmon);

    // Re-fetch with their assigned ids
    const all = PCD.store.listRecipes();
    const carbonaraR = all.find(function (r) { return r.name === 'Spaghetti alla Carbonara'; });
    const tikkaR = all.find(function (r) { return r.name === 'Chicken Tikka Masala'; });
    const burgerR = all.find(function (r) { return r.name === 'Classic Cheeseburger'; });
    const greekR = all.find(function (r) { return r.name === 'Greek Salad'; });
    const pizzaR = all.find(function (r) { return r.name === 'Margherita Pizza'; });
    const salmonR = all.find(function (r) { return r.name === 'Pan-Seared Salmon'; });

    // v2.8.24 — Removed the older "DEMO MENU" seed block here. A second
    // identical "DEMO MENU (added v2.6.30)" block further down was the
    // intended one; this earlier copy was a leftover that duplicated the
    // "Lunch Menu" entry in the demo workspace.

    // === DEMO SUPPLIERS ===
    // v2.14.3 — Kategori değerleri suppliers.js CATS görünen adlarına düzeltildi
    // (önceki cat_* kodları hepsini "Other" altına düşürüyordu). Ürünler gerçek
    // demo malzeme adlarıyla eşleşir. Seafood tedarikçisi eklendi (yeni salmon).
    const supplierData = [
      { name: 'Fresh Farm Co.', category: 'Produce', phone: '+1 555 0101', email: 'orders@freshfarm.example', products: [
        { name: 'Tomato', unit: 'kg' },
        { name: 'Cucumber', unit: 'kg' },
        { name: 'Onion', unit: 'kg' },
        { name: 'Red onion', unit: 'kg' },
        { name: 'Garlic cloves', unit: 'kg' },
        { name: 'Fresh basil', unit: 'bunch' },
        { name: 'Lemon', unit: 'kg' },
      ]},
      { name: 'Premium Meats', category: 'Meat & Poultry', phone: '+1 555 0202', email: 'orders@premiummeats.example', products: [
        { name: 'Beef mince (80/20)', unit: 'kg' },
        { name: 'Chicken thigh boneless', unit: 'kg' },
        { name: 'Pancetta', unit: 'kg' },
      ]},
      { name: 'Ocean Catch', category: 'Seafood', phone: '+1 555 0606', email: 'orders@oceancatch.example', products: [
        { name: 'Salmon fillet', unit: 'kg' },
      ]},
      { name: 'Dairy Direct', category: 'Dairy', phone: '+1 555 0303', email: 'orders@dairydirect.example', products: [
        { name: 'Heavy cream', unit: 'l' },
        { name: 'Plain yogurt', unit: 'kg' },
        { name: 'Butter', unit: 'kg' },
        { name: 'Feta cheese', unit: 'kg' },
        { name: 'Mozzarella', unit: 'kg' },
        { name: 'Pecorino Romano', unit: 'kg' },
        { name: 'Parmigiano Reggiano', unit: 'kg' },
      ]},
      { name: 'Bakery Wholesale', category: 'Dry Goods', phone: '+1 555 0404', email: 'orders@bakery.example', products: [
        { name: 'Burger buns brioche', unit: 'pcs' },
        { name: 'Pizza flour 00', unit: 'kg' },
      ]},
      { name: 'Spice Importers', category: 'Dry Goods', phone: '+1 555 0505', email: 'orders@spices.example', products: [
        { name: 'Garam masala', unit: 'kg' },
        { name: 'Ground cumin', unit: 'kg' },
        { name: 'Paprika (smoked)', unit: 'kg' },
        { name: 'Turmeric', unit: 'kg' },
        { name: 'Dried oregano', unit: 'kg' },
      ]},
    ];
    supplierData.forEach(function (s) {
      PCD.store.upsertInTable('suppliers', Object.assign({ _demo: true }, s), 's');
    });

    // === DEMO INVENTORY ===
    // Set par + min levels and current stock for some ingredients (mostly OK, one critical)
    const wsId = PCD.store.getActiveWorkspaceId();
    const inv = PCD.store.get('inventory') || {};
    inv[wsId] = inv[wsId] || {};
    const invMap = {
      'Spaghetti pasta':        { stock: 8000,  parLevel: 5000, minLevel: 2000 },  // OK
      'Heavy cream':            { stock: 1500,  parLevel: 2000, minLevel: 500 },   // LOW
      'Plain yogurt':           { stock: 200,   parLevel: 1000, minLevel: 500 },   // CRITICAL
      'Burger buns brioche':    { stock: 12,    parLevel: 24,   minLevel: 6 },     // LOW
      'Pancetta':               { stock: 800,   parLevel: 1000, minLevel: 200 },   // OK
      'Pecorino Romano':        { stock: 1500,  parLevel: 2000, minLevel: 500 },   // OK
      'Eggs (large)':           { stock: 60,    parLevel: 30,   minLevel: 10 },    // OK
      'Tomato puree':           { stock: 2000,  parLevel: 1000, minLevel: 300 },   // OK
    };
    Object.keys(invMap).forEach(function (name) {
      const ingId = findId(upserted, name); // v2.14.3 fix: upserted is an array → index-by-name was always undefined (demo inventory never seeded)
      if (!ingId) return;
      const cfg = invMap[name];
      inv[wsId][ingId] = {
        stock: cfg.stock,
        parLevel: cfg.parLevel,
        minLevel: cfg.minLevel,
        lastCountedAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        _demo: true, // (v2.6.30) flag so removeDemo can clean these up
      };
    });
    PCD.store.set('inventory', inv);

    // === DEMO MENU (added v2.6.30; v2.14.3 — diyet/alerjen harf kodları sergilenir) ===
    if (carbonaraR && tikkaR && burgerR) {
      PCD.store.upsertInTable('menus', {
        name: 'Lunch Menu',
        subtitle: 'Sample · customize me',
        allergenStyle: 'codes',
        sections: [
          {
            id: PCD.uid('sec'),
            name: 'Starters',
            items: [
              greekR ? { id: PCD.uid('mi'), recipeId: greekR.id, codes: ['v', 'gf', 'a_d'] } : null,
            ].filter(Boolean),
          },
          {
            id: PCD.uid('sec'),
            name: 'Mains',
            items: [
              { id: PCD.uid('mi'), recipeId: carbonaraR.id, codes: ['a_g', 'a_e', 'a_d'] },
              { id: PCD.uid('mi'), recipeId: tikkaR.id, codes: ['gf', 'a_d'] },
              pizzaR ? { id: PCD.uid('mi'), recipeId: pizzaR.id, codes: ['v', 'a_g', 'a_d'] } : null,
              salmonR ? { id: PCD.uid('mi'), recipeId: salmonR.id, codes: ['gf', 'a_f', 'a_d'] } : null,
              { id: PCD.uid('mi'), recipeId: burgerR.id, codes: ['a_g', 'a_e', 'a_d'] },
            ].filter(Boolean),
          },
        ],
        hidePrices: false,
        _demo: true,
      }, 'm');
    }

    // === DEMO EVENT (next Saturday) ===
    if (carbonaraR && tikkaR) {
      const now = new Date();
      const daysUntilSat = (6 - now.getDay() + 7) % 7 || 7;
      const eventDate = new Date(now.getTime() + daysUntilSat * 86400000);
      const dateStr = eventDate.toISOString().slice(0, 10);
      PCD.store.upsertInTable('events', {
        name: 'Wedding Reception',
        date: dateStr,
        time: '18:30',
        guestCount: 60,
        venue: 'Garden Terrace',
        pricePerHead: 65,
        budget: 4500,
        status: 'confirmed',
        notes: 'Sample event · Customize or delete',
        recipes: [
          { recipeId: carbonaraR.id, portionsPerGuest: 1 },
          { recipeId: tikkaR.id, portionsPerGuest: 1 },
        ],
        _demo: true,
      }, 'e');
    }

    // === DEMO KITCHEN CARDS CANVAS ===
    if (carbonaraR && tikkaR && burgerR) {
      PCD.store.upsertInTable('canvases', {
        name: 'Daily Kitchen Reference',
        columns: 3, orientation: 'landscape', fontSize: 'medium',
        showMethod: true, showAmounts: true,
        layout: [
          { recipeId: tikkaR.id, span: 1 },
          { recipeId: carbonaraR.id, span: 1 },
          { recipeId: burgerR.id, span: 1 },
        ],
        _demo: true,
      }, 'cvs');
    }

    // === DEMO BUFFET (v2.14.3) ===
    // Büfe ayrı kayıt yolu kullanır: workspace-keyed dizi (buffet.js readBuffetsAll/
    // writeBuffets ile uyumlu). Misafir = bulut kapalı, queueArraySync gerekmez.
    if (carbonaraR && tikkaR) {
      const nowIso = new Date().toISOString();
      const demoBuffet = {
        id: PCD.uid('bf'),
        createdAt: nowIso,
        updatedAt: nowIso,
        _demo: true,
        name: 'Sunday Brunch Buffet',
        type: 'lunch',
        coverCount: 80,
        ticketPrice: 45,
        durationHours: 3,
        refillMultiplier: null,
        notes: 'Sample buffet · customize or delete',
        stations: [
          { name: 'Cold', type: 'cold', items: [
            (greekR
              ? { recipeId: greekR.id, amountPerGuest: 90, unit: 'g', pickupRatio: 0.55, refillX: null }
              : { customName: 'Greek salad', amountPerGuest: 90, unit: 'g', pickupRatio: 0.55, refillX: null }),
            { customName: 'Smoked salmon platter', amountPerGuest: 50, unit: 'g', pickupRatio: 0.45, refillX: null },
            { customName: 'Seasonal fruit', amountPerGuest: 100, unit: 'g', pickupRatio: 0.55, refillX: null },
          ]},
          { name: 'Hot', type: 'hot', items: [
            { recipeId: tikkaR.id, amountPerGuest: 180, unit: 'g', pickupRatio: 0.80, refillX: null },
            { recipeId: carbonaraR.id, amountPerGuest: 150, unit: 'g', pickupRatio: 0.70, refillX: null },
            { customName: 'Roast vegetables', amountPerGuest: 90, unit: 'g', pickupRatio: 0.60, refillX: null },
          ]},
          { name: 'Bakery', type: 'bakery', items: [
            { customName: 'Croissants', amountPerGuest: 1, unit: 'pcs', pickupRatio: 0.70, refillX: null },
            { customName: 'Sourdough slices', amountPerGuest: 2, unit: 'slice', pickupRatio: 0.50, refillX: null },
          ]},
          { name: 'Beverage', type: 'beverage', items: [
            { customName: 'Filter coffee', amountPerGuest: 200, unit: 'ml', pickupRatio: 0.90, refillX: null },
            { customName: 'Fresh orange juice', amountPerGuest: 150, unit: 'ml', pickupRatio: 0.80, refillX: null },
          ]},
        ],
      };
      const bufRoot = PCD.store._read('buffets') || {};
      const bufNext = Array.isArray(bufRoot) ? {} : Object.assign({}, bufRoot);
      const bufArr = (Array.isArray(bufRoot) ? [] : (bufRoot[wsId] || [])).slice();
      bufArr.push(demoBuffet);
      bufNext[wsId] = bufArr;
      PCD.store.set('buffets', bufNext);
    }

    PCD.store.update('onboarding', { demoSeeded: true });
    PCD.log('Demo data seeded.');
  }

  // v2.6.94 — removeDemo() kaldırıldı. Account ekranındaki "Re-add/Remove demo
  // recipes" butonu silindi. Yeni mantık: misafir kullanıcılar siteye girdiğinde
  // demo bir kez seed olur (Fix #2 ile sign-in sonrası demo seed asla yeniden
  // tetiklenmez); sign-in olunca auth.js'in clearUserData çağrısı tüm demo'yu
  // (ve diğer lokal state'i) temizler ve cloud'dan gerçek user data pull edilir.
  // Kullanıcı için "Add/Remove demo" opsiyonu artık yok.
  PCD.demo = { seed: seedDemo };
})();
