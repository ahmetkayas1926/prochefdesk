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
      return PCD.store.upsertIngredient({
        name: ing.name,
        unit: ing.unit,
        pricePerUnit: ing.pricePerUnit,
        category: ing.category,
        supplier: '',
        _demo: true,
      });
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

    PCD.store.upsertRecipe(carbonara);
    PCD.store.upsertRecipe(tikka);
    PCD.store.upsertRecipe(burger);

    // Re-fetch with their assigned ids
    const all = PCD.store.listRecipes();
    const carbonaraR = all.find(function (r) { return r.name === 'Spaghetti alla Carbonara'; });
    const tikkaR = all.find(function (r) { return r.name === 'Chicken Tikka Masala'; });
    const burgerR = all.find(function (r) { return r.name === 'Classic Cheeseburger'; });

    // === DEMO MENU ===
    if (carbonaraR && tikkaR && burgerR) {
      PCD.store.upsertInTable('menus', {
        name: 'Lunch Menu',
        subtitle: 'Sample · Customize me',
        sections: [
          { id: PCD.uid('sec'), title: 'Mains', items: [
            { id: PCD.uid('mi'), recipeId: tikkaR.id, price: 18 },
            { id: PCD.uid('mi'), recipeId: carbonaraR.id, price: 16 },
            { id: PCD.uid('mi'), recipeId: burgerR.id, price: 14 },
          ]},
        ],
        printDensity: 'comfortable',
        _demo: true,
      }, 'm');
    }

    // === DEMO SUPPLIERS ===
    const supplierData = [
      { name: 'Fresh Farm Co.', category: 'cat_produce', phone: '+1 555 0101', email: 'orders@freshfarm.example', products: [
        { name: 'Tomato', unit: 'kg' },
        { name: 'Onion', unit: 'kg' },
        { name: 'Garlic', unit: 'kg' },
      ]},
      { name: 'Premium Meats', category: 'cat_meat', phone: '+1 555 0202', email: 'orders@premiummeats.example', products: [
        { name: 'Beef mince (80/20)', unit: 'kg' },
        { name: 'Chicken thigh boneless', unit: 'kg' },
        { name: 'Pancetta', unit: 'kg' },
      ]},
      { name: 'Dairy Direct', category: 'cat_dairy', phone: '+1 555 0303', email: 'orders@dairydirect.example', products: [
        { name: 'Heavy cream', unit: 'L' },
        { name: 'Plain yogurt', unit: 'kg' },
        { name: 'Pecorino Romano', unit: 'kg' },
        { name: 'Parmigiano Reggiano', unit: 'kg' },
      ]},
      { name: 'Bakery Wholesale', category: 'cat_baking', phone: '+1 555 0404', email: 'orders@bakery.example', products: [
        { name: 'Burger buns brioche', unit: 'pcs' },
      ]},
      { name: 'Spice Importers', category: 'cat_spices', phone: '+1 555 0505', email: 'orders@spices.example', products: [
        { name: 'Garam masala', unit: 'kg' },
        { name: 'Ground cumin', unit: 'kg' },
        { name: 'Paprika (smoked)', unit: 'kg' },
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
      const ing = upserted[name];
      if (!ing) return;
      const cfg = invMap[name];
      inv[wsId][ing.id] = {
        stock: cfg.stock,
        parLevel: cfg.parLevel,
        minLevel: cfg.minLevel,
        lastCountedAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        _demo: true, // (v2.6.30) flag so removeDemo can clean these up
      };
    });
    PCD.store.set('inventory', inv);

    // === DEMO MENU (added v2.6.30) ===
    if (carbonaraR && tikkaR && burgerR) {
      PCD.store.upsertInTable('menus', {
        name: 'Lunch Menu',
        subtitle: 'Sample · customize me',
        sections: [
          {
            id: PCD.uid('sec'),
            name: 'Mains',
            items: [
              { id: PCD.uid('mi'), recipeId: carbonaraR.id },
              { id: PCD.uid('mi'), recipeId: tikkaR.id },
              { id: PCD.uid('mi'), recipeId: burgerR.id },
            ],
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
