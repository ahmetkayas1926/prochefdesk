// =============================================================
// ProChefDesk — submit-event-signature Edge Function (v2.44.130)
// =============================================================
// Client (anonymous, on a public event-proposal signing page) submits
// a captured signature. Never writes to `events`/`public_shares` directly
// from the browser — mirrors the rate-limited-view (v2.9.18) pattern:
//
//   1. POST { share_id, signature_data_url, signed_by } from share.js
//   2. service_role client calls pcd_submit_event_signature RPC
//      (SECURITY DEFINER, anon/authenticated REVOKEd — only service_role
//      may call it)
//   3. RPC validates: share exists, kind='event', not paused, not already
//      signed → writes signature into the owning `events` row + marks
//      the share as signed (signed_at/signed_by)
//   4. Response 200 { signed: true|false }
//
// DEPLOY:
//   1. supabase login
//   2. supabase link --project-ref <your-project-ref>
//   3. supabase functions deploy submit-event-signature
//   (Alternative: Dashboard → Edge Functions → New → paste this code)
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

    return new Response(JSON.stringify({ signed: data === true }), {
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
