// =============================================================
// ProChefDesk — create-portal-session Edge Function (v2.17)
// =============================================================
// Pro kullanıcı için Stripe Customer Portal oturumu yaratır (abonelik
// yönetimi: kart değiştir, iptal et, fatura geçmişi). URL döndürür.
//
// FLOW:
//   1. POST { returnUrl? } + Authorization: Bearer <jwt>
//   2. JWT doğrula → user.id
//   3. user_prefs.stripe_customer_id oku (service_role)
//   4. Billing Portal session yarat → { url } döndür
//
// GEREKLİ ENV:
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// ÖN KOŞUL: Stripe Dashboard → Settings → Billing → Customer Portal AKTİF.
//
// DEPLOY:
//   supabase functions deploy create-portal-session
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

    const body = await req.json().catch(() => ({}))
    const returnUrl = (typeof body.returnUrl === 'string' && body.returnUrl.startsWith('http'))
      ? body.returnUrl : DEFAULT_RETURN

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: prefRow } = await admin
      .from('user_prefs').select('stripe_customer_id').eq('user_id', user.id).maybeSingle()

    if (!prefRow || !prefRow.stripe_customer_id) {
      return new Response(JSON.stringify({ error: 'No subscription found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    })
    const portal = await stripe.billingPortal.sessions.create({
      customer: prefRow.stripe_customer_id,
      return_url: returnUrl,
    })

    return new Response(JSON.stringify({ url: portal.url }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('create-portal-session error:', (e as Error).message)
    return new Response(JSON.stringify({ error: 'Portal failed', detail: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
