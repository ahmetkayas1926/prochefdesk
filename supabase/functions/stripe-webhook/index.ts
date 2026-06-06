// =============================================================
// ProChefDesk — stripe-webhook Edge Function (v2.17)
// =============================================================
// Stripe abonelik olaylarını dinler ve user_prefs plan kolonlarını
// service_role ile günceller. GERÇEK plan otoritesi burasıdır.
//
// DİNLENEN OLAYLAR:
//   - checkout.session.completed        → pro'ya yükselt + customer/expiry kaydet
//   - customer.subscription.updated     → status/expiry/plan güncelle
//   - customer.subscription.deleted     → free'ye düşür
//
// KRİTİK GUARD (spec 1.4): plan_source='manual' olan satırlar webhook
// tarafından ASLA güncellenmez. Manuel pro kalıcıdır. Tüm UPDATE'ler
// `.neq('plan_source','manual')` ile korunur.
//
// GEREKLİ ENV (Supabase → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY          — sk_live_... / sk_test_...
//   STRIPE_WEBHOOK_SECRET      — whsec_...  (Stripe Dashboard → Webhooks → bu endpoint)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — (otomatik mevcut)
//
// DEPLOY:
//   supabase functions deploy stripe-webhook --no-verify-jwt
//   (--no-verify-jwt ŞART: Stripe JWT göndermez, imzayla doğrularız.)
//   Sonra Stripe Dashboard → Developers → Webhooks → Add endpoint:
//     URL: https://<project-ref>.functions.supabase.co/stripe-webhook
//     Events: checkout.session.completed, customer.subscription.updated,
//             customer.subscription.deleted
//   Açılan "Signing secret"i STRIPE_WEBHOOK_SECRET olarak ekle.
//
// SECURITY:
//   - JWT yok; bunun yerine Stripe imzası (constructEventAsync) doğrulanır
//   - service_role ile yazılır; imza geçersizse 400 döner, hiçbir şey yazılmaz
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})
const cryptoProvider = Stripe.createSubtleCryptoProvider()

// Stripe abonelik durumu → bizim kontrollü kümemiz
function mapStatus(stripeStatus: string): { plan: string; status: string } {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return { plan: 'pro', status: 'active' }
    case 'past_due':
    case 'unpaid':
      return { plan: 'pro', status: 'past_due' }   // grace; expiry fetchPlan'de kontrol edilir
    default: // canceled, incomplete, incomplete_expired, paused
      return { plan: 'free', status: 'canceled' }
  }
}

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Manuel pro KORUNUR: her update plan_source!='manual' satırlara uygulanır.
async function updateByUserId(userId: string, patch: Record<string, unknown>) {
  await admin().from('user_prefs').update(patch)
    .eq('user_id', userId).neq('plan_source', 'manual')
}
async function updateByCustomer(customerId: string, patch: Record<string, unknown>) {
  await admin().from('user_prefs').update(patch)
    .eq('stripe_customer_id', customerId).neq('plan_source', 'manual')
}

function expiryISO(sub: Stripe.Subscription): string | null {
  const end = (sub as { current_period_end?: number }).current_period_end
  return end ? new Date(end * 1000).toISOString() : null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const sig = req.headers.get('stripe-signature')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!sig || !webhookSecret) {
    return new Response('Missing signature', { status: 400 })
  }

  let event: Stripe.Event
  try {
    const body = await req.text()
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret, undefined, cryptoProvider)
  } catch (e) {
    console.error('Webhook signature verification failed:', (e as Error).message)
    return new Response('Invalid signature', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.client_reference_id
          || (session.metadata && session.metadata.user_id) || null
        const customerId = typeof session.customer === 'string' ? session.customer : null
        if (!userId) break

        let patch: Record<string, unknown> = {
          plan: 'pro', plan_source: 'stripe', plan_status: 'active',
        }
        if (customerId) patch.stripe_customer_id = customerId

        // Abonelikten dönem sonunu çek (expiry)
        if (typeof session.subscription === 'string') {
          const sub = await stripe.subscriptions.retrieve(session.subscription)
          const m = mapStatus(sub.status)
          patch.plan = m.plan
          patch.plan_status = m.status
          patch.plan_expires_at = expiryISO(sub)
        }
        await updateByUserId(userId, patch)
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const customerId = typeof sub.customer === 'string' ? sub.customer : null
        if (!customerId) break
        const m = mapStatus(sub.status)
        await updateByCustomer(customerId, {
          plan: m.plan, plan_source: 'stripe', plan_status: m.status,
          plan_expires_at: expiryISO(sub),
        })
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const customerId = typeof sub.customer === 'string' ? sub.customer : null
        if (!customerId) break
        await updateByCustomer(customerId, {
          plan: 'free', plan_source: 'stripe', plan_status: 'canceled',
          plan_expires_at: expiryISO(sub),
        })
        break
      }

      default:
        // Diğer olaylar yok sayılır (200 dönülür ki Stripe retry etmesin)
        break
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('stripe-webhook handler error:', (e as Error).message)
    // 500 → Stripe retry eder (geçici DB hatası için iyi)
    return new Response('Handler error', { status: 500 })
  }
})
