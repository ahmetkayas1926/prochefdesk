// =============================================================
// ProChefDesk — backup-to-r2 Edge Function (v3)
// =============================================================
// Triggered nightly by pg_cron. Snapshots all per-table data and
// recipe-photos manifest to Cloudflare R2.
//
// CHANGES vs v2 (2026-05)
// - v2 read from `user_data` (legacy blob table, DROPPED in v2.6.87).
//   Result: v2 silently produced empty backups for ~6 months.
// - v3 reads from the 21 per-table tables that replaced user_data.
//   Each table is written to its own JSONL file under the date prefix.
//
// AUTH
//   Caller must send X-Cron-Token header matching BACKUP_CRON_TOKEN secret.
//
// R2 LAYOUT
//   <bucket>/<YYYY-MM-DD>/
//     workspaces.jsonl
//     workspace_tombstones.jsonl
//     user_prefs.jsonl
//     public_shares.jsonl
//     subscriptions.jsonl
//     recipes.jsonl
//     ingredients.jsonl
//     menus.jsonl
//     events.jsonl
//     suppliers.jsonl
//     canvases.jsonl
//     shopping_lists.jsonl
//     checklist_templates.jsonl
//     inventory.jsonl
//     waste.jsonl
//     checklist_sessions.jsonl
//     stock_count_history.jsonl
//     haccp_logs.jsonl
//     haccp_units.jsonl
//     haccp_readings.jsonl
//     haccp_cook_cool.jsonl
//     photos-manifest.json
//     summary.json
//
//   client_errors is intentionally skipped — it is debug-only data.
//
// 30-day retention: backups older than 30 days are deleted on next run.
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// All tables we want in the backup. client_errors is excluded by design.
const BACKUP_TABLES = [
  // Top-level (5)
  'workspaces',
  'workspace_tombstones',
  'user_prefs',
  'public_shares',
  'subscriptions',
  // Workspace-scoped (18 — v2.8.79 fix: haccp_receiving + haccp_holding added)
  'recipes',
  'ingredients',
  'menus',
  'events',
  'suppliers',
  'canvases',
  'shopping_lists',
  'checklist_templates',
  'inventory',
  'waste',
  'checklist_sessions',
  'stock_count_history',
  'haccp_logs',
  'haccp_units',
  'haccp_readings',
  'haccp_cook_cool',
  // v2.8.79 — Eksiklik düzeltildi: v2.8.44'te eklenmiş ama burada unutulmuş
  // iki HACCP tablosu. Cloud sync oluyorlardı ama nightly R2 archive'da yoktu.
  'haccp_receiving',
  'haccp_holding',
  // v2.9.17 — Buffet Planner + Mise en Place + Team cloud sync (3 yeni tablo)
  'buffets',
  'mise_plans',
  'team',
  // v2.9.24 — recipe_likes was missing from backup (audit finding).
  // Discover Phase 2 like data; not catastrophic if lost but should be
  // in nightly archive for completeness.
  'recipe_likes',
  // v2.9.42 — Kitchen Whiteboard cloud sync
  'whiteboards',
  // v2.15.3 — Roster cloud sync
  'rosters',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Auth gate
  const expectedToken = Deno.env.get('BACKUP_CRON_TOKEN')
  const sentToken = req.headers.get('X-Cron-Token')
  if (!expectedToken || sentToken !== expectedToken) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const r2AccessKey = Deno.env.get('R2_ACCESS_KEY_ID')!
    const r2SecretKey = Deno.env.get('R2_SECRET_ACCESS_KEY')!
    const r2Endpoint = Deno.env.get('R2_ENDPOINT')!
    const r2Bucket = Deno.env.get('R2_BUCKET_NAME')!

    const admin = createClient(supabaseUrl, serviceKey)
    const r2 = new AwsClient({
      accessKeyId: r2AccessKey,
      secretAccessKey: r2SecretKey,
      service: 's3',
      region: 'auto',
    })

    const today = new Date().toISOString().slice(0, 10)
    const stats = {
      date: today,
      version: 'v3',
      tables: {} as Record<string, { rows: number; bytes: number; ok: boolean }>,
      photoFiles: 0,
      photoBytes: 0,
      oldBackupsDeleted: 0,
      errors: [] as string[],
    }

    // ----------------------------------------------------------------
    // 1. Snapshot each per-table table
    // ----------------------------------------------------------------
    for (const table of BACKUP_TABLES) {
      const tableStats = { rows: 0, bytes: 0, ok: false }
      try {
        let from = 0
        const pageSize = 1000
        const lines: string[] = []
        while (true) {
          const { data, error } = await admin
            .from(table)
            .select('*')
            .range(from, from + pageSize - 1)
          if (error) {
            stats.errors.push(`${table} fetch: ${error.message}`)
            break
          }
          if (!data || data.length === 0) break
          for (const row of data) {
            lines.push(JSON.stringify(row))
          }
          if (data.length < pageSize) break
          from += pageSize
        }
        const jsonl = lines.join('\n')
        const body = new TextEncoder().encode(jsonl)
        tableStats.rows = lines.length
        tableStats.bytes = body.length

        const key = `${today}/${table}.jsonl`
        const putUrl = `${r2Endpoint}/${r2Bucket}/${key}`
        const putRes = await r2.fetch(putUrl, {
          method: 'PUT',
          body: body,
          headers: { 'Content-Type': 'application/x-ndjson' },
        })
        if (putRes.ok) {
          tableStats.ok = true
        } else {
          stats.errors.push(`${table} upload: ${putRes.status} ${await putRes.text()}`)
        }
      } catch (e) {
        stats.errors.push(`${table} exception: ${e instanceof Error ? e.message : String(e)}`)
      }
      stats.tables[table] = tableStats
    }

    // ----------------------------------------------------------------
    // 2. Photo manifest (file list, not the photo bytes themselves)
    // ----------------------------------------------------------------
    try {
      const allEntries: { path: string; size: number; updated_at?: string }[] = []
      const { data: rootList, error: rootErr } = await admin.storage
        .from('recipe-photos')
        .list('', { limit: 10000 })
      if (rootErr) {
        stats.errors.push('photo root list: ' + rootErr.message)
      } else if (rootList) {
        for (const entry of rootList) {
          if (entry.id === null || !entry.metadata) {
            const { data: files, error: fileErr } = await admin.storage
              .from('recipe-photos')
              .list(entry.name, { limit: 10000 })
            if (fileErr) {
              stats.errors.push(`photo list ${entry.name}: ${fileErr.message}`)
              continue
            }
            if (files) {
              for (const f of files) {
                if (f.metadata) {
                  allEntries.push({
                    path: `${entry.name}/${f.name}`,
                    size: f.metadata.size || 0,
                    updated_at: f.updated_at,
                  })
                }
              }
            }
          }
        }
      }
      stats.photoFiles = allEntries.length
      stats.photoBytes = allEntries.reduce((sum, e) => sum + e.size, 0)

      const manifest = {
        generatedAt: new Date().toISOString(),
        bucket: 'recipe-photos',
        files: allEntries,
      }
      const manifestBody = new TextEncoder().encode(JSON.stringify(manifest, null, 2))
      const manifestKey = `${today}/photos-manifest.json`
      const putUrl = `${r2Endpoint}/${r2Bucket}/${manifestKey}`
      const putRes = await r2.fetch(putUrl, {
        method: 'PUT',
        body: manifestBody,
        headers: { 'Content-Type': 'application/json' },
      })
      if (!putRes.ok) {
        stats.errors.push(`manifest upload: ${putRes.status} ${await putRes.text()}`)
      }
    } catch (e) {
      stats.errors.push('photos exception: ' + (e instanceof Error ? e.message : String(e)))
    }

    // ----------------------------------------------------------------
    // 3. Summary.json (per-table row counts + bytes + errors)
    // ----------------------------------------------------------------
    try {
      const summaryKey = `${today}/summary.json`
      const summaryBody = new TextEncoder().encode(JSON.stringify(stats, null, 2))
      const putUrl = `${r2Endpoint}/${r2Bucket}/${summaryKey}`
      await r2.fetch(putUrl, {
        method: 'PUT',
        body: summaryBody,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (e) {
      stats.errors.push('summary upload: ' + (e instanceof Error ? e.message : String(e)))
    }

    // ----------------------------------------------------------------
    // 4. Delete backups older than 30 days
    // ----------------------------------------------------------------
    try {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)
      const cutoffStr = cutoff.toISOString().slice(0, 10)

      const listUrl = `${r2Endpoint}/${r2Bucket}/?list-type=2&delimiter=/`
      const listRes = await r2.fetch(listUrl)
      if (listRes.ok) {
        const xml = await listRes.text()
        const prefixRe = /<Prefix>([^<]+)<\/Prefix>/g
        const prefixes: string[] = []
        let m
        while ((m = prefixRe.exec(xml)) !== null) {
          prefixes.push(m[1].replace(/\/$/, ''))
        }

        for (const prefix of prefixes) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(prefix) && prefix < cutoffStr) {
            const objListUrl = `${r2Endpoint}/${r2Bucket}/?list-type=2&prefix=${encodeURIComponent(prefix + '/')}`
            const objListRes = await r2.fetch(objListUrl)
            if (!objListRes.ok) continue
            const objXml = await objListRes.text()
            const keyRe = /<Key>([^<]+)<\/Key>/g
            let km
            while ((km = keyRe.exec(objXml)) !== null) {
              const delUrl = `${r2Endpoint}/${r2Bucket}/${km[1]}`
              const delRes = await r2.fetch(delUrl, { method: 'DELETE' })
              if (delRes.ok) stats.oldBackupsDeleted++
            }
          }
        }
      }
    } catch (e) {
      stats.errors.push('cleanup exception: ' + (e instanceof Error ? e.message : String(e)))
    }

    return new Response(JSON.stringify(stats, null, 2), {
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
