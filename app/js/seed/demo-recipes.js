/* ================================================================
   ProChefDesk — demo-recipes.js
   A coherent modern-French fine-dining menu seeded on first load so
   guests explore the app with realistic, premium, photographed content.
   14 dishes: Entrées · Plats · Desserts (with dessert), one workspace.

   All photos are Unsplash (free-to-use license, no attribution).
   Food-cost spread is intentionally realistic: most dishes 18–34%
   (healthy), premium-protein dishes flagged (foie gras red ~48%,
   scallops & bouillabaisse amber ~36–40%) so the "cost control"
   message lands. Currency-agnostic numbers (default workspace currency = USD).
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const IMG = 'https://images.unsplash.com/photo-';
  const Q = '?w=1200&q=80';

  // --- Shared ingredient set (modern French pantry) ---
  const demoIngredients = [
    // Aromatics / produce
    { name: 'Brown onion',            unit: 'g',  pricePerUnit: 0.003, category: 'cat_produce', supplier: 'Provencale Produce' },
    { name: 'Shallot',                unit: 'g',  pricePerUnit: 0.009, category: 'cat_produce', supplier: 'Provencale Produce' },
    { name: 'Garlic',                 unit: 'g',  pricePerUnit: 0.012, category: 'cat_produce', supplier: 'Provencale Produce' },
    { name: 'Carrot',                 unit: 'g',  pricePerUnit: 0.003, category: 'cat_produce', supplier: 'Provencale Produce' },
    { name: 'Celery',                 unit: 'g',  pricePerUnit: 0.004, category: 'cat_produce', supplier: 'Provencale Produce' },
    { name: 'Leek',                   unit: 'g',  pricePerUnit: 0.006, category: 'cat_produce', supplier: 'Provencale Produce' },
    { name: 'Fennel',                 unit: 'g',  pricePerUnit: 0.007, category: 'cat_produce', supplier: 'Provencale Produce' },
    { name: 'Roma tomato',            unit: 'g',  pricePerUnit: 0.005, category: 'cat_produce', supplier: 'Provencale Produce' },
    { name: 'Mixed salad leaves',     unit: 'g',  pricePerUnit: 0.018, category: 'cat_produce', supplier: 'Provencale Produce' },
    { name: 'Granny Smith apple',     unit: 'g',  pricePerUnit: 0.005, category: 'cat_produce', supplier: 'Provencale Produce' },
    { name: 'Lemon',                  unit: 'g',  pricePerUnit: 0.005, category: 'cat_produce', supplier: 'Provencale Produce', yieldPercent: 45 },
    { name: 'Orange',                 unit: 'g',  pricePerUnit: 0.004, category: 'cat_produce', supplier: 'Provencale Produce', yieldPercent: 50 },
    { name: 'Button mushrooms',       unit: 'g',  pricePerUnit: 0.012, category: 'cat_produce', supplier: 'Provencale Produce' },
    { name: 'Fresh thyme',            unit: 'g',  pricePerUnit: 0.060, category: 'cat_produce', supplier: 'Provencale Produce' },
    { name: 'Fresh parsley',          unit: 'g',  pricePerUnit: 0.045, category: 'cat_produce', supplier: 'Provencale Produce' },
    { name: 'Walnuts',                unit: 'g',  pricePerUnit: 0.032, category: 'cat_dry_goods', supplier: 'Maison Dry Goods' },
    { name: 'Mixed berries',          unit: 'g',  pricePerUnit: 0.024, category: 'cat_produce', supplier: 'Provencale Produce' },
    // Dairy & eggs
    { name: 'Butter (unsalted)',      unit: 'g',  pricePerUnit: 0.013, category: 'cat_dairy',  supplier: 'Laiterie Dairy' },
    { name: 'Pouring cream',          unit: 'ml', pricePerUnit: 0.008, category: 'cat_dairy',  supplier: 'Laiterie Dairy' },
    { name: 'Egg yolks',              unit: 'pcs',pricePerUnit: 0.45,  category: 'cat_dairy',  supplier: 'Laiterie Dairy' },
    { name: 'Eggs (free-range)',      unit: 'pcs',pricePerUnit: 0.50,  category: 'cat_dairy',  supplier: 'Laiterie Dairy' },
    { name: 'Gruyere',                unit: 'g',  pricePerUnit: 0.038, category: 'cat_dairy',  supplier: 'Laiterie Dairy' },
    { name: 'Goat cheese (chevre)',   unit: 'g',  pricePerUnit: 0.030, category: 'cat_dairy',  supplier: 'Laiterie Dairy' },
    { name: 'Milk',                   unit: 'ml', pricePerUnit: 0.002, category: 'cat_dairy',  supplier: 'Laiterie Dairy' },
    // Meat & poultry
    { name: 'Beef eye fillet',        unit: 'g',  pricePerUnit: 0.058, category: 'cat_meat',    supplier: 'Boucherie Meats', yieldPercent: 92 },
    { name: 'Beef tenderloin (lean)', unit: 'g',  pricePerUnit: 0.052, category: 'cat_meat',    supplier: 'Boucherie Meats', yieldPercent: 95 },
    { name: 'Free-range chicken',     unit: 'g',  pricePerUnit: 0.013, category: 'cat_poultry', supplier: 'Boucherie Meats' },
    { name: 'Duck leg',               unit: 'g',  pricePerUnit: 0.024, category: 'cat_poultry', supplier: 'Boucherie Meats' },
    { name: 'Duck fat',               unit: 'g',  pricePerUnit: 0.015, category: 'cat_oils',    supplier: 'Boucherie Meats' },
    { name: 'Foie gras',              unit: 'g',  pricePerUnit: 0.190, category: 'cat_meat',    supplier: 'Boucherie Meats' },
    { name: 'Bacon lardons',          unit: 'g',  pricePerUnit: 0.026, category: 'cat_meat',    supplier: 'Boucherie Meats' },
    // Seafood
    { name: 'Scallops',               unit: 'g',  pricePerUnit: 0.095, category: 'cat_seafood', supplier: 'Marseille Seafood', yieldPercent: 90 },
    { name: 'Sole fillet',            unit: 'g',  pricePerUnit: 0.048, category: 'cat_seafood', supplier: 'Marseille Seafood', yieldPercent: 88 },
    { name: 'Mussels',                unit: 'g',  pricePerUnit: 0.012, category: 'cat_seafood', supplier: 'Marseille Seafood', yieldPercent: 40 },
    { name: 'Prawns',                 unit: 'g',  pricePerUnit: 0.042, category: 'cat_seafood', supplier: 'Marseille Seafood', yieldPercent: 55 },
    { name: 'Snapper fillet',         unit: 'g',  pricePerUnit: 0.038, category: 'cat_seafood', supplier: 'Marseille Seafood', yieldPercent: 85 },
    { name: 'Saffron threads',        unit: 'g',  pricePerUnit: 4.00,  category: 'cat_spices',  supplier: 'Maison Dry Goods' },
    // Pantry / baking
    { name: 'Baguette',               unit: 'g',  pricePerUnit: 0.005, category: 'cat_baking',  supplier: 'Boulangerie Wholesale' },
    { name: 'Plain flour',            unit: 'g',  pricePerUnit: 0.003, category: 'cat_baking',  supplier: 'Boulangerie Wholesale' },
    { name: 'Caster sugar',           unit: 'g',  pricePerUnit: 0.002, category: 'cat_baking',  supplier: 'Boulangerie Wholesale' },
    { name: 'Dark chocolate 70%',     unit: 'g',  pricePerUnit: 0.028, category: 'cat_baking',  supplier: 'Maison Dry Goods' },
    { name: 'Vanilla bean',           unit: 'pcs',pricePerUnit: 1.20,  category: 'cat_spices',  supplier: 'Maison Dry Goods' },
    { name: 'Dijon mustard',          unit: 'g',  pricePerUnit: 0.012, category: 'cat_spices',  supplier: 'Maison Dry Goods' },
    { name: 'Capers',                 unit: 'g',  pricePerUnit: 0.022, category: 'cat_produce', supplier: 'Maison Dry Goods' },
    { name: 'Cornichons',             unit: 'g',  pricePerUnit: 0.016, category: 'cat_produce', supplier: 'Maison Dry Goods' },
    { name: 'Green peppercorns',      unit: 'g',  pricePerUnit: 0.045, category: 'cat_spices',  supplier: 'Maison Dry Goods' },
    { name: 'Black pepper',           unit: 'g',  pricePerUnit: 0.020, category: 'cat_spices',  supplier: 'Maison Dry Goods' },
    { name: 'Sea salt',               unit: 'g',  pricePerUnit: 0.003, category: 'cat_spices',  supplier: 'Maison Dry Goods' },
    { name: 'Honey',                  unit: 'g',  pricePerUnit: 0.014, category: 'cat_produce', supplier: 'Maison Dry Goods' },
    { name: 'Olive oil',              unit: 'ml', pricePerUnit: 0.012, category: 'cat_oils',    supplier: 'Maison Dry Goods' },
    { name: 'Red wine',               unit: 'ml', pricePerUnit: 0.006, category: 'cat_oils',    supplier: 'Maison Dry Goods' },
    { name: 'White wine',             unit: 'ml', pricePerUnit: 0.007, category: 'cat_oils',    supplier: 'Maison Dry Goods' },
    { name: 'Cognac',                 unit: 'ml', pricePerUnit: 0.022, category: 'cat_oils',    supplier: 'Maison Dry Goods' },
    { name: 'Beef stock',             unit: 'ml', pricePerUnit: 0.004, category: 'cat_dry_goods', supplier: 'Maison Dry Goods' },
    { name: 'Fish stock',             unit: 'ml', pricePerUnit: 0.005, category: 'cat_dry_goods', supplier: 'Marseille Seafood' },
  ];

  function findId(list, name) {
    const found = list.find(function (x) { return x.name === name; });
    return found ? found.id : null;
  }

  function seedDemo() {
    if (PCD.store.get('onboarding.demoSeeded')) return;

    // 1) Ingredients
    const upserted = demoIngredients.map(function (ing) {
      const obj = {
        name: ing.name, unit: ing.unit, pricePerUnit: ing.pricePerUnit,
        category: ing.category, supplier: ing.supplier || '', _demo: true,
      };
      if (ing.yieldPercent != null) obj.yieldPercent = ing.yieldPercent;
      return PCD.store.upsertIngredient(obj);
    });
    const I = function (n) { return findId(upserted, n); };

    // 2) Recipes — upserted in menu order so the list reads like the menu
    const recipes = [
      // ---------------- ENTRÉES ----------------
      {
        name: 'Soupe à l\'Oignon Gratinée', category: 'cat_appetizer', cuisine: 'French',
        servings: 4, prepTime: 20, cookTime: 45, salePrice: 18, photo: IMG + '1741318714411-fad939b8580a' + Q,
        ingredients: [
          { ingredientId: I('Brown onion'),       amount: 800,  unit: 'g' },
          { ingredientId: I('Butter (unsalted)'), amount: 50,   unit: 'g' },
          { ingredientId: I('Beef stock'),        amount: 1000, unit: 'ml' },
          { ingredientId: I('White wine'),        amount: 100,  unit: 'ml' },
          { ingredientId: I('Baguette'),          amount: 120,  unit: 'g' },
          { ingredientId: I('Gruyere'),           amount: 160,  unit: 'g' },
          { ingredientId: I('Plain flour'),       amount: 20,   unit: 'g' },
          { ingredientId: I('Fresh thyme'),       amount: 4,    unit: 'g' },
        ],
        steps: [
          'Slice the onions thinly and caramelise slowly in butter for 35–40 minutes until deep amber.',
          'Dust with flour, deglaze with white wine, then add hot beef stock and thyme. Simmer 15 minutes.',
          'Ladle into ovenproof bowls, float toasted baguette, blanket with Gruyère.',
          'Gratinate under the grill until bubbling and golden.'
        ].join('\n\n'),
        plating: 'Serve in the bowl, cheese still blistering, on a folded napkin.',
        allergens: ['dairy', 'gluten'],
      },
      {
        name: 'Foie Gras au Torchon', category: 'cat_appetizer', cuisine: 'French',
        servings: 4, prepTime: 40, cookTime: 0, salePrice: 44, photo: IMG + '1758972574371-57cf8c42bae8' + Q,
        ingredients: [
          { ingredientId: I('Foie gras'),    amount: 200, unit: 'g' },
          { ingredientId: I('Baguette'),     amount: 120, unit: 'g' },
          { ingredientId: I('Honey'),        amount: 40,  unit: 'g' },
          { ingredientId: I('Shallot'),      amount: 40,  unit: 'g' },
          { ingredientId: I('White wine'),   amount: 40,  unit: 'ml' },
          { ingredientId: I('Sea salt'),     amount: 6,   unit: 'g' },
          { ingredientId: I('Black pepper'), amount: 2,   unit: 'g' },
        ],
        steps: [
          'Devein the foie gras, season, and cure briefly with a splash of wine.',
          'Roll tightly in a torchon and poach gently, then chill 24 hours.',
          'Slice cold; serve with a shallot-honey jam and toasted baguette.'
        ].join('\n\n'),
        plating: 'A clean slice off-centre, jam quenelle, toast points alongside. Sea salt to finish.',
        allergens: ['gluten'],
      },
      {
        name: 'Coquilles Saint-Jacques', category: 'cat_appetizer', cuisine: 'French',
        servings: 4, prepTime: 20, cookTime: 10, salePrice: 40, photo: IMG + '1750874693225-006612ff09d7' + Q,
        ingredients: [
          { ingredientId: I('Scallops'),         amount: 300, unit: 'g' },
          { ingredientId: I('Butter (unsalted)'),amount: 60,  unit: 'g' },
          { ingredientId: I('Pouring cream'),    amount: 120, unit: 'ml' },
          { ingredientId: I('White wine'),       amount: 80,  unit: 'ml' },
          { ingredientId: I('Leek'),             amount: 120, unit: 'g' },
          { ingredientId: I('Lemon'),            amount: 40,  unit: 'g' },
          { ingredientId: I('Fresh parsley'),    amount: 8,   unit: 'g' },
        ],
        steps: [
          'Sweat finely sliced leek in butter until soft.',
          'Sear the scallops in foaming butter, 60–90 seconds a side, and rest.',
          'Deglaze with wine, reduce, finish with cream and lemon for a velouté.',
          'Nap the scallops with sauce; scatter parsley.'
        ].join('\n\n'),
        plating: 'Three scallops on the leek fondue, sauce around, micro-parsley on top.',
        allergens: ['shellfish', 'dairy'],
      },
      {
        name: 'Tartare de Bœuf', category: 'cat_appetizer', cuisine: 'French',
        servings: 4, prepTime: 25, cookTime: 0, salePrice: 30, photo: IMG + '1770210627300-d4fa9b75dbb7' + Q,
        ingredients: [
          { ingredientId: I('Beef tenderloin (lean)'), amount: 400, unit: 'g' },
          { ingredientId: I('Egg yolks'),              amount: 4,   unit: 'pcs' },
          { ingredientId: I('Shallot'),                amount: 40,  unit: 'g' },
          { ingredientId: I('Capers'),                 amount: 20,  unit: 'g' },
          { ingredientId: I('Cornichons'),             amount: 30,  unit: 'g' },
          { ingredientId: I('Dijon mustard'),          amount: 15,  unit: 'g' },
          { ingredientId: I('Fresh parsley'),          amount: 10,  unit: 'g' },
          { ingredientId: I('Olive oil'),              amount: 20,  unit: 'ml' },
        ],
        steps: [
          'Hand-chop the chilled tenderloin into a fine dice.',
          'Fold through minced shallot, capers, cornichons, Dijon, parsley and oil. Season.',
          'Ring-mould each portion and crown with a yolk.'
        ].join('\n\n'),
        plating: 'Neat disc, yolk in a half-shell on top, toast and dressed leaves alongside.',
        allergens: ['eggs'],
      },
      {
        name: 'Salade de Chèvre Chaud', category: 'cat_salad', cuisine: 'French',
        servings: 4, prepTime: 15, cookTime: 6, salePrice: 18, photo: IMG + '1761305155084-7c4555b2d8b5' + Q,
        ingredients: [
          { ingredientId: I('Goat cheese (chevre)'), amount: 240, unit: 'g' },
          { ingredientId: I('Mixed salad leaves'),   amount: 200, unit: 'g' },
          { ingredientId: I('Baguette'),             amount: 100, unit: 'g' },
          { ingredientId: I('Walnuts'),              amount: 60,  unit: 'g' },
          { ingredientId: I('Honey'),                amount: 30,  unit: 'g' },
          { ingredientId: I('Granny Smith apple'),   amount: 120, unit: 'g' },
          { ingredientId: I('Olive oil'),            amount: 40,  unit: 'ml' },
        ],
        steps: [
          'Set rounds of chèvre on baguette croûtes and grill until just melting.',
          'Toss leaves with apple batons, walnuts and a honey vinaigrette.',
          'Lay the warm croûtes over the salad and drizzle with honey.'
        ].join('\n\n'),
        plating: 'Loose pile of leaves, two warm croûtes leaning in, walnuts scattered.',
        allergens: ['dairy', 'gluten', 'nuts'],
      },
      // ---------------- PLATS ----------------
      {
        name: 'Filet de Bœuf au Poivre', category: 'cat_main', cuisine: 'French',
        servings: 2, prepTime: 15, cookTime: 15, salePrice: 54, photo: IMG + '1726677730666-fdc08a8da464' + Q,
        ingredients: [
          { ingredientId: I('Beef eye fillet'),   amount: 360, unit: 'g' },
          { ingredientId: I('Green peppercorns'), amount: 18,  unit: 'g' },
          { ingredientId: I('Pouring cream'),     amount: 120, unit: 'ml' },
          { ingredientId: I('Cognac'),            amount: 30,  unit: 'ml' },
          { ingredientId: I('Butter (unsalted)'), amount: 30,  unit: 'g' },
          { ingredientId: I('Beef stock'),        amount: 120, unit: 'ml' },
          { ingredientId: I('Shallot'),           amount: 30,  unit: 'g' },
        ],
        steps: [
          'Crust the fillets in cracked pepper and season with salt.',
          'Sear in butter to your temperature; rest the meat.',
          'Flambé the pan with Cognac, add stock and cream, reduce to a glossy sauce.',
          'Spoon the peppercorn sauce over the rested fillet.'
        ].join('\n\n'),
        plating: 'Fillet centred, sauce ribboned over, pommes purée and greens to the side.',
        allergens: ['dairy'],
      },
      {
        name: 'Sole Meunière', category: 'cat_main', cuisine: 'French',
        servings: 2, prepTime: 10, cookTime: 12, salePrice: 48, photo: IMG + '1700760933394-976f1d27dff2' + Q,
        ingredients: [
          { ingredientId: I('Sole fillet'),       amount: 340, unit: 'g' },
          { ingredientId: I('Butter (unsalted)'), amount: 90,  unit: 'g' },
          { ingredientId: I('Lemon'),             amount: 60,  unit: 'g' },
          { ingredientId: I('Plain flour'),       amount: 30,  unit: 'g' },
          { ingredientId: I('Fresh parsley'),     amount: 10,  unit: 'g' },
          { ingredientId: I('Capers'),            amount: 15,  unit: 'g' },
        ],
        steps: [
          'Dredge the sole lightly in seasoned flour.',
          'Pan-fry in butter until golden, basting, then lift to warm plates.',
          'Foam fresh butter to noisette, add lemon, capers and parsley.',
          'Pour the beurre noisette over the fish.'
        ].join('\n\n'),
        plating: 'Whole fillet, beurre noisette poured at the pass, lemon cheek alongside.',
        allergens: ['fish', 'dairy', 'gluten'],
      },
      {
        name: 'Confit de Canard', category: 'cat_main', cuisine: 'French',
        servings: 2, prepTime: 30, cookTime: 120, salePrice: 38, photo: IMG + '1767117997091-5617a7a2968e' + Q,
        ingredients: [
          { ingredientId: I('Duck leg'),    amount: 520, unit: 'g' },
          { ingredientId: I('Duck fat'),    amount: 200, unit: 'g' },
          { ingredientId: I('Garlic'),      amount: 20,  unit: 'g' },
          { ingredientId: I('Fresh thyme'), amount: 4,   unit: 'g' },
          { ingredientId: I('Orange'),      amount: 80,  unit: 'g' },
          { ingredientId: I('Sea salt'),    amount: 10,  unit: 'g' },
        ],
        steps: [
          'Salt-cure the legs overnight with thyme and garlic.',
          'Submerge in duck fat and cook low (90°C) for 2 hours until tender.',
          'Crisp the skin in a hot pan to order.',
          'Deglaze with orange for a light jus.'
        ].join('\n\n'),
        plating: 'Crisp leg on lentils or pommes sarladaises, orange jus brushed over.',
        allergens: [],
      },
      {
        name: 'Coq au Vin', category: 'cat_main', cuisine: 'French',
        servings: 4, prepTime: 30, cookTime: 75, salePrice: 34, photo: IMG + '1694579740719-0e601c5d2437' + Q,
        ingredients: [
          { ingredientId: I('Free-range chicken'),  amount: 1200, unit: 'g' },
          { ingredientId: I('Red wine'),            amount: 500,  unit: 'ml' },
          { ingredientId: I('Bacon lardons'),       amount: 120,  unit: 'g' },
          { ingredientId: I('Button mushrooms'),    amount: 200,  unit: 'g' },
          { ingredientId: I('Brown onion'),         amount: 150,  unit: 'g' },
          { ingredientId: I('Carrot'),              amount: 100,  unit: 'g' },
          { ingredientId: I('Garlic'),              amount: 15,   unit: 'g' },
          { ingredientId: I('Beef stock'),          amount: 250,  unit: 'ml' },
          { ingredientId: I('Butter (unsalted)'),   amount: 40,   unit: 'g' },
          { ingredientId: I('Plain flour'),         amount: 30,   unit: 'g' },
        ],
        steps: [
          'Brown the chicken pieces with lardons; set aside.',
          'Sweat onion, carrot and garlic, dust with flour, then deglaze with red wine.',
          'Return chicken, add stock, braise gently 1 hour.',
          'Sauté mushrooms in butter and fold through to finish.'
        ].join('\n\n'),
        plating: 'Chicken and sauce ladled over mash, lardons and mushrooms on top, parsley.',
        allergens: ['gluten', 'dairy'],
      },
      {
        name: 'Bouillabaisse Marseillaise', category: 'cat_main', cuisine: 'French',
        servings: 4, prepTime: 35, cookTime: 40, salePrice: 52, photo: IMG + '1717251883036-62835ecddc0b' + Q,
        ingredients: [
          { ingredientId: I('Snapper fillet'), amount: 320, unit: 'g' },
          { ingredientId: I('Mussels'),        amount: 240, unit: 'g' },
          { ingredientId: I('Prawns'),         amount: 200, unit: 'g' },
          { ingredientId: I('Fish stock'),     amount: 800, unit: 'ml' },
          { ingredientId: I('Saffron threads'),amount: 0.5, unit: 'g' },
          { ingredientId: I('Fennel'),         amount: 150, unit: 'g' },
          { ingredientId: I('Roma tomato'),    amount: 300, unit: 'g' },
          { ingredientId: I('Brown onion'),    amount: 150, unit: 'g' },
          { ingredientId: I('Garlic'),         amount: 20,  unit: 'g' },
          { ingredientId: I('Olive oil'),      amount: 40,  unit: 'ml' },
        ],
        steps: [
          'Build a fennel, onion, garlic and tomato base in olive oil.',
          'Add fish stock and saffron; simmer to a fragrant broth.',
          'Poach snapper, prawns and mussels in the broth just until cooked.',
          'Serve with rouille and grilled baguette.'
        ].join('\n\n'),
        plating: 'Seafood arranged in a wide bowl, saffron broth poured over, rouille croûte on the rim.',
        allergens: ['fish', 'shellfish'],
      },
      // ---------------- DESSERTS ----------------
      {
        name: 'Crème Brûlée', category: 'cat_dessert', cuisine: 'French',
        servings: 4, prepTime: 15, cookTime: 40, salePrice: 14, photo: IMG + '1779094543236-6c64b71ae14e' + Q,
        ingredients: [
          { ingredientId: I('Pouring cream'), amount: 500, unit: 'ml' },
          { ingredientId: I('Egg yolks'),     amount: 5,   unit: 'pcs' },
          { ingredientId: I('Caster sugar'),  amount: 110, unit: 'g' },
          { ingredientId: I('Vanilla bean'),  amount: 1,   unit: 'pcs' },
        ],
        steps: [
          'Infuse the cream with split vanilla.',
          'Whisk yolks and sugar, temper with the cream, strain into ramekins.',
          'Bake in a bain-marie at 150°C until just set; chill.',
          'Dust with sugar and torch to a glass crust to order.'
        ].join('\n\n'),
        plating: 'Ramekin on a plate, crackled top, a few berries alongside.',
        allergens: ['dairy', 'eggs'],
      },
      {
        name: 'Tarte Tatin', category: 'cat_dessert', cuisine: 'French',
        servings: 4, prepTime: 25, cookTime: 35, salePrice: 14, photo: IMG + '1519915028121-7d3463d20b13' + Q,
        ingredients: [
          { ingredientId: I('Granny Smith apple'), amount: 800, unit: 'g' },
          { ingredientId: I('Caster sugar'),       amount: 150, unit: 'g' },
          { ingredientId: I('Butter (unsalted)'),  amount: 100, unit: 'g' },
          { ingredientId: I('Plain flour'),        amount: 200, unit: 'g' },
          { ingredientId: I('Eggs (free-range)'),  amount: 1,   unit: 'pcs' },
        ],
        steps: [
          'Cook sugar and butter to a caramel in an ovenproof pan.',
          'Pack tightly with apple halves and caramelise on the stove.',
          'Cover with pastry and bake until golden.',
          'Rest, then invert to reveal the glazed apples.'
        ].join('\n\n'),
        plating: 'Warm wedge, apples up, crème fraîche or vanilla ice cream alongside.',
        allergens: ['gluten', 'dairy', 'eggs'],
      },
      {
        name: 'Mousse au Chocolat', category: 'cat_dessert', cuisine: 'French',
        servings: 4, prepTime: 25, cookTime: 0, salePrice: 13, photo: IMG + '1504388192519-fb4be897c4d0' + Q,
        ingredients: [
          { ingredientId: I('Dark chocolate 70%'), amount: 200, unit: 'g' },
          { ingredientId: I('Eggs (free-range)'),  amount: 4,   unit: 'pcs' },
          { ingredientId: I('Pouring cream'),      amount: 100, unit: 'ml' },
          { ingredientId: I('Caster sugar'),       amount: 40,  unit: 'g' },
          { ingredientId: I('Butter (unsalted)'),  amount: 30,  unit: 'g' },
        ],
        steps: [
          'Melt the chocolate with butter; stir in the yolks.',
          'Whip the whites with sugar to soft peaks.',
          'Fold whites, then lightly whipped cream, into the chocolate.',
          'Pipe into glasses and set in the fridge.'
        ].join('\n\n'),
        plating: 'Quenelle or glass, cocoa dust, a single berry.',
        allergens: ['dairy', 'eggs'],
      },
      {
        name: 'Profiteroles', category: 'cat_dessert', cuisine: 'French',
        servings: 4, prepTime: 30, cookTime: 30, salePrice: 15, photo: IMG + '1602903489862-1fe54b1f5ff2' + Q,
        ingredients: [
          { ingredientId: I('Plain flour'),        amount: 120, unit: 'g' },
          { ingredientId: I('Butter (unsalted)'),  amount: 100, unit: 'g' },
          { ingredientId: I('Eggs (free-range)'),  amount: 4,   unit: 'pcs' },
          { ingredientId: I('Milk'),               amount: 250, unit: 'ml' },
          { ingredientId: I('Pouring cream'),      amount: 300, unit: 'ml' },
          { ingredientId: I('Dark chocolate 70%'), amount: 120, unit: 'g' },
          { ingredientId: I('Caster sugar'),       amount: 50,  unit: 'g' },
        ],
        steps: [
          'Make a choux paste with milk, butter, flour and eggs.',
          'Pipe and bake until puffed and dry.',
          'Fill with Chantilly cream.',
          'Stack and drown in warm dark-chocolate sauce to order.'
        ].join('\n\n'),
        plating: 'Three puffs stacked, chocolate sauce poured at the table.',
        allergens: ['gluten', 'dairy', 'eggs'],
      },
      // ---------------- PREPS / SUB-RECIPES ----------------
      // Klasik Fransız "mother" prep'leri. isSubRecipe:true → Preps sekmesinde
      // görünür; aşağıda bazı yemeklerin içine bağlanır (alt-tarif cost cascade demosu).
      {
        name: 'Demi-Glace', category: 'cat_other', cuisine: 'French', isSubRecipe: true,
        yieldAmount: 1000, yieldUnit: 'ml', servings: 1, prepTime: 30, cookTime: 240,
        ingredients: [
          { ingredientId: I('Beef stock'),        amount: 2000, unit: 'ml' },
          { ingredientId: I('Red wine'),          amount: 250,  unit: 'ml' },
          { ingredientId: I('Carrot'),            amount: 100,  unit: 'g' },
          { ingredientId: I('Brown onion'),       amount: 100,  unit: 'g' },
          { ingredientId: I('Celery'),            amount: 80,   unit: 'g' },
          { ingredientId: I('Butter (unsalted)'), amount: 40,   unit: 'g' },
          { ingredientId: I('Fresh thyme'),       amount: 4,    unit: 'g' },
        ],
        steps: [
          'Roast the mirepoix, deglaze with red wine and reduce to a syrup.',
          'Add the brown stock and reduce slowly by half, skimming often.',
          'Strain, mount with butter, and reduce to a glossy demi.'
        ].join('\n\n'),
        allergens: ['dairy'],
      },
      {
        name: 'Beurre Blanc', category: 'cat_other', cuisine: 'French', isSubRecipe: true,
        yieldAmount: 400, yieldUnit: 'ml', servings: 1, prepTime: 15, cookTime: 15,
        ingredients: [
          { ingredientId: I('Shallot'),           amount: 60,  unit: 'g' },
          { ingredientId: I('White wine'),        amount: 150, unit: 'ml' },
          { ingredientId: I('Pouring cream'),     amount: 50,  unit: 'ml' },
          { ingredientId: I('Butter (unsalted)'), amount: 300, unit: 'g' },
          { ingredientId: I('Lemon'),             amount: 20,  unit: 'g' },
        ],
        steps: [
          'Reduce shallot and white wine to a glaze.',
          'Add a splash of cream, then whisk cold butter in off the heat.',
          'Finish with lemon; keep just warm so it never splits.'
        ].join('\n\n'),
        allergens: ['dairy'],
      },
      {
        name: 'Sauce Hollandaise', category: 'cat_other', cuisine: 'French', isSubRecipe: true,
        yieldAmount: 400, yieldUnit: 'ml', servings: 1, prepTime: 15, cookTime: 10,
        ingredients: [
          { ingredientId: I('Egg yolks'),         amount: 6,   unit: 'pcs' },
          { ingredientId: I('Butter (unsalted)'), amount: 300, unit: 'g' },
          { ingredientId: I('Lemon'),             amount: 30,  unit: 'g' },
          { ingredientId: I('White wine'),        amount: 30,  unit: 'ml' },
        ],
        steps: [
          'Whisk yolks with a wine reduction over a bain-marie until ribboned.',
          'Stream in warm clarified butter, whisking to a stable emulsion.',
          'Season with lemon and salt; hold warm.'
        ].join('\n\n'),
        allergens: ['eggs', 'dairy'],
      },
      {
        name: 'Crème Pâtissière', category: 'cat_other', cuisine: 'French', isSubRecipe: true,
        yieldAmount: 800, yieldUnit: 'g', servings: 1, prepTime: 15, cookTime: 10,
        ingredients: [
          { ingredientId: I('Milk'),         amount: 500, unit: 'ml' },
          { ingredientId: I('Egg yolks'),    amount: 6,   unit: 'pcs' },
          { ingredientId: I('Caster sugar'), amount: 120, unit: 'g' },
          { ingredientId: I('Plain flour'),  amount: 50,  unit: 'g' },
          { ingredientId: I('Vanilla bean'), amount: 1,   unit: 'pcs' },
        ],
        steps: [
          'Infuse the milk with split vanilla.',
          'Whisk yolks, sugar and flour; temper with the milk and cook to a thick cream.',
          'Pass, cover on the surface and chill.'
        ].join('\n\n'),
        allergens: ['dairy', 'eggs', 'gluten'],
      },
      {
        name: 'Crème Anglaise', category: 'cat_other', cuisine: 'French', isSubRecipe: true,
        yieldAmount: 600, yieldUnit: 'ml', servings: 1, prepTime: 10, cookTime: 12,
        ingredients: [
          { ingredientId: I('Milk'),          amount: 250, unit: 'ml' },
          { ingredientId: I('Pouring cream'), amount: 250, unit: 'ml' },
          { ingredientId: I('Egg yolks'),     amount: 6,   unit: 'pcs' },
          { ingredientId: I('Caster sugar'),  amount: 100, unit: 'g' },
          { ingredientId: I('Vanilla bean'),  amount: 1,   unit: 'pcs' },
        ],
        steps: [
          'Heat the milk, cream and vanilla.',
          'Whisk yolks and sugar, temper, then cook gently to 82°C until it coats a spoon.',
          'Strain and chill over ice.'
        ].join('\n\n'),
        allergens: ['dairy', 'eggs'],
      },
    ];

    recipes.forEach(function (r) { PCD.store.upsertRecipe(Object.assign({ _demo: true }, r)); });

    // Re-fetch with assigned ids
    const all = PCD.store.listRecipes();
    const byName = {};
    all.forEach(function (r) { byName[r.name] = r; });
    const R = function (n) { return byName[n]; };

    // 2b) Alt-tarif demosu: klasik prep'leri mevcut yemeklere EKLE. Mevcut malzeme
    // satırları korunur; yalnız bir { recipeId } satırı eklenir → ziyaretçi sub-recipe
    // maliyet cascade'ini gerçek veride görür. (Demi-Glace 2 yemekte = reuse gösterimi.)
    [
      ['Filet de Bœuf au Poivre', 'Demi-Glace',        60,  'ml'],
      ['Confit de Canard',        'Demi-Glace',        50,  'ml'],
      ['Coquilles Saint-Jacques', 'Beurre Blanc',      60,  'ml'],
      ['Sole Meunière',           'Sauce Hollandaise', 60,  'ml'],
      ['Profiteroles',            'Crème Pâtissière',  200, 'g'],
      ['Tarte Tatin',             'Crème Anglaise',    80,  'ml'],
    ].forEach(function (lnk) {
      const dish = R(lnk[0]); const prep = R(lnk[1]);
      if (dish && prep) {
        dish.ingredients = (dish.ingredients || []).concat([{ recipeId: prep.id, amount: lnk[2], unit: lnk[3] }]);
        PCD.store.upsertRecipe(dish);
      }
    });

    // 3) Suppliers
    const supplierData = [
      { name: 'Provencale Produce', category: 'Produce', phone: '+61 8 6555 0101', email: 'orders@provencale.example', products: [
        { name: 'Brown onion', unit: 'kg' }, { name: 'Shallot', unit: 'kg' }, { name: 'Leek', unit: 'kg' },
        { name: 'Fennel', unit: 'kg' }, { name: 'Mixed salad leaves', unit: 'kg' }, { name: 'Lemon', unit: 'kg' },
      ]},
      { name: 'Boucherie Meats', category: 'Meat & Poultry', phone: '+61 8 6555 0202', email: 'orders@boucherie.example', products: [
        { name: 'Beef eye fillet', unit: 'kg' }, { name: 'Duck leg', unit: 'kg' },
        { name: 'Free-range chicken', unit: 'kg' }, { name: 'Foie gras', unit: 'kg' },
      ]},
      { name: 'Marseille Seafood', category: 'Seafood', phone: '+61 8 6555 0303', email: 'orders@marseille.example', products: [
        { name: 'Scallops', unit: 'kg' }, { name: 'Sole fillet', unit: 'kg' },
        { name: 'Mussels', unit: 'kg' }, { name: 'Prawns', unit: 'kg' }, { name: 'Snapper fillet', unit: 'kg' },
      ]},
      { name: 'Laiterie Dairy', category: 'Dairy', phone: '+61 8 6555 0404', email: 'orders@laiterie.example', products: [
        { name: 'Butter (unsalted)', unit: 'kg' }, { name: 'Pouring cream', unit: 'l' },
        { name: 'Gruyere', unit: 'kg' }, { name: 'Goat cheese (chevre)', unit: 'kg' },
      ]},
      { name: 'Boulangerie Wholesale', category: 'Dry Goods', phone: '+61 8 6555 0505', email: 'orders@boulangerie.example', products: [
        { name: 'Baguette', unit: 'pcs' }, { name: 'Plain flour', unit: 'kg' }, { name: 'Caster sugar', unit: 'kg' },
      ]},
      { name: 'Maison Dry Goods', category: 'Dry Goods', phone: '+61 8 6555 0606', email: 'orders@maison.example', products: [
        { name: 'Saffron threads', unit: 'g' }, { name: 'Vanilla bean', unit: 'pcs' },
        { name: 'Dark chocolate 70%', unit: 'kg' }, { name: 'Dijon mustard', unit: 'kg' },
      ]},
    ];
    supplierData.forEach(function (s) {
      PCD.store.upsertInTable('suppliers', Object.assign({ _demo: true }, s), 's');
    });

    // 4) Inventory (mostly OK, one low, one critical)
    const wsId = PCD.store.getActiveWorkspaceId();
    const inv = PCD.store.get('inventory') || {};
    inv[wsId] = inv[wsId] || {};
    const invMap = {
      'Butter (unsalted)':  { stock: 6500, parLevel: 4000, minLevel: 1500 },
      'Pouring cream':      { stock: 3200, parLevel: 2000, minLevel: 600 },
      'Scallops':           { stock: 2200, parLevel: 1500, minLevel: 800 },
      'Duck leg':           { stock: 2600, parLevel: 2000, minLevel: 600 },
      'Foie gras':          { stock: 1100, parLevel: 800,  minLevel: 400 },
      'Dark chocolate 70%': { stock: 2600, parLevel: 2000, minLevel: 1000 },
      'Gruyere':            { stock: 2400, parLevel: 2000, minLevel: 600 },
      'Red wine':           { stock: 3800, parLevel: 3000, minLevel: 1200 },
    };
    Object.keys(invMap).forEach(function (name) {
      const ingId = I(name);
      if (!ingId) return;
      const cfg = invMap[name];
      const row = {
        stock: cfg.stock, parLevel: cfg.parLevel, minLevel: cfg.minLevel,
        lastCountedAt: new Date(Date.now() - 86400000).toISOString(), _demo: true,
      };
      inv[wsId][ingId] = row;
    });
    PCD.store.set('inventory', inv);

    // 5) Menu — À la Carte. Seeded with a pre-built STUDIO design so it does NOT
    //    auto-convert from the recipes on first open. importFromClassic() pulls
    //    each recipe's plating note (kitchen text, not menu copy) + a 56px photo
    //    into every line — 14 dishes of that overflow one A4 page and read like a
    //    diner, not fine dining. Instead: no per-dish photos, concise menu copy,
    //    tuned to fit a single A4 page (verified rendered). Classic `sections`
    //    kept for data/allergens; `studio` is what the editor & print render.
    function mi(name, codes) { const r = R(name); return r ? { id: PCD.uid('mi'), recipeId: r.id, codes: codes } : null; }
    function sit(name, price, desc) { const r = R(name); return { id: PCD.uid('mi'), name: name, price: String(price), desc: desc, recipeId: r ? r.id : undefined }; }
    function sblk(o) { return Object.assign({ id: PCD.uid('blk') }, o); }
    PCD.store.upsertInTable('menus', {
      name: 'À la Carte', subtitle: 'Sample · customize me', allergenStyle: 'codes',
      sections: [
        { id: PCD.uid('sec'), name: 'Entrées', items: [
          mi('Soupe à l\'Oignon Gratinée', ['v', 'a_d', 'a_g']),
          mi('Foie Gras au Torchon', ['a_g']),
          mi('Coquilles Saint-Jacques', ['gf', 'a_sf', 'a_d']),
          mi('Tartare de Bœuf', ['gf', 'a_e']),
          mi('Salade de Chèvre Chaud', ['v', 'a_d', 'a_g', 'a_n']),
        ].filter(Boolean) },
        { id: PCD.uid('sec'), name: 'Plats', items: [
          mi('Filet de Bœuf au Poivre', ['gf', 'a_d']),
          mi('Sole Meunière', ['a_f', 'a_d', 'a_g']),
          mi('Confit de Canard', ['gf']),
          mi('Coq au Vin', ['a_g', 'a_d']),
          mi('Bouillabaisse Marseillaise', ['gf', 'a_f', 'a_sf']),
        ].filter(Boolean) },
        { id: PCD.uid('sec'), name: 'Desserts', items: [
          mi('Crème Brûlée', ['v', 'gf', 'a_d', 'a_e']),
          mi('Tarte Tatin', ['v', 'a_g', 'a_d', 'a_e']),
          mi('Mousse au Chocolat', ['v', 'gf', 'a_d', 'a_e']),
          mi('Profiteroles', ['v', 'a_g', 'a_d', 'a_e']),
        ].filter(Boolean) },
      ],
      studio: {
        page: { paper: 'A3', orientation: 'portrait', columns: 1, bg: '#f3ece0', ink: '#2b251e', accent: '#9a6c3c', baseFont: 'Cormorant', pad: 64, showAllergens: false, showPrices: true, frame: true, frameStyle: 'double', framePad: 26 },
        blocks: [
          sblk({ type: 'heading', text: 'À la Carte', align: 'center', size: 64, weight: 500, color: '' }),
          sblk({ type: 'divider', dividerStyle: 'floral', size: 18, color: '' }),
          sblk({ type: 'section', title: 'Entrées', titleSize: 36, itemSize: 22, items: [
            sit('Soupe à l\'Oignon Gratinée', 18, 'Slow-cooked onions, beef broth, Gruyère gratin'),
            sit('Foie Gras au Torchon', 44, 'House-cured foie gras, brioche, shallot & honey'),
            sit('Coquilles Saint-Jacques', 40, 'Seared scallops, leek fondue, white-wine velouté'),
            sit('Tartare de Bœuf', 30, 'Hand-cut tenderloin, capers, cornichons, yolk'),
            sit('Salade de Chèvre Chaud', 18, 'Warm goat cheese, walnuts, apple, honey'),
          ] }),
          sblk({ type: 'section', title: 'Plats', titleSize: 36, itemSize: 22, items: [
            sit('Filet de Bœuf au Poivre', 54, 'Eye fillet, green-peppercorn & Cognac cream'),
            sit('Sole Meunière', 48, 'Pan-fried sole, beurre noisette, lemon, capers'),
            sit('Confit de Canard', 38, 'Slow-cooked duck leg, orange jus'),
            sit('Coq au Vin', 34, 'Braised chicken, red wine, lardons, mushrooms'),
            sit('Bouillabaisse Marseillaise', 52, 'Snapper, prawns, mussels, saffron broth, rouille'),
          ] }),
          sblk({ type: 'section', title: 'Desserts', titleSize: 36, itemSize: 22, items: [
            sit('Crème Brûlée', 14, 'Vanilla custard, caramelised sugar'),
            sit('Tarte Tatin', 14, 'Caramelised apple tart, crème fraîche'),
            sit('Mousse au Chocolat', 13, 'Dark chocolate mousse, cocoa'),
            sit('Profiteroles', 15, 'Choux, Chantilly, warm chocolate sauce'),
          ] }),
        ],
      },
      hidePrices: false, _demo: true,
    }, 'm');

    // 6) Kitchen Cards canvas (line reference — three mains)
    const cvLayout = ['Filet de Bœuf au Poivre', 'Sole Meunière', 'Confit de Canard']
      .map(function (n) { const r = R(n); return r ? { recipeId: r.id, span: 1 } : null; }).filter(Boolean);
    if (cvLayout.length) {
      PCD.store.upsertInTable('canvases', {
        name: 'Service — Mains', columns: 3, orientation: 'landscape', fontSize: 'medium',
        showMethod: true, showAmounts: true, layout: cvLayout, _demo: true,
      }, 'cvs');
    }

    // 7) Event — a two-function wedding at full BEO capacity: multiple functions,
    //    guaranteed-count billing, dietary, itemised charges (cost vs client price),
    //    deposit/balance payment schedule, run-of-show timeline, task checklist,
    //    and staffing as a real labour P&L line. Customize or delete.
    const now = new Date();
    const daysUntilSat = (6 - now.getDay() + 7) % 7 || 7;
    const eventDate = new Date(now.getTime() + daysUntilSat * 86400000);
    const evDateStr = eventDate.toISOString().slice(0, 10);
    const fr1 = R('Filet de Bœuf au Poivre'), en1 = R('Coquilles Saint-Jacques'),
          de1 = R('Crème Brûlée'), sal = R('Salade de Chèvre Chaud');
    if (fr1 && en1) {
      PCD.store.upsertInTable('events', {
        name: 'Laurent Wedding', status: 'confirmed',
        client: 'Laurent & Marie', contactName: 'Marie Laurent', contactPhone: '',
        notes: 'Sample event · full BEO demo — customize or delete',
        pricePerHead: 80, serviceChargePct: 10,
        functions: [
          { id: PCD.uid('fn'), name: 'Reception', date: evDateStr, time: '18:00', endTime: '19:30',
            room: 'Garden Terrace', guestCount: 80, guaranteedCount: 76,
            menu: [
              en1 ? { recipeId: en1.id, portionsPerGuest: 0.5 } : null,
              sal ? { recipeId: sal.id, portionsPerGuest: 0.5 } : null,
            ].filter(Boolean),
            dietaryNote: '4 vegetarian · 2 gluten-free · 1 shellfish allergy', notes: 'Canapés, passed' },
          { id: PCD.uid('fn'), name: 'Dinner', date: evDateStr, time: '20:00', endTime: '22:30',
            room: 'Main Hall', guestCount: 80, guaranteedCount: 76,
            menu: [
              { recipeId: en1.id, portionsPerGuest: 1 },
              { recipeId: fr1.id, portionsPerGuest: 1 },
              de1 ? { recipeId: de1.id, portionsPerGuest: 1 } : null,
            ].filter(Boolean),
            dietaryNote: '4 vegetarian · 2 gluten-free', notes: 'Plated, synchronised service' },
        ],
        staffing: [
          { role: 'Chefs', count: 3, hours: 10, rate: 35 },
          { role: 'Servers', count: 6, hours: 6, rate: 28 },
        ],
        charges: [
          { label: 'China & linen hire', cost: 720, price: 950 },
          { label: 'Bar staff (2)', cost: 480, price: 640 },
        ],
        payments: [
          { label: 'Deposit', due: '', amount: 3000, paid: true },
          { label: 'Balance', due: evDateStr, amount: null, paid: false },
        ],
        timeline: [
          { time: '14:00', label: 'Load-in & kitchen setup' },
          { time: '18:00', label: 'Reception — canapés' },
          { time: '20:00', label: 'Dinner service' },
          { time: '21:30', label: 'Cake & coffee' },
          { time: '23:00', label: 'Breakdown' },
        ],
        tasks: [
          { label: 'Confirm final guest count', due: '', done: true },
          { label: 'Order flowers from supplier', due: '', done: false },
          { label: 'Brief floor team on dietary table plan', due: '', done: false },
        ],
        _demo: true,
      }, 'e');
    }

    // 8) Roster — a full fine-dining brigade for the week (Kitchen + Front of House).
    //    Restaurant dark on Monday; busiest Fri/Sat. The grid is free; labour cost
    //    is a Pro stat (free guests see a lock). Rates/hours stay realistic.
    (function () {
      const rid = function () { return PCD.uid('rs'); };
      const AM = { start: '09:00', end: '17:00' }, MID = { start: '12:00', end: '20:00' }, PM = { start: '15:00', end: '23:30' }, OFF = { status: 'OFF' };
      const st = [
        { id: rid(), name: 'Marco Rossi',    role: 'Head Chef',          rate: 46, group: 'Kitchen',        sh: [OFF, MID, MID, OFF, PM, PM, MID] },
        { id: rid(), name: 'Aisha Khan',     role: 'Sous Chef',          rate: 38, group: 'Kitchen',        sh: [OFF, MID, MID, MID, PM, PM, OFF] },
        { id: rid(), name: 'Tom Walker',     role: 'Chef de Partie',     rate: 32, group: 'Kitchen',        sh: [OFF, OFF, MID, MID, PM, PM, MID] },
        { id: rid(), name: 'Lena Bauer',     role: 'Chef de Partie',     rate: 32, group: 'Kitchen',        sh: [OFF, MID, OFF, MID, PM, PM, MID] },
        { id: rid(), name: 'Priya Anand',    role: 'Pastry Chef',        rate: 34, group: 'Kitchen',        sh: [OFF, AM, AM, AM, AM, AM, OFF] },
        { id: rid(), name: 'Hugo Lefèvre',   role: 'Commis Chef',        rate: 27, group: 'Kitchen',        sh: [OFF, MID, MID, OFF, PM, PM, MID] },
        { id: rid(), name: 'Sam Okafor',     role: 'Kitchen Hand',       rate: 25, group: 'Kitchen',        sh: [OFF, MID, MID, MID, PM, PM, OFF] },
        { id: rid(), name: 'Sofia Costa',    role: 'Restaurant Manager', rate: 40, group: 'Front of House', sh: [OFF, MID, MID, MID, PM, PM, MID] },
        { id: rid(), name: 'Daniel Reyes',   role: 'Sommelier',          rate: 36, group: 'Front of House', sh: [OFF, OFF, PM, PM, PM, PM, MID] },
        { id: rid(), name: 'Émilie Laurent', role: 'Waiter',             rate: 28, group: 'Front of House', sh: [OFF, PM, OFF, PM, PM, PM, MID] },
      ];
      const cells = {};
      st.forEach(function (s) { const c = {}; s.sh.forEach(function (v, d) { c[d] = v; }); cells[s.id] = c; });
      function monday() { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.toISOString().slice(0, 10); }
      PCD.store.upsertInTable('rosters', {
        name: 'Week — Dinner Service', venue: 'Main Kitchen — Duty Roster', weekStart: monday(), dayCount: 7,
        templates: [{ id: PCD.uid('st'), label: 'AM', start: '09:00', end: '17:00' }, { id: PCD.uid('st'), label: 'PM', start: '15:00', end: '23:30' }],
        staff: st.map(function (s) { return { id: s.id, name: s.name, role: s.role, rate: s.rate, group: s.group }; }),
        cells: cells, _demo: true,
      }, 'rost');
    })();

    // 9) Prep sheet — dinner-service mise en place, organised by station.
    //    Each dish lists its prep components; the printed sheet has a blank box
    //    per line for the section to write quantities. Set active so it opens.
    (function () {
      function comp(text) { return { id: PCD.uid('c'), text: text }; }
      function pdish(name, station, comps) { const r = R(name); return { id: PCD.uid('d'), recipeId: r ? r.id : null, name: r ? r.name : name, station: station, components: comps.map(comp) }; }
      const ps = PCD.store.upsertInTable('prepSheets', {
        name: 'Dinner Service — Mise en Place', columns: 3, orientation: 'portrait',
        accent: '#16433a', fontSize: 'm', bold: false, border: 'medium', spacing: 'medium',
        dishes: [
          pdish('Tartare de Bœuf', 'Garde Manger', ['Tenderloin — hand-diced', 'Capers · cornichons · shallot', 'Egg yolks portioned']),
          pdish('Salade de Chèvre Chaud', 'Garde Manger', ['Chèvre croûtes ×40', 'Walnuts toasted', 'Honey vinaigrette']),
          pdish('Filet de Bœuf au Poivre', 'Sauce', ['Fillets portioned 160 g', 'Green peppercorns cracked', 'Peppercorn–Cognac base']),
          pdish('Confit de Canard', 'Sauce', ['Duck legs confit (overnight)', 'Orange jus']),
          pdish('Coq au Vin', 'Sauce', ['Chicken browned + lardons', 'Red-wine braise', 'Mushrooms glazed']),
          pdish('Coquilles Saint-Jacques', 'Poisson', ['Scallops cleaned', 'Leek fondue', 'White-wine velouté']),
          pdish('Bouillabaisse Marseillaise', 'Poisson', ['Saffron broth', 'Snapper · prawns · mussels', 'Rouille']),
          pdish('Crème Brûlée', 'Pâtisserie', ['Custard baked ×60', 'Sugar for torching']),
          pdish('Tarte Tatin', 'Pâtisserie', ['Tatins baked ×6']),
          pdish('Profiteroles', 'Pâtisserie', ['Choux piped + baked', 'Chantilly', 'Chocolate sauce']),
        ],
        _demo: true,
      }, 'ps');
      PCD.store.set('prefs.prepActiveId', ps.id);
    })();

    // 10) Buffet — a French wedding reception. IMPORTANT: recipe items use
    //     amountPerGuest = PORTIONS per guest (not grams — grams ~100× the cost);
    //     custom items use grams/ml/pcs and cost 0 (placeholder labels).
    (function () {
      const nowIso = new Date().toISOString();
      function ritem(name, perGuest, pickup) { const r = R(name); return r ? { recipeId: r.id, amountPerGuest: perGuest, unit: 'serving', pickupRatio: pickup, refillX: null } : null; }
      function citem(name, amt, unit, pickup) { return { customName: name, amountPerGuest: amt, unit: unit, pickupRatio: pickup, refillX: null }; }
      const buffet = {
        id: PCD.uid('bf'), createdAt: nowIso, updatedAt: nowIso, _demo: true,
        name: 'Wedding Reception', type: 'dinner', coverCount: 80, ticketPrice: 115, durationHours: 3, refillMultiplier: 1.1,
        prepFactor: 0.9,
        notes: 'Sample buffet · forecast prep for 90% of covers · customize or delete',
        stations: [
          { name: 'Hors d\'Œuvres', type: 'cold', items: [
            ritem('Salade de Chèvre Chaud', 0.5, 0.80),
            ritem('Tartare de Bœuf', 0.4, 0.82),
            citem('Smoked salmon blini', 2, 'pcs', 0.85),
            citem('Charcuterie & cornichons', 50, 'g', 0.80),
          ].filter(Boolean) },
          { name: 'Plats', type: 'hot', items: [
            ritem('Coq au Vin', 0.7, 0.92),
            ritem('Confit de Canard', 0.6, 0.90),
            ritem('Filet de Bœuf au Poivre', 0.4, 0.88),
            citem('Gratin dauphinois', 120, 'g', 0.90),
            citem('Ratatouille', 90, 'g', 0.82),
          ].filter(Boolean) },
          { name: 'Fromage', type: 'cold', items: [
            citem('French cheese selection', 60, 'g', 0.82),
            citem('Baguette & crackers', 40, 'g', 0.85),
            citem('Fig & quince paste', 20, 'g', 0.72),
          ] },
          { name: 'Desserts', type: 'bakery', items: [
            ritem('Crème Brûlée', 0.6, 0.88),
            ritem('Profiteroles', 0.6, 0.86),
            citem('Assorted macarons', 2, 'pcs', 0.85),
            citem('Fresh berries', 60, 'g', 0.82),
          ].filter(Boolean) },
        ],
      };
      const root = PCD.store._read('buffets') || {};
      const next = Array.isArray(root) ? {} : Object.assign({}, root);
      const arr = (Array.isArray(root) ? [] : (root[wsId] || [])).slice();
      arr.push(buffet);
      next[wsId] = arr;
      PCD.store.set('buffets', next);
    })();

    // 11) Whiteboard — tonight's service board (covers, dietary counts, 86 list,
    //     specials). Set active so it opens straight to the board.
    (function () {
      function wblk(type, layout, style, content) { return { id: PCD.uid('blk'), type: type, layout: layout, style: style, content: content }; }
      const board = {
        id: PCD.uid('wb'), name: "Tonight's Service", title: "TONIGHT'S SERVICE", paper: 'A4', orient: 'landscape',
        format: 'v2', updatedAt: new Date().toISOString(),
        blocks: [
          wblk('section_header', 'full', { color: 'forest', size: 'xl', align: 'center' }, { text: "TONIGHT'S SERVICE — FRI" }),
          wblk('big_number', 'half', { color: 'brand', size: 'xxl', align: 'center' }, { value: '78', label: 'COVERS BOOKED', sub: '2 sittings' }),
          wblk('big_number', 'half', { color: 'amber', size: 'xxl', align: 'center' }, { value: '12', label: 'WALK-IN ROOM', sub: '' }),
          wblk('big_number', 'third', { color: 'mint', size: 'lg', align: 'center' }, { value: '3', label: 'VEGAN' }),
          wblk('big_number', 'third', { color: 'blue', size: 'lg', align: 'center' }, { value: '6', label: 'GF / DF' }),
          wblk('big_number', 'third', { color: 'red', size: 'lg', align: 'center' }, { value: '2', label: 'ALLERGY' }),
          wblk('divider', 'full', { color: 'steak', size: 'sm', align: 'center' }, { label: '86 · OUT OF STOCK' }),
          wblk('checklist', 'full', { color: 'white', size: 'md', align: 'left' }, { items: [
            { text: 'Sole — 4 portions left', done: false },
            { text: 'Foie gras — 86 (sold out)', done: true },
            { text: 'Soufflé — 30 min notice', done: false },
          ] }),
          wblk('divider', 'full', { color: 'forest', size: 'sm', align: 'center' }, { label: "TONIGHT'S SPECIALS" }),
          wblk('text', 'full', { color: 'cream', size: 'md', align: 'left' }, { text: 'Amuse — chilled pea velouté\nSpecial — roasted venison, blackberry jus · $54\nPairing — Côtes du Rhône 2021' }),
        ],
      };
      const root = PCD.store._read('whiteboards') || {};
      const next = Array.isArray(root) ? {} : Object.assign({}, root);
      const arr = (Array.isArray(root) ? [] : (root[wsId] || [])).slice();
      arr.push(board);
      next[wsId] = arr;
      PCD.store.set('whiteboards', next);
      PCD.store.set('prefs.whiteboardActiveId', board.id);
    })();

    PCD.store.update('onboarding', { demoSeeded: true });
    PCD.log('Demo data seeded (French à la carte).');
  }

  PCD.demo = { seed: seedDemo };
})();
