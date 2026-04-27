/* ================================================================
   ProChefDesk — qr.js
   QR helper. Uses api.qrserver.com (free, CORS-enabled) to generate
   QR images. Offline users get a clear error + can still copy the URL.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD || (window.PCD = {});

  function url(text, size) {
    size = size || 400;
    const t = encodeURIComponent(text);
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&margin=10&ecc=M&data=' + t;
  }

  // Convert QR to data URL (for offline-embedding in prints)
  function toDataURL(text, size) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (err) { reject(err); }
      };
      img.onerror = function () { reject(new Error('QR load failed')); };
      img.src = url(text, size);
    });
  }

  function show(opts) {
    opts = opts || {};
    const text = opts.text || '';
    const title = opts.title || 'QR Code';
    const subtitle = opts.subtitle || '';
    if (!text) return;

    const body = PCD.el('div');
    body.innerHTML =
      '<div style="text-align:center;padding:12px 0;">' +
        '<div id="qrImgWrap" style="display:inline-flex;align-items:center;justify-content:center;padding:16px;background:white;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);min-height:300px;min-width:300px;">' +
          '<div class="text-muted">Loading QR...</div>' +
        '</div>' +
        (subtitle ? '<div style="font-weight:600;margin-top:14px;font-size:15px;">' + PCD.escapeHtml(subtitle) + '</div>' : '') +
        '<div class="text-muted text-sm" style="max-width:340px;margin:8px auto 0;word-break:break-all;font-family:var(--font-mono);font-size:11px;">' + PCD.escapeHtml(text) + '</div>' +
      '</div>';

    const closeBtn = PCD.el('button', { class: 'btn btn-secondary', text: PCD.i18n.t('btn_close') });
    const copyBtn = PCD.el('button', { class: 'btn btn-outline' });
    copyBtn.innerHTML = PCD.icon('copy', 14) + ' <span>Copy link</span>';
    const downloadBtn = PCD.el('button', { class: 'btn btn-outline' });
    downloadBtn.innerHTML = PCD.icon('download', 14) + ' <span>PNG</span>';
    const printBtn = PCD.el('button', { class: 'btn btn-primary', style: { flex: '1' } });
    printBtn.innerHTML = PCD.icon('print', 14) + ' <span>Print</span>';
    const footer = PCD.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } });
    footer.appendChild(closeBtn);
    footer.appendChild(copyBtn);
    footer.appendChild(downloadBtn);
    footer.appendChild(printBtn);

    const m = PCD.modal.open({ title: title, body: body, footer: footer, size: 'md', closable: true });

    let dataURL = null;

    const imgWrap = PCD.$('#qrImgWrap', body);
    const img = new Image();
    img.onload = function () {
      imgWrap.innerHTML = '';
      img.style.display = 'block';
      img.style.maxWidth = '280px';
      img.style.width = '100%';
      imgWrap.appendChild(img);
      toDataURL(text, 500).then(function (d) { dataURL = d; }).catch(function () {});
    };
    img.onerror = function () {
      imgWrap.innerHTML = '<div class="text-muted" style="padding:40px;text-align:center;"><div>QR could not load</div><div style="font-size:11px;margin-top:8px;">Check your connection</div></div>';
    };
    img.src = url(text, 400);

    closeBtn.addEventListener('click', function () { m.close(); });

    copyBtn.addEventListener('click', function () {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          PCD.toast.success('Link copied');
        });
      }
    });

    downloadBtn.addEventListener('click', function () {
      if (!dataURL) {
        window.open(url(text, 800), '_blank');
        return;
      }
      const a = document.createElement('a');
      a.href = dataURL;
      a.download = (title || 'qr').replace(/[^a-z0-9]+/gi, '-') + '.png';
      a.click();
    });

    printBtn.addEventListener('click', function () {
      const qrSrc = dataURL || url(text, 800);
      const html =
        '<div style="text-align:center;padding:40px 20px;">' +
          '<h1 style="margin:0 0 8px;font-size:22px;">' + PCD.escapeHtml(title) + '</h1>' +
          (subtitle ? '<div style="font-weight:600;font-size:15px;margin-bottom:8px;">' + PCD.escapeHtml(subtitle) + '</div>' : '') +
          '<div style="color:#666;font-size:12px;margin-bottom:24px;">Scan with your phone camera</div>' +
          '<img src="' + qrSrc + '" style="width:280px;height:280px;">' +
          '<div style="margin-top:20px;color:#888;font-size:10px;word-break:break-all;max-width:400px;margin-left:auto;margin-right:auto;">' + PCD.escapeHtml(text) + '</div>' +
        '</div>';
      PCD.print(html, title);
    });
  }

  PCD.qr = { url: url, toDataURL: toDataURL, show: show };
})();
