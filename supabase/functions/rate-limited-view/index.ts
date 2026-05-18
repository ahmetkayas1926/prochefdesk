// =============================================================
// ProChefDesk — rate-limited-view Edge Function (v2.9.18)
// =============================================================
// Public Discover feed view counter. Replaces v2.8.46
// increment_recipe_view() RPC which was anon-accessible and spammable.
//
// FLOW:
//   1. POST { recipe_id } from discover.js
//   2. Extract client IP from x-forwarded-for header (Cloudflare/Supabase
//      pass real IP). Fallback to direct connection IP.
//   3. Call pcd_rate_limited_view_bump(ip, recipe_id, 60min) RPC
//      (SECURITY DEFINER, service_role only — anon cannot call directly)
//   4. RPC atomically:
//      - INSERTs (ip, recipe_id, now()) into discover_view_logs
//      - If conflict + viewed_at within 60min → no-op (throttled)
//      - If conflict + viewed_at expired → refresh + bump
//      - On fresh insert OR expired refresh → recipes.view_count++
//      - Returns true if bumped, false if throttled
//   5. Response 200 { bumped: true|false }
//
// DEPLOY:
//   1. supabase login
//   2. supabase link --project-ref <your-project-ref>
//   3. supabase functions deploy rate-limited-view
//   (Alternatif: Dashboard → Edge Functions → New → paste this code)
//
// SECURITY:
//   - No JWT required (anonymous Discover viewers must be able to bump)
//   - service_role key never leaves the server
//   - RPC has REVOKE FROM PUBLIC/anon/authenticated, GRANT TO service_role
//   - Window: 60 minutes per (IP, recipe_id). Adjust via p_window_minutes
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function getClientIp(req: Request): string {
  // Order: CF-Connecting-IP (Cloudflare) → X-Forwarded-For first hop → fallback
  const cf = req.headers.get('cf-connecting-ip')
  if (cf) return cf.trim()
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
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
    const recipeId = (body.recipe_id || '').trim()
    if (!recipeId) {
      return new Response(JSON.stringify({ error: 'recipe_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ip = getClientIp(req)

    // service_role client — only this server-side context can call the
    // SECURITY DEFINER RPC (anon/authenticated were revoked in migration)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await supabase.rpc('pcd_rate_limited_view_bump', {
      p_ip: ip,
      p_recipe_id: recipeId,
      p_window_minutes: 60,
    })

    if (error) {
      // Don't expose internal errors to client (returns 200 with bumped:false
      // so client never knows whether it was throttled or errored — defensive)
      console.error('pcd_rate_limited_view_bump error:', error.message)
      return new Response(JSON.stringify({ bumped: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ bumped: data === true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('rate-limited-view exception:', (e as Error).message)
    return new Response(JSON.stringify({ bumped: false }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
