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
    // v2.44.169 — Ayrıca hangi user_id'lerin bulutta HİÇ tarifi olduğunu kaydet
    // (aşağıdaki free-plan koruması için).
    const referencedPaths = new Set<string>()
    const usersWithRecipes = new Set<string>()
    let offset = 0
    while (true) {
      const { data, error } = await supabase
        .from('recipes')
        .select('user_id,data')
        .range(offset, offset + 999)
      if (error) throw error
      if (!data || data.length === 0) break
      for (const row of data) {
        if (row.user_id) usersWithRecipes.add(row.user_id)
        const photo = row.data?.photo
        if (typeof photo !== 'string') continue
        // URL'den path çıkar: ".../recipe-photos/<user_id>/<filename>"
        const m = photo.match(/recipe-photos\/(.+)$/)
        if (m && m[1]) referencedPaths.add(decodeURIComponent(m[1]))
      }
      if (data.length < 1000) break
      offset += 1000
    }

    // v2.44.169 — Paylaşılan sayfa snapshot'larındaki fotoğraflar da CANLI
    // referanstır. public_shares.payload.photo bir tarif silinse bile o linki
    // açan müşteriye gösterilir; eskiden bu foto orphan sayılıp siliniyordu →
    // paylaşılan teklif/tarif sayfasında kırık görsel.
    let shareOffset = 0
    while (true) {
      const { data, error } = await supabase
        .from('public_shares')
        .select('payload')
        .range(shareOffset, shareOffset + 999)
      if (error) break  // best-effort: share okunamazsa temizliği durdurma
      if (!data || data.length === 0) break
      for (const row of data) {
        const photo = (row as { payload?: { photo?: unknown } }).payload?.photo
        if (typeof photo !== 'string') continue
        const m = photo.match(/recipe-photos\/(.+)$/)
        if (m && m[1]) referencedPaths.add(decodeURIComponent(m[1]))
      }
      if (data.length < 1000) break
      shareOffset += 1000
    }

    // ============================================================
    // 2) Storage'da tüm dosyaları listele (kullanıcı klasörlerinde)
    // ============================================================
    // v2.44.169 — updatedAt eklendi (yaş koruması için)
    const allFiles: { name: string; size: number; userId: string; updatedAt?: string }[] = []

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
            updatedAt: f.updated_at || f.created_at,
          })
        }
      }
    }

    // ============================================================
    // 3) Orphan tespit + sil
    // ============================================================
    // v2.44.169 — İKİ KORUMA (denetim bulgusu):
    //
    // (a) FREE PLAN: free kullanıcıda bulut push kapalıdır (plans.js cloudSync:false),
    //     yani tarif satırı buluta HİÇ gitmez — ama fotoğraf Storage'a yüklenir.
    //     Eski mantık o kullanıcının TÜM fotoğraflarını "sahipsiz" sayıp siliyordu →
    //     kullanıcının uygulamasında kalıcı kırık görsel. Artık: bulutta hiç tarifi
    //     olmayan kullanıcının klasörüne dokunulmaz. (Gerçekten terk edilmiş klasörler
    //     hesap silmede zaten delete-account tarafından temizleniyor.)
    //
    // (b) YAŞ KORUMASI: 7 günden yeni dosyalar asla silinmez. Fotoğraf yüklemesi ile
    //     tarif kaydının buluta ulaşması arasında (yavaş bağlantı, offline mutfak,
    //     kaydetmeden bırakılan editör) pencere vardır; cron o pencereye denk gelirse
    //     canlı fotoğrafı siliyordu.
    const PROTECT_NEW_MS = 7 * 24 * 60 * 60 * 1000
    const nowMs = Date.now()
    const orphans: string[] = []
    let bytesFreed = 0
    let skippedNoCloudRecipes = 0
    let skippedTooNew = 0
    for (const f of allFiles) {
      const fullPath = `${f.userId}/${f.name}`
      if (referencedPaths.has(fullPath)) continue
      if (!usersWithRecipes.has(f.userId)) { skippedNoCloudRecipes++; continue }
      if (f.updatedAt && (nowMs - new Date(f.updatedAt).getTime()) < PROTECT_NEW_MS) { skippedTooNew++; continue }
      orphans.push(fullPath)
      bytesFreed += f.size
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
        // v2.44.169 — koruma sayaçları (silinmeyenler)
        skipped_no_cloud_recipes: skippedNoCloudRecipes,
        skipped_too_new: skippedTooNew,
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
