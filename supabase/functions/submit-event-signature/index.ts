// =============================================================
// ProChefDesk — submit-event-signature Edge Function (v2.44.134)
// =============================================================
// Client (anonymous, on a public event-proposal signing page) submits
// a captured signature. Never writes to `events`/`public_shares` directly
// from the browser — mirrors the rate-limited-view (v2.9.18) pattern:
//
//   1. POST { share_id, signature_data_url, signed_by } from share.js
//   2. service_role client calls pcd_submit_event_signature RPC
//      (SECURITY DEFINER, anon/authenticated REVOKEd — only service_role
//      may call it). RPC now returns jsonb (v2.44.134): event name,
//      chef's auth.users email, event.clientEmail, share id.
//   3. RPC validates: share exists, kind='event', not paused, not already
//      signed → writes signature into the owning `events` row + marks
//      the share as signed (signed_at/signed_by)
//   4. On success, this function emails BOTH parties (chef + client, if
//      clientEmail was set) a link to the now-signed proposal page via
//      Resend — a durable record in both inboxes, no PDF generation.
//   5. Response 200 { signed: true|false }
//
// DEPLOY:
//   1. supabase login
//   2. supabase link --project-ref <your-project-ref>
//   3. supabase functions deploy submit-event-signature
//   (Alternative: Dashboard → Edge Functions → New → paste this code)
//
// REQUIRED SECRET (v2.44.134 — set in Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY — from resend.com. Without it, signing still works;
//   emails are silently skipped (logged, never blocks the signature write).
//
// SECURITY:
//   - No JWT required (the client signing the proposal is not a PCD user)
//   - service_role key never leaves the server
//   - RPC has REVOKE FROM PUBLIC/anon/authenticated, GRANT TO service_role
//   - RPC itself re-checks paused/signed_at server-side — this function
//     does not trust anything the client claims about share state
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const APP_ORIGIN = 'https://prochefdesk.com/app/'
const FROM_ADDRESS = 'ProChefDesk <notifications@prochefdesk.com>'

// v2.44.134 — En basit/sağlam yöntem: PDF üretmek yerine imzalı sayfanın
// linkini gönder (DocuSign/HelloSign deseni) — sunucu-taraflı render gerektirmez,
// link kalıcı kanıt olur (event silinmedikçe).
async function sendSignedEmail(apiKey: string, to: string, eventName: string, shareUrl: string, signedBy: string, signatureDataUrl: string) {
  const subject = `Signed: ${eventName}`
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1c1917;">
      <h2 style="color:#16433a;margin:0 0 12px;">✓ Proposal signed</h2>
      <p style="font-size:14px;line-height:1.6;"><strong>${escapeHtml(eventName)}</strong> has been signed${signedBy ? ' by ' + escapeHtml(signedBy) : ''}.</p>
      <img src="${signatureDataUrl}" alt="Signature" style="max-height:70px;display:block;margin:12px 0;">
      <p style="font-size:14px;line-height:1.6;">View the signed proposal:</p>
      <p><a href="${shareUrl}" style="display:inline-block;background:#16433a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">View signed proposal</a></p>
      <p style="font-size:12px;color:#888;margin-top:24px;">Sent automatically by ProChefDesk.</p>
    </div>
  `
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error('Resend send failed for', to, res.status, body)
  }
}

function escapeHtml(s: string) {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const shareId = (body.share_id || '').trim()
    const signatureDataUrl = (body.signature_data_url || '').trim()
    const signedBy = (body.signed_by || '').trim().slice(0, 200)

    if (!shareId || !signatureDataUrl) {
      return new Response(JSON.stringify({ error: 'share_id and signature_data_url required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // Basic sanity guard — this must be a PNG data URL from the signature
    // canvas, not an arbitrary payload smuggled through this open endpoint.
    if (!signatureDataUrl.startsWith('data:image/png;base64,') || signatureDataUrl.length > 2_000_000) {
      return new Response(JSON.stringify({ error: 'invalid signature payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await supabase.rpc('pcd_submit_event_signature', {
      p_share_id: shareId,
      p_signature_data_url: signatureDataUrl,
      p_signed_by: signedBy,
    })

    if (error) {
      console.error('pcd_submit_event_signature error:', error.message)
      return new Response(JSON.stringify({ signed: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const signed = !!(data && data.signed === true)

    // v2.44.134 — İmza başarılıysa iki tarafa da e-posta (best-effort, asla
    // imza kaydını bloklamaz — Resend anahtarı eksikse/hata verirse sadece loglanır).
    if (signed) {
      const resendKey = Deno.env.get('RESEND_API_KEY')
      if (resendKey) {
        const shareUrl = APP_ORIGIN + '?share=' + shareId
        const eventName = data.eventName || 'Event'
        const recipients = [data.ownerEmail, data.clientEmail].filter(
          (e: unknown): e is string => typeof e === 'string' && e.includes('@')
        )
        await Promise.all(
          recipients.map((to: string) => sendSignedEmail(resendKey, to, eventName, shareUrl, signedBy, signatureDataUrl).catch((e) => {
            console.error('sendSignedEmail failed for', to, (e as Error).message)
          }))
        )
      } else {
        console.log('RESEND_API_KEY not set — skipping signed-email notification')
      }
    }

    return new Response(JSON.stringify({ signed }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('submit-event-signature exception:', (e as Error).message)
    return new Response(JSON.stringify({ signed: false }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
