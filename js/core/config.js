/* ================================================================
   ProChefDesk — config.js
   ----------------------------------------------------------------
   THIS IS THE ONLY FILE YOU NEED TO EDIT TO CONNECT YOUR BACKEND.
   Fill in your Supabase credentials below.

   HOW TO GET THESE VALUES:
   See SETUP.md step-by-step guide.

   IMPORTANT: The anon key is PUBLIC — it's safe to put here.
   Row Level Security (RLS) in Supabase protects your data.
   ================================================================ */

window.PCD_CONFIG = {
  // ==============================================================
  // 1. SUPABASE CONFIG — fill these two lines after setup
  // ==============================================================
  SUPABASE_URL:  'https://muuwhrcogikpqylsfvgg.supabase.co',
  SUPABASE_ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11dXdocmNvZ2lrcHF5bHNmdmdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NTk5MDAsImV4cCI6MjA5MjQzNTkwMH0.swsIn1OnMj5h_z1z_7CkoixtuoZAYTR_AAr_4B0jot4',

  // ==============================================================
  // 2. STRIPE — fill later when enabling payments
  // ==============================================================
  STRIPE_PK: 'YOUR_STRIPE_PUBLISHABLE_KEY',

  // ==============================================================
  // 3. APP DEFAULTS
  // ==============================================================
  APP_NAME: 'ProChefDesk',
  APP_VERSION: '2.6.91',
  DEFAULT_CURRENCY: 'USD',
  DEFAULT_LOCALE: 'en',

  // Free tier limits
  // v2.6.25: Şu an her şey ücretsiz. Premium ileride gelirse bu sayılar
  // düşürülecek. 999999 = pratik olarak sınırsız, ama limit kontrol kodu
  // mevcut yapısıyla duruyor (gelecekte tek noktadan açılır).
  FREE_RECIPE_LIMIT: 999999,
  FREE_INGREDIENT_LIMIT: 999999,

  // Supported currencies
  CURRENCIES: [
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
    { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
    { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal' },
  ],

  LOCALES: [
    { code: 'en', label: 'EN', name: 'English',    dir: 'ltr' },
    { code: 'tr', label: 'TR', name: 'Türkçe',     dir: 'ltr' },
    { code: 'es', label: 'ES', name: 'Español',    dir: 'ltr' },
    { code: 'fr', label: 'FR', name: 'Français',   dir: 'ltr' },
    { code: 'de', label: 'DE', name: 'Deutsch',    dir: 'ltr' },
    { code: 'ar', label: 'AR', name: 'العربية',    dir: 'rtl' },
  ],

  // Debug flag — set true to see logs in console
  DEBUG: false,
};

// Helper to detect whether backend is configured
window.PCD_CONFIG.isBackendConfigured = function () {
  return this.SUPABASE_URL &&
         this.SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
         this.SUPABASE_ANON &&
         this.SUPABASE_ANON !== 'YOUR_SUPABASE_ANON_KEY';
};
