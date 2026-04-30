// =============================================================
// ProChefDesk — delete-account Edge Function
// =============================================================
// Deploys to Supabase as a serverless function. Called by the client
// when a user confirms account deletion. Does the things the anon key
// CAN'T do:
//   1. Delete all files in recipe-photos/{user_id}/ (defensive — RLS
//      should let the client do this, but if it didn't, we clean up here)
//   2. Delete public_shares rows owned by user (same — defensive)
//   3. Delete user_data rows (same — defensive)
//   4. Delete the auth.users row itself (this is the part that REQUIRES
//      service_role and was the bug in v2.6.60)
//
// DEPLOY:
//   1. Install Supabase CLI: brew install supabase/tap/supabase
//   2. cd /path/to/your/project
//   3. supabase login
//   4. supabase link --project-ref <your-project-ref>
//   5. mkdir -p supabase/functions/delete-account
//   6. Copy this file to supabase/functions/delete-account/index.ts
//   7. supabase functions deploy delete-account
//
// SECURITY:
//   - Requires the caller's JWT in the Authorization header
//   - Verifies the JWT to extract the calling user's ID
//   - ONLY deletes data for that user_id (cannot delete other users)
//   - service_role key never leaves the server
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Extract JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const jwt = authHeader.replace('Bearer ', '')

    // Build a Supabase client using the JWT to verify identity
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    // Verify JWT and extract user
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid JWT' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userId = user.id

    // Build service-role client for privileged operations
    const adminClient = createClient(supabaseUrl, serviceKey)

    const errors: string[] = []
    let photosDeleted = 0
    let sharesDeleted = 0
    let userDataDeleted = 0

    // 1. Delete all files in recipe-photos/{userId}/
    try {
      const { data: files, error: listErr } = await adminClient.storage
        .from('recipe-photos')
        .list(userId + '/', { limit: 10000 })
      if (listErr) {
        errors.push('list photos: ' + listErr.message)
      } else if (files && files.length > 0) {
        const paths = files.map(f => userId + '/' + f.name)
        const { data: removed, error: rmErr } = await adminClient.storage
          .from('recipe-photos')
          .remove(paths)
        if (rmErr) {
          errors.push('remove photos: ' + rmErr.message)
        } else {
          photosDeleted = (removed && removed.length) || 0
        }
      }
    } catch (e) {
      errors.push('photos exception: ' + (e instanceof Error ? e.message : String(e)))
    }

    // 2. Delete public_shares
    try {
      const { error: shareErr, count } = await adminClient
        .from('public_shares')
        .delete({ count: 'exact' })
        .eq('owner_id', userId)
      if (shareErr) {
        errors.push('shares: ' + shareErr.message)
      } else {
        sharesDeleted = count || 0
      }
    } catch (e) {
      errors.push('shares exception: ' + (e instanceof Error ? e.message : String(e)))
    }

    // 3. Delete user_data
    try {
      const { error: udErr, count } = await adminClient
        .from('user_data')
        .delete({ count: 'exact' })
        .eq('user_id', userId)
      if (udErr) {
        errors.push('user_data: ' + udErr.message)
      } else {
        userDataDeleted = count || 0
      }
    } catch (e) {
      errors.push('user_data exception: ' + (e instanceof Error ? e.message : String(e)))
    }

    // 4. Delete the auth.users row (THIS is the part that needs service_role)
    let authUserDeleted = false
    try {
      const { error: authErr } = await adminClient.auth.admin.deleteUser(userId)
      if (authErr) {
        errors.push('auth user: ' + authErr.message)
      } else {
        authUserDeleted = true
      }
    } catch (e) {
      errors.push('auth exception: ' + (e instanceof Error ? e.message : String(e)))
    }

    return new Response(JSON.stringify({
      ok: authUserDeleted,
      userId,
      photosDeleted,
      sharesDeleted,
      userDataDeleted,
      authUserDeleted,
      errors,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Unexpected error',
      detail: e instanceof Error ? e.message : String(e),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
