/* ================================================================
   ProChefDesk — photo-storage.js
   Compresses photo dataURLs and uploads them to Supabase Storage.

   Architecture (v2.5.9):
   - Input: a base64 dataURL (from cropper output or paste)
   - Step 1: re-encode as WebP @ quality 0.82 (smaller than JPEG)
   - Step 2: upload the WebP blob to the 'recipe-photos' bucket
   - Step 3: return the public URL
   - The recipe row stores ONLY the URL string (~100 bytes) instead of
     the base64 dataURL (~6-8 MB), keeping the database lean.
   - Bucket is public, so URLs are directly viewable without auth.
   - Each photo gets a unique filename: {userId}/{timestamp}-{random}.webp

   Backward compatibility:
   - Old recipes with base64 photos still render (the <img src="..."> tag
     accepts both dataURLs and URLs). No migration needed; old photos
     just stay where they are until edited.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;
  const BUCKET = 'recipe-photos';
  const QUALITY = 0.82;
  // No re-encoding work needed if input is already small (<200 KB).
  const SKIP_REENCODE_THRESHOLD = 200 * 1024;

  // Convert a dataURL (data:image/...;base64,...) into a Blob.
  function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const meta = parts[0];
    const b64 = parts[1] || '';
    const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(b64);
    const len = bin.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // Re-encode a dataURL as WebP via canvas. Falls back to JPEG if the
  // browser can't write WebP (rare — Safari iOS 14+ supports it).
  function reencodeAsWebP(dataUrl) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0);
          // Try WebP first, fall back to JPEG if browser refuses.
          canvas.toBlob(function (blob) {
            if (blob && blob.size > 0) return resolve(blob);
            canvas.toBlob(function (jpegBlob) {
              if (jpegBlob) resolve(jpegBlob);
              else reject(new Error('Canvas encoding failed'));
            }, 'image/jpeg', QUALITY);
          }, 'image/webp', QUALITY);
        } catch (e) { reject(e); }
      };
      img.onerror = function () { reject(new Error('Image load failed')); };
      img.src = dataUrl;
    });
  }

  // Build a unique filename for a user.
  function makeFilename(userId, ext) {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    return userId + '/' + ts + '-' + rand + '.' + ext;
  }

  // Main entry point. Takes a dataURL, returns Promise<publicUrl>.
  // If anything fails (no auth, no cloud, network error), resolves
  // with the original dataURL so the caller still gets a usable photo.
  function uploadPhotoFromDataUrl(dataUrl) {
    return new Promise(function (resolve) {
      // No data → no upload.
      if (!dataUrl || typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0) {
        return resolve(dataUrl);
      }

      const supabase = window._supabaseClient;
      const user = PCD.store && PCD.store.get('user');
      if (!supabase || !user || !user.id) {
        // Offline / signed-out fallback — keep behaviour identical to v2.5.8.
        PCD.log && PCD.log('photo-storage: no cloud, keeping dataURL');
        return resolve(dataUrl);
      }

      // If the dataURL is already small, skip the WebP step.
      const initialBlob = dataUrlToBlob(dataUrl);
      const needReencode = initialBlob.size > SKIP_REENCODE_THRESHOLD;

      const blobPromise = needReencode
        ? reencodeAsWebP(dataUrl)
        : Promise.resolve(initialBlob);

      blobPromise.then(function (blob) {
        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
        const filename = makeFilename(user.id, ext);
        return supabase.storage.from(BUCKET).upload(filename, blob, {
          contentType: blob.type,
          cacheControl: '31536000',
          upsert: false,
        }).then(function (res) {
          if (res.error) throw res.error;
          const pub = supabase.storage.from(BUCKET).getPublicUrl(filename);
          const url = pub && pub.data && pub.data.publicUrl;
          if (!url) throw new Error('Public URL missing');
          PCD.log && PCD.log('photo-storage: uploaded', filename, blob.size + ' bytes');
          resolve(url);
        });
      }).catch(function (err) {
        PCD.err && PCD.err('photo-storage: upload failed, keeping dataURL', err);
        resolve(dataUrl); // graceful fallback — old behaviour preserved
      });
    });
  }

  PCD.photoStorage = {
    upload: uploadPhotoFromDataUrl,
  };
})();
