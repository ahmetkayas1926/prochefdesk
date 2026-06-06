// =============================================================
// ProChefDesk — create-checkout-session Edge Function (v2.17)
// =============================================================
// Pro abonelik için Stripe Checkout oturumu yaratır ve URL döndürür.
// Frontend kullanıcıyı bu URL'ye yönlendirir; ödeme Stripe'ta tamamlanır;
// gerçek plan yükseltmesi stripe-webhook fonksiyonunda olur (güvenli).
//
// FLOW:
//   1. POST { plan: 'monthly'|'annual', returnUrl? } + Authorization: Bearer <jwt>
//   2. JWT doğrula → user.id + email
//   3. user_prefs.stripe_customer_id varsa kullan; yoksa Stripe customer yarat
//      ve service_role ile user_prefs'e yaz
//   4. Checkout Session yarat (mode=subscription, doğru price)
//   5. { url } döndür
//
// GEREKLİ ENV (Supabase → Project Settings → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY        — Stripe gizli anahtarı (sk_live_... / sk_test_...)
//   STRIPE_PRICE_MONTHLY     — Pro Monthly price id (price_...)
//   STRIPE_PRICE_ANNUAL      — Pro Annual price id (price_...)
//   SUPABASE_URL             — (otomatik mevcut)
//   SUPABASE_ANON_KEY        — (otomatik mevcut)
//   SUPABASE_SERVICE_ROLE_KEY— (otomatik mevcut)
//
// DEPLOY:
//   supabase functions deploy create-checkout-session
//
// SECURITY:
//   - Caller JWT zorunlu; sadece kendi user_id'si için oturum açar
//   - Plan yükseltme BURADA yapılmaz — sadece webhook (imza doğrulamalı) yapar
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEFAULT_RETURN = 'https://prochefdesk.com/app/'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // 1. JWT doğrula
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const jwt = authHeader.replace('Bearer ', '')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid JWT' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Body
    const body = await req.json().catch(() => ({}))
    const planChoice = body.plan === 'annual' ? 'annual' : 'monthly'
    const returnUrl = (typeof body.returnUrl === 'string' && body.returnUrl.startsWith('http'))
      ? body.returnUrl : DEFAULT_RETURN

    const priceId = planChoice === 'annual'
      ? Deno.env.get('STRIPE_PRICE_ANNUAL')
      : Deno.env.get('STRIPE_PRICE_MONTHLY')
    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Price not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 3. Stripe customer (varsa yeniden kullan)
    let customerId: string | null = null
    const { data: prefRow } = await admin
      .from('user_prefs').select('stripe_customer_id').eq('user_id', user.id).maybeSingle()
    if (prefRow && prefRow.stripe_customer_id) {
      customerId = prefRow.stripe_customer_id
    } else {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      })
      customerId = customer.id
      // service_role ile yaz — frontend bu kolonu yazamaz
      await admin.from('user_prefs')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', user.id)
    }

    // 4. Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId!,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      subscription_data: { metadata: { user_id: user.id } },
      metadata: { user_id: user.id },
      allow_promotion_codes: true,
      success_url: returnUrl + '?checkout=success',
      cancel_url: returnUrl + '?checkout=cancel',
    })

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('create-checkout-session error:', (e as Error).message)
    return new Response(JSON.stringify({ error: 'Checkout failed', detail: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
