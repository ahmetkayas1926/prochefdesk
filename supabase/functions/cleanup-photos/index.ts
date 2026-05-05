// =============================================================
// ProChefDesk — cleanup-photos Edge Function (v2.6.97)
// =============================================================
// Recipe silindiğinde foto Supabase Storage'da kalıyor (orphan).
// Bu function tüm Storage'ı tarar, hiçbir recipe'in `data->>'photo'`
// referansında olmayan foto'ları siler.
//
// DEPLOY:
//   1. supabase login
//   2. supabase link --project-ref muuwhrcogikpqylsfvgg
//   3. supabase functions deploy cleanup-photos --no-verify-jwt
//
// Not: --no-verify-jwt çünkü scheduled cron'dan çağrılacak (JWT yok).
// Onun yerine kendi internal secret kontrolü yapıyoruz.
//
// TETİKLEME:
//   A) Manuel (test):
//      curl -X POST \
//        -H "x-cleanup-secret: $CLEANUP_SECRET" \
//        https://muuwhrcogikpqylsfvgg.supabase.co/functions/v1/cleanup-photos
//
//   B) Otomatik schedule (Supabase Dashboard):
//      Edge Functions → cleanup-photos → Add cron schedule
//      Cron: 0 4 * * 0   (her Pazar 04:00 UTC, haftalık)
//      Header: x-cleanup-secret: <secret>
//
// SECRET:
//   Supabase Dashboard → Edge Functions → cleanup-photos → Secrets:
//   - CLEANUP_SECRET = (rastgele uzun string, sen oluştur)
//   - SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY otomatik enjekte edilir.
//
// ALGORİTMA:
//   1. recipes tablosundan tüm photo URL'lerini al → "{user_id}/{filename}"
//      formatına parse et → Set yap (canlı referanslar)
//   2. recipe-photos bucket'ından tüm dosyaları listele (paginated)
//   3. Set'te olmayan her dosyayı sil
//   4. Audit log: kaç dosya silindi, ne kadar yer kazanıldı
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cleanup-secret',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const BUCKET = 'recipe-photos'
const PAGE_SIZE = 1000

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Internal secret kontrolü — yetkisiz çağrıyı engelle
  const expectedSecret = Deno.env.get('CLEANUP_SECRET')
  const providedSecret = req.headers.get('x-cleanup-secret')
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    // ============================================================
    // 1) Canlı referansları topla (recipes.data.photo URL'leri)
    // ============================================================
    // recipes tablosundaki tüm photo URL'lerini batch'lerle çek
    const referencedPaths = new Set<string>()
    let offset = 0
    while (true) {
      const { data, error } = await supabase
        .from('recipes')
        .select('data')
        .range(offset, offset + 999)
      if (error) throw error
      if (!data || data.length === 0) break
      for (const row of data) {
        const photo = row.data?.photo
        if (typeof photo !== 'string') continue
        // URL'den path çıkar: ".../recipe-photos/<user_id>/<filename>"
        const m = photo.match(/recipe-photos\/(.+)$/)
        if (m && m[1]) referencedPaths.add(decodeURIComponent(m[1]))
      }
      if (data.length < 1000) break
      offset += 1000
    }

    // ============================================================
    // 2) Storage'da tüm dosyaları listele (kullanıcı klasörlerinde)
    // ============================================================
    const allFiles: { name: string; size: number; userId: string }[] = []

    // Önce top-level: her user_id bir klasör
    const { data: userFolders, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list('', { limit: PAGE_SIZE })
    if (listErr) throw listErr

    for (const folder of userFolders || []) {
      // Klasör mü dosya mı? Storage list'te sadece adı geliyor; içeriğini list'leyince
      // dosyaysa boş döner, klasörse dosyaları listeler.
      const { data: filesInFolder, error: filesErr } = await supabase.storage
        .from(BUCKET)
        .list(folder.name, { limit: PAGE_SIZE })
      if (filesErr) {
        console.warn(`list ${folder.name} failed:`, filesErr.message)
        continue
      }
      for (const f of filesInFolder || []) {
        // Klasör değil dosya ise (id field dolu olur)
        if (f.name && !f.name.endsWith('/')) {
          allFiles.push({
            name: f.name,
            size: f.metadata?.size || 0,
            userId: folder.name,
          })
        }
      }
    }

    // ============================================================
    // 3) Orphan tespit + sil
    // ============================================================
    const orphans: string[] = []
    let bytesFreed = 0
    for (const f of allFiles) {
      const fullPath = `${f.userId}/${f.name}`
      if (!referencedPaths.has(fullPath)) {
        orphans.push(fullPath)
        bytesFreed += f.size
      }
    }

    let deleted = 0
    if (orphans.length > 0) {
      // Batch delete (Storage API max 1000 per call)
      const BATCH = 1000
      for (let i = 0; i < orphans.length; i += BATCH) {
        const batch = orphans.slice(i, i + BATCH)
        const { error: delErr } = await supabase.storage.from(BUCKET).remove(batch)
        if (delErr) {
          console.warn('batch delete failed:', delErr.message)
        } else {
          deleted += batch.length
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned_files: allFiles.length,
        referenced: referencedPaths.size,
        orphans_found: orphans.length,
        deleted: deleted,
        bytes_freed: bytesFreed,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('cleanup-photos error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
