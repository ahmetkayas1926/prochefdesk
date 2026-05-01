// =============================================================
// ProChefDesk — backup-to-r2 Edge Function (v2)
// =============================================================
// Triggered nightly by pg_cron. Snapshots all user_data rows and
// recipe-photos files to Cloudflare R2.
//
// Auth: caller must send X-Cron-Token header matching BACKUP_CRON_TOKEN
// secret. URL is not enough on its own — public Supabase Functions
// expose the URL but the token gate prevents random access.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Auth gate: require BACKUP_CRON_TOKEN in X-Cron-Token header.
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
      userDataRows: 0,
      userDataBytes: 0,
      photoFiles: 0,
      photoBytes: 0,
      oldBackupsDeleted: 0,
      errors: [] as string[],
    }

    // 1. Snapshot user_data
    try {
      let from = 0
      const pageSize = 1000
      const lines: string[] = []
      while (true) {
        const { data, error } = await admin
          .from('user_data')
          .select('user_id, key, value, updated_at')
          .range(from, from + pageSize - 1)
        if (error) {
          stats.errors.push('user_data fetch: ' + error.message)
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
      stats.userDataRows = lines.length
      stats.userDataBytes = body.length

      const userDataKey = `${today}/user-data.jsonl`
      const putUrl = `${r2Endpoint}/${r2Bucket}/${userDataKey}`
      const putRes = await r2.fetch(putUrl, {
        method: 'PUT',
        body: body,
        headers: { 'Content-Type': 'application/x-ndjson' },
      })
      if (!putRes.ok) {
        stats.errors.push(`user_data upload: ${putRes.status} ${await putRes.text()}`)
      }
    } catch (e) {
      stats.errors.push('user_data exception: ' + (e instanceof Error ? e.message : String(e)))
    }

    // 2. Photo manifest
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

    // 3. Summary
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

    // 4. Delete backups older than 30 days
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