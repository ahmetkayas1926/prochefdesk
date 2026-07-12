// =============================================================
// ProChefDesk — send-proposal-email Edge Function (v2.44.139)
// =============================================================
// Chef clicks "Send signing link" (events.js openPreview → wireSignLink)
// and confirms in a popup showing the client's email. This function
// emails that client the proposal/signing link via Resend.
//
//   1. POST { share_id } + Authorization: Bearer <chef's JWT>
//   2. JWT doğrula → user
//   3. service_role: public_shares satırını (id=share_id, kind='event',
//      owner_id=user.id, share_mode='sign') doğrula → source_id (event id)
//   4. service_role: events satırını (id=source_id, user_id=user.id) oku →
//      data.clientEmail + data.name — asla client'ın gönderdiği "to" adresine
//      güvenilmez, her zaman event kaydındaki gerçek clientEmail kullanılır
//      (bu fonksiyonun keyfi adreslere spam göndermek için kötüye kullanılmasını
//      önler — yalnız kendi event'ine kayıtlı email'e gönderebilir).
//   5. Resend ile gönder, { sent: true } döndür (bu akışta hata sessiz
//      yutulmaz — buton tıklamasının doğrudan sonucu, şef bilmeli).
//
// REQUIRED SECRET: RESEND_API_KEY (submit-event-signature ile aynı secret)
//
// DEPLOY: Dashboard → Edge Functions → New → paste this code (verify_jwt AÇIK)
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const APP_ORIGIN = 'https://prochefdesk.com/app/'
const FROM_ADDRESS = 'ProChefDesk <notifications@prochefdesk.com>'

function escapeHtml(s: string) {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

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
    const shareId = (body.share_id || '').trim()
    if (!shareId) {
      return new Response(JSON.stringify({ error: 'share_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: share, error: shareErr } = await admin
      .from('public_shares')
      .select('id, source_id, kind, share_mode, owner_id')
      .eq('id', shareId)
      .maybeSingle()
    if (shareErr || !share || share.owner_id !== user.id || share.kind !== 'event' || share.share_mode !== 'sign') {
      return new Response(JSON.stringify({ error: 'Share not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: ev, error: evErr } = await admin
      .from('events')
      .select('data')
      .eq('id', share.source_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (evErr || !ev) {
      return new Response(JSON.stringify({ error: 'Event not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const clientEmail = (ev.data && ev.data.clientEmail || '').trim()
    if (!clientEmail || !clientEmail.includes('@')) {
      return new Response(JSON.stringify({ error: 'No client email set on this event' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const eventName = (ev.data && ev.data.name) || 'Event'

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'Email not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const shareUrl = APP_ORIGIN + '?share=' + shareId
    const subject = `Proposal: ${eventName}`
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1c1917;">
        <h2 style="color:#16433a;margin:0 0 12px;">${escapeHtml(eventName)}</h2>
        <p style="font-size:14px;line-height:1.6;">Please review and sign your event proposal.</p>
        <p><a href="${shareUrl}" style="display:inline-block;background:#16433a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">View &amp; sign proposal</a></p>
        <p style="font-size:12px;color:#888;margin-top:24px;">Sent automatically by ProChefDesk.</p>
      </div>
    `
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [clientEmail], subject, html }),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error('Resend send failed for', clientEmail, res.status, errBody)
      return new Response(JSON.stringify({ error: 'Email send failed' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ sent: true, to: clientEmail }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('send-proposal-email exception:', (e as Error).message)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
