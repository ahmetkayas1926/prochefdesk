/* ================================================================
   ProChefDesk — menu_studio.js  (v2.18 PROTOTYPE / beta)
   ----------------------------------------------------------------
   Blok-kanvas menü tasarımcısı PROTOTİPİ. Mevcut "Menus" aracından
   bağımsız; onu BOZMAZ. Amaç: yeni paradigmayı (gerçek A4 kanvas =
   çıktı, serbest font/renk/yerleşim, yemek fotoğrafı, blok sıralama,
   şablon) değerlendirmek.

   Tek render motoru: renderPageInner() hem kanvas önizlemesini hem
   yazdırmayı üretir → WYSIWYG. Kalıcılık: localStorage (prototip;
   tek tasarım). Tam sürümde bulut + çoklu menü + reçete-maliyet
   zekâsı eklenecek.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD || (window.PCD = {});
  const LS_KEY = 'pcd_menustudio_v0';

  // ---- Küratörlü fontlar (Google Fonts) ----
  const FONTS = [
    { label: 'Cormorant', css: '"Cormorant Garamond", Georgia, serif' },
    { label: 'Playfair', css: '"Playfair Display", Georgia, serif' },
    { label: 'EB Garamond', css: '"EB Garamond", Georgia, serif' },
    { label: 'Lora', css: '"Lora", Georgia, serif' },
    { label: 'Italiana', css: '"Italiana", Georgia, serif' },
    { label: 'Inter', css: '"Inter", -apple-system, sans-serif' },
    { label: 'Montserrat', css: '"Montserrat", sans-serif' },
    { label: 'Poppins', css: '"Poppins", sans-serif' },
    { label: 'Oswald', css: '"Oswald", sans-serif' },
    { label: 'Bebas Neue', css: '"Bebas Neue", sans-serif' },
    { label: 'Caveat', css: '"Caveat", cursive' },
    { label: 'Nunito', css: '"Nunito", sans-serif' },
  ];
  const GF_HREF = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Caveat:wght@400;600&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=EB+Garamond&family=Italiana&family=Lora:ital@0;1&family=Montserrat:wght@400;600;700&family=Nunito:wght@400;700&family=Oswald:wght@400;600&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Poppins:wght@400;600;700&display=swap';
  function ensureFonts(doc) {
    doc = doc || document;
    if (doc.getElementById('pcd-ms-fonts')) return;
    const l = doc.createElement('link');
    l.id = 'pcd-ms-fonts'; l.rel = 'stylesheet'; l.href = GF_HREF;
    doc.head.appendChild(l);
  }
  function fontCss(label) {
    const f = FONTS.find(function (x) { return x.label === label; });
    return f ? f.css : FONTS[0].css;
  }

  const PAGE = { portrait: { w: 794, h: 1123 }, landscape: { w: 1123, h: 794 } };
  function uid() { return PCD.uid ? PCD.uid('b') : 'b' + Math.random().toString(36).slice(2); }
  function cur() { return (PCD.currencySymbol && PCD.currencySymbol()) || '$'; }
  function esc(s) { return PCD.escapeHtml(String(s == null ? '' : s)); }

  // ---- Demo şablon ----
  function templateDesign() {
    return {
      page: { size: 'portrait', bg: '#fffaf5', ink: '#1a1a1a', accent: '#c5a572', baseFont: 'Cormorant', pad: 56 },
      blocks: [
        { id: uid(), type: 'heading', text: 'NAZZAR', font: 'Italiana', size: 46, weight: 400, align: 'center', color: '', spacing: 8 },
        { id: uid(), type: 'text', text: 'Levantine kitchen · Perth', font: 'Montserrat', size: 12, align: 'center', color: '', tracking: 4, upper: true },
        { id: uid(), type: 'divider', variant: 'ornament', color: '' },
        { id: uid(), type: 'section', title: 'To Start', titleFont: 'Cormorant', titleSize: 24, items: [
          { id: uid(), name: 'Hummus, crispy chickpeas, flatbread', price: '14', desc: 'Slow-cooked chickpeas, lemon, Aleppo oil', photo: null },
          { id: uid(), name: 'Smoked baba ganoush', price: '13', desc: 'Charred eggplant, tahini, pomegranate', photo: null },
        ] },
        { id: uid(), type: 'section', title: 'Mains', titleFont: 'Cormorant', titleSize: 24, items: [
          { id: uid(), name: 'Beyti Kebab', price: '29', desc: 'Pastry shell, lamb mince, Aleppo butter, smoked labneh', photo: null },
          { id: uid(), name: 'Lamb Shank, Yellow Rice', price: '34', desc: 'Eight-hour shank, saffron rice, crispy shallots', photo: null },
        ] },
        { id: uid(), type: 'text', text: 'A discretionary 10% surcharge applies on public holidays.', font: 'Montserrat', size: 9, align: 'center', color: '#888', tracking: 1, upper: false },
      ],
    };
  }

  let design = null, selectedId = null, viewportEl = null, pageScaleEl = null, inspectorEl = null;

  function load() {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    return templateDesign();
  }
  function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(design)); } catch (e) {} }

  function findBlock(id) { return (design.blocks || []).find(function (b) { return b.id === id; }); }

  // ================= RENDER PAGE (kanvas + print TEK motor) =================
  function blockInnerHTML(b, page) {
    const ink = page.ink || '#111';
    const accent = page.accent || '#c5a572';
    if (b.type === 'heading') {
      return '<div style="font-family:' + fontCss(b.font || page.baseFont) + ';font-size:' + (b.size || 40) + 'px;font-weight:' + (b.weight || 400) + ';text-align:' + (b.align || 'center') + ';color:' + (b.color || ink) + ';letter-spacing:' + (b.spacing || 0) + 'px;line-height:1.1;margin:0;">' + esc(b.text) + '</div>';
    }
    if (b.type === 'text') {
      return '<div style="font-family:' + fontCss(b.font || page.baseFont) + ';font-size:' + (b.size || 13) + 'px;text-align:' + (b.align || 'center') + ';color:' + (b.color || ink) + ';letter-spacing:' + (b.tracking || 0) + 'px;' + (b.upper ? 'text-transform:uppercase;' : '') + 'line-height:1.5;white-space:pre-wrap;margin:0;">' + esc(b.text) + '</div>';
    }
    if (b.type === 'divider') {
      if (b.variant === 'ornament') {
        return '<div style="text-align:center;color:' + (b.color || accent) + ';font-size:20px;letter-spacing:6px;line-height:1;">&#10086;</div>';
      }
      return '<div style="height:1px;background:' + (b.color || accent) + ';width:100%;"></div>';
    }
    if (b.type === 'image') {
      if (!b.src) return '<div style="text-align:center;color:#bbb;font-size:12px;border:1px dashed #ccc;padding:24px;">Görsel ekle</div>';
      return '<div style="text-align:' + (b.align || 'center') + ';"><img src="' + b.src + '" style="max-width:100%;height:' + (b.height || 200) + 'px;object-fit:cover;border-radius:' + (b.radius || 0) + 'px;">';
    }
    if (b.type === 'section') {
      let h = '<div style="font-family:' + fontCss(b.titleFont || page.baseFont) + ';font-size:' + (b.titleSize || 24) + 'px;font-weight:' + (b.titleWeight || 600) + ';color:' + (b.titleColor || accent) + ';text-align:' + (b.titleAlign || 'left') + ';letter-spacing:' + (b.titleSpacing || 0) + 'px;margin:0 0 10px;border-bottom:1px solid ' + (b.rule ? accent : 'transparent') + ';padding-bottom:6px;">' + esc(b.title) + '</div>';
      (b.items || []).forEach(function (it) {
        const showPhoto = !!it.photo;
        h += '<div style="display:flex;gap:12px;margin-bottom:12px;align-items:flex-start;">';
        if (showPhoto) h += '<img src="' + it.photo + '" style="width:56px;height:56px;object-fit:cover;border-radius:8px;flex-shrink:0;">';
        h += '<div style="flex:1;min-width:0;">';
        h += '<div style="display:flex;align-items:baseline;gap:8px;">';
        h += '<span style="font-family:' + fontCss(b.itemFont || page.baseFont) + ';font-size:' + (b.itemSize || 15) + 'px;font-weight:600;color:' + (page.ink || ink) + ';">' + esc(it.name) + '</span>';
        h += '<span style="flex:1;border-bottom:1px dotted ' + (page.ink || ink) + '40;margin:0 4px;transform:translateY(-3px);"></span>';
        if (it.price !== '' && it.price != null) h += '<span style="font-family:' + fontCss(b.itemFont || page.baseFont) + ';font-size:' + (b.itemSize || 15) + 'px;font-weight:600;color:' + (page.ink || ink) + ';">' + esc(cur() + it.price) + '</span>';
        h += '</div>';
        if (it.desc) h += '<div style="font-family:' + fontCss(b.itemFont || page.baseFont) + ';font-size:' + ((b.itemSize || 15) - 3) + 'px;color:' + (page.ink || ink) + '99;font-style:italic;margin-top:2px;line-height:1.4;">' + esc(it.desc) + '</div>';
        h += '</div></div>';
      });
      return h;
    }
    if (b.type === 'spacer') return '<div style="height:' + (b.height || 24) + 'px;"></div>';
    return '';
  }

  function renderPageInner(d) {
    const page = d.page;
    return (d.blocks || []).map(function (b) {
      return '<div class="ms-block" data-bid="' + b.id + '" style="margin-bottom:' + (b.type === 'spacer' ? 0 : 18) + 'px;">' + blockInnerHTML(b, page) + '</div>';
    }).join('');
  }

  // ================= KANVAS ÖLÇEK =================
  function applyScale() {
    if (!viewportEl || !pageScaleEl) return;
    const spec = PAGE[design.page.size] || PAGE.portrait;
    const avail = viewportEl.clientWidth - 32;
    if (avail <= 0) { requestAnimationFrame(applyScale); return; }
    const scale = Math.min(1, avail / spec.w);
    pageScaleEl.style.transform = 'scale(' + scale + ')';
    pageScaleEl.style.transformOrigin = 'top center';
    // viewport yüksekliğini ölçekli sayfaya göre ayarla
    viewportEl.style.height = (spec.h * scale + 40) + 'px';
  }

  function refreshPage() {
    if (!pageScaleEl) return;
    const spec = PAGE[design.page.size] || PAGE.portrait;
    pageScaleEl.style.width = spec.w + 'px';
    pageScaleEl.style.minHeight = spec.h + 'px';
    pageScaleEl.style.background = design.page.bg || '#fff';
    pageScaleEl.style.padding = (design.page.pad || 56) + 'px';
    pageScaleEl.innerHTML = renderPageInner(design);
    // seçili bloğu vurgula
    if (selectedId) {
      const sel = pageScaleEl.querySelector('[data-bid="' + selectedId + '"]');
      if (sel) sel.style.outline = '2px solid var(--brand-500,#22c55e)';
    }
    applyScale();
    persist();
  }

  // ================= INSPECTOR =================
  function styleRow(label, html) {
    return '<div style="margin-bottom:10px;"><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">' + esc(label) + '</div>' + html + '</div>';
  }
  function fontSelect(attr, val) {
    return '<select class="select" data-f="' + attr + '" style="width:100%;">' + FONTS.map(function (f) {
      return '<option value="' + f.label + '"' + (val === f.label ? ' selected' : '') + '>' + f.label + '</option>';
    }).join('') + '</select>';
  }
  function numInput(attr, val, min, max) {
    return '<input type="number" class="input" data-f="' + attr + '" value="' + (val == null ? '' : val) + '" min="' + (min || 0) + '" max="' + (max || 999) + '" style="width:100%;">';
  }
  function colorInput(attr, val, fallback) {
    return '<input type="color" data-f="' + attr + '" value="' + (val || fallback || '#111111') + '" style="width:46px;height:32px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:none;"> <button type="button" class="btn btn-ghost btn-sm" data-clear="' + attr + '">Tema</button>';
  }
  function alignBtns(attr, val) {
    return ['left', 'center', 'right'].map(function (a) {
      return '<button type="button" class="btn btn-sm ' + (val === a ? 'btn-primary' : 'btn-outline') + '" data-align="' + attr + '|' + a + '">' + (a === 'left' ? '⟸' : a === 'center' ? '≡' : '⟹') + '</button>';
    }).join(' ');
  }

  function renderInspector() {
    if (!inspectorEl) return;
    const b = selectedId ? findBlock(selectedId) : null;
    let h = '';

    // GLOBAL
    h += '<div style="font-weight:700;font-size:13px;margin:0 0 8px;">🎨 Sayfa</div>';
    h += styleRow('Temel font', fontSelect('page.baseFont', design.page.baseFont));
    h += styleRow('Vurgu rengi', colorInput('page.accent', design.page.accent, '#c5a572'));
    h += styleRow('Metin rengi', colorInput('page.ink', design.page.ink, '#111111'));
    h += styleRow('Arka plan', colorInput('page.bg', design.page.bg, '#ffffff'));
    h += styleRow('Kenar boşluğu', numInput('page.pad', design.page.pad, 16, 120));
    h += styleRow('Yön', '<button type="button" class="btn btn-sm ' + (design.page.size === 'portrait' ? 'btn-primary' : 'btn-outline') + '" data-size="portrait">Dikey</button> <button type="button" class="btn btn-sm ' + (design.page.size === 'landscape' ? 'btn-primary' : 'btn-outline') + '" data-size="landscape">Yatay</button>');

    h += '<hr style="border:0;border-top:1px solid var(--border);margin:14px 0;">';

    if (!b) {
      h += '<div class="text-muted text-sm">Düzenlemek için kanvasta bir bloğa dokun.</div>';
      inspectorEl.innerHTML = h;
      wireInspector();
      return;
    }

    // SEÇİLİ BLOK
    const typeLabel = { heading: 'Başlık', text: 'Metin', section: 'Bölüm', image: 'Görsel', divider: 'Ayraç', spacer: 'Boşluk' };
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
      '<div style="font-weight:700;font-size:13px;">✏️ ' + (typeLabel[b.type] || b.type) + '</div>' +
      '<div style="display:flex;gap:4px;">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-move="up" title="Yukarı">↑</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-move="down" title="Aşağı">↓</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-del-block style="color:var(--danger);">' + (PCD.icon ? PCD.icon('trash', 14) : '✕') + '</button>' +
      '</div></div>';

    if (b.type === 'heading' || b.type === 'text') {
      h += styleRow('Metin', '<textarea class="textarea" data-f="text" rows="2" style="width:100%;">' + esc(b.text) + '</textarea>');
      h += styleRow('Font', fontSelect('font', b.font || design.page.baseFont));
      h += styleRow('Boyut', numInput('size', b.size, 8, 120));
      h += styleRow('Hizalama', alignBtns('align', b.align || 'center'));
      h += styleRow('Renk', colorInput('color', b.color, design.page.ink));
      if (b.type === 'text') h += styleRow('BÜYÜK harf', '<button type="button" class="btn btn-sm ' + (b.upper ? 'btn-primary' : 'btn-outline') + '" data-toggle="upper">' + (b.upper ? 'Açık' : 'Kapalı') + '</button>');
    } else if (b.type === 'section') {
      h += styleRow('Bölüm adı', '<input type="text" class="input" data-f="title" value="' + esc(b.title) + '" style="width:100%;">');
      h += styleRow('Başlık font', fontSelect('titleFont', b.titleFont || design.page.baseFont));
      h += styleRow('Başlık boyut', numInput('titleSize', b.titleSize, 12, 60));
      h += styleRow('Başlık renk', colorInput('titleColor', b.titleColor, design.page.accent));
      h += styleRow('Başlık altı çizgi', '<button type="button" class="btn btn-sm ' + (b.rule ? 'btn-primary' : 'btn-outline') + '" data-toggle="rule">' + (b.rule ? 'Açık' : 'Kapalı') + '</button>');
      h += '<hr style="border:0;border-top:1px dashed var(--border);margin:12px 0;">';
      h += '<div style="font-size:12px;font-weight:700;margin-bottom:6px;">Yemekler</div>';
      (b.items || []).forEach(function (it, i) {
        h += '<div class="card" style="padding:8px;margin-bottom:8px;" data-iid="' + it.id + '">';
        h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">' +
          '<input type="text" class="input" data-itf="name" value="' + esc(it.name) + '" placeholder="Yemek adı" style="flex:1;">' +
          '<input type="text" class="input" data-itf="price" value="' + esc(it.price) + '" placeholder="₺" style="width:64px;">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-itmove="up">↑</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-itmove="down">↓</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-itdel style="color:var(--danger);">✕</button>' +
          '</div>';
        h += '<input type="text" class="input" data-itf="desc" value="' + esc(it.desc) + '" placeholder="Açıklama" style="width:100%;margin-bottom:4px;">';
        h += '<div style="display:flex;gap:6px;align-items:center;">' +
          (it.photo ? '<img src="' + it.photo + '" style="width:32px;height:32px;object-fit:cover;border-radius:5px;">' : '') +
          '<button type="button" class="btn btn-outline btn-sm" data-itphoto>' + (it.photo ? 'Foto değiştir' : '+ Foto') + '</button>' +
          (it.photo ? '<button type="button" class="btn btn-ghost btn-sm" data-itphotodel>Kaldır</button>' : '') +
          '</div>';
        h += '</div>';
      });
      h += '<div style="display:flex;gap:6px;">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-additem-recipe style="flex:1;">+ Reçeteden</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-additem-manual style="flex:1;">+ Manuel</button>' +
        '</div>';
    } else if (b.type === 'image') {
      h += styleRow('Görsel', '<button type="button" class="btn btn-outline btn-sm" data-imgupload>' + (b.src ? 'Değiştir' : '+ Yükle') + '</button>' + (b.src ? ' <button type="button" class="btn btn-ghost btn-sm" data-imgdel>Kaldır</button>' : ''));
      h += styleRow('Yükseklik', numInput('height', b.height, 60, 600));
      h += styleRow('Hizalama', alignBtns('align', b.align || 'center'));
      h += styleRow('Köşe yuvarlama', numInput('radius', b.radius, 0, 40));
    } else if (b.type === 'divider') {
      h += styleRow('Stil', '<button type="button" class="btn btn-sm ' + (b.variant !== 'ornament' ? 'btn-primary' : 'btn-outline') + '" data-divvar="line">Çizgi</button> <button type="button" class="btn btn-sm ' + (b.variant === 'ornament' ? 'btn-primary' : 'btn-outline') + '" data-divvar="ornament">Süs</button>');
      h += styleRow('Renk', colorInput('color', b.color, design.page.accent));
    } else if (b.type === 'spacer') {
      h += styleRow('Yükseklik', numInput('height', b.height, 4, 200));
    }

    inspectorEl.innerHTML = h;
    wireInspector();
  }

  // Nokta-yollu set: 'page.bg' veya düz 'size'
  function setField(target, path, value) {
    if (path.indexOf('.') >= 0) {
      const parts = path.split('.');
      design[parts[0]][parts[1]] = value;
    } else {
      target[path] = value;
    }
  }

  function pickImage(cb) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = function () {
      const file = inp.files && inp.files[0]; if (!file) return;
      const rd = new FileReader();
      rd.onload = function () { cb(rd.result); };
      rd.readAsDataURL(file);
    };
    inp.click();
  }

  function wireInspector() {
    const b = selectedId ? findBlock(selectedId) : null;

    // text/number/select alanları — input'ta canlı güncelle (inspector re-render YOK → focus korunur)
    inspectorEl.querySelectorAll('[data-f]').forEach(function (el) {
      const ev = (el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(ev, function () {
        const path = el.getAttribute('data-f');
        let v = el.value;
        if (el.type === 'number') v = v === '' ? null : Number(v);
        setField(b || {}, path, v);
        refreshPage();
      });
    });
    // renk temizleme (tema default)
    inspectorEl.querySelectorAll('[data-clear]').forEach(function (el) {
      el.addEventListener('click', function () { setField(b || {}, el.getAttribute('data-clear'), ''); refreshPage(); renderInspector(); });
    });
    // hizalama
    inspectorEl.querySelectorAll('[data-align]').forEach(function (el) {
      el.addEventListener('click', function () {
        const parts = el.getAttribute('data-align').split('|');
        setField(b || {}, parts[0], parts[1]); refreshPage(); renderInspector();
      });
    });
    // toggles
    inspectorEl.querySelectorAll('[data-toggle]').forEach(function (el) {
      el.addEventListener('click', function () { const k = el.getAttribute('data-toggle'); b[k] = !b[k]; refreshPage(); renderInspector(); });
    });
    // page size
    inspectorEl.querySelectorAll('[data-size]').forEach(function (el) {
      el.addEventListener('click', function () { design.page.size = el.getAttribute('data-size'); refreshPage(); renderInspector(); });
    });
    // divider variant
    inspectorEl.querySelectorAll('[data-divvar]').forEach(function (el) {
      el.addEventListener('click', function () { b.variant = el.getAttribute('data-divvar'); refreshPage(); renderInspector(); });
    });
    // block move / delete
    const mv = inspectorEl.querySelectorAll('[data-move]');
    mv.forEach(function (el) { el.addEventListener('click', function () { moveBlock(selectedId, el.getAttribute('data-move')); }); });
    const delB = inspectorEl.querySelector('[data-del-block]');
    if (delB) delB.addEventListener('click', function () {
      design.blocks = design.blocks.filter(function (x) { return x.id !== selectedId; });
      selectedId = null; refreshPage(); renderInspector();
    });

    // image block upload
    const iu = inspectorEl.querySelector('[data-imgupload]');
    if (iu) iu.addEventListener('click', function () { pickImage(function (src) { b.src = src; refreshPage(); renderInspector(); }); });
    const idl = inspectorEl.querySelector('[data-imgdel]');
    if (idl) idl.addEventListener('click', function () { b.src = null; refreshPage(); renderInspector(); });

    // section items
    if (b && b.type === 'section') {
      inspectorEl.querySelectorAll('[data-iid]').forEach(function (row) {
        const iid = row.getAttribute('data-iid');
        const it = (b.items || []).find(function (x) { return x.id === iid; });
        if (!it) return;
        row.querySelectorAll('[data-itf]').forEach(function (el) {
          el.addEventListener('input', function () { it[el.getAttribute('data-itf')] = el.value; refreshPage(); });
        });
        const up = row.querySelector('[data-itmove="up"]'); const dn = row.querySelector('[data-itmove="down"]');
        if (up) up.addEventListener('click', function () { moveItem(b, iid, 'up'); });
        if (dn) dn.addEventListener('click', function () { moveItem(b, iid, 'down'); });
        const dl = row.querySelector('[data-itdel]');
        if (dl) dl.addEventListener('click', function () { b.items = b.items.filter(function (x) { return x.id !== iid; }); refreshPage(); renderInspector(); });
        const ph = row.querySelector('[data-itphoto]');
        if (ph) ph.addEventListener('click', function () { pickImage(function (src) { it.photo = src; refreshPage(); renderInspector(); }); });
        const phd = row.querySelector('[data-itphotodel]');
        if (phd) phd.addEventListener('click', function () { it.photo = null; refreshPage(); renderInspector(); });
      });
      const addR = inspectorEl.querySelector('[data-additem-recipe]');
      if (addR) addR.addEventListener('click', function () { openRecipePicker(b); });
      const addM = inspectorEl.querySelector('[data-additem-manual]');
      if (addM) addM.addEventListener('click', function () {
        b.items = b.items || []; b.items.push({ id: uid(), name: 'Yeni yemek', price: '', desc: '', photo: null });
        refreshPage(); renderInspector();
      });
    }
  }

  function moveBlock(id, dir) {
    const i = design.blocks.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= design.blocks.length) return;
    const tmp = design.blocks[i]; design.blocks[i] = design.blocks[j]; design.blocks[j] = tmp;
    refreshPage(); renderInspector();
  }
  function moveItem(sec, iid, dir) {
    const i = sec.items.findIndex(function (x) { return x.id === iid; });
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= sec.items.length) return;
    const tmp = sec.items[i]; sec.items[i] = sec.items[j]; sec.items[j] = tmp;
    refreshPage(); renderInspector();
  }

  function openRecipePicker(sec) {
    const recipes = (PCD.store.listRecipes && PCD.store.listRecipes()) || [];
    if (!recipes.length) { if (PCD.toast) PCD.toast.info('Henüz tarif yok'); return; }
    const body = PCD.el('div');
    body.innerHTML = '<input type="search" class="input" id="msRecipeSearch" placeholder="Tarif ara…" style="width:100%;margin-bottom:8px;"><div id="msRecipeList" style="max-height:50vh;overflow:auto;"></div>';
    function paint(q) {
      const list = body.querySelector('#msRecipeList');
      const ql = (q || '').toLowerCase();
      list.innerHTML = recipes.filter(function (r) { return !ql || (r.name || '').toLowerCase().indexOf(ql) >= 0; })
        .map(function (r) { return '<button type="button" class="btn btn-ghost btn-sm" data-rid="' + r.id + '" style="display:block;width:100%;text-align:left;">' + esc(r.name) + (r.salePrice ? ' · ' + cur() + r.salePrice : '') + '</button>'; }).join('');
      list.querySelectorAll('[data-rid]').forEach(function (el) {
        el.addEventListener('click', function () {
          const r = recipes.find(function (x) { return x.id === el.getAttribute('data-rid'); });
          sec.items = sec.items || [];
          sec.items.push({ id: uid(), name: r.name, price: r.salePrice != null ? String(r.salePrice) : '', desc: r.plating || '', photo: r.photo || null, recipeId: r.id });
          refreshPage(); renderInspector(); m.close();
        });
      });
    }
    paint('');
    const m = PCD.modal.open({ title: 'Reçeteden ekle', body: body, size: 'sm', closable: true });
    setTimeout(function () { const s = body.querySelector('#msRecipeSearch'); if (s) { s.focus(); s.addEventListener('input', function () { paint(s.value); }); } }, 100);
  }

  function addBlock(type) {
    const nb = { id: uid(), type: type };
    if (type === 'heading') Object.assign(nb, { text: 'Başlık', font: design.page.baseFont, size: 32, weight: 500, align: 'center', color: '' });
    else if (type === 'text') Object.assign(nb, { text: 'Metin…', font: 'Montserrat', size: 12, align: 'center', color: '' });
    else if (type === 'section') Object.assign(nb, { title: 'Yeni Bölüm', titleFont: design.page.baseFont, titleSize: 24, items: [] });
    else if (type === 'image') Object.assign(nb, { src: null, height: 200, align: 'center', radius: 0 });
    else if (type === 'divider') Object.assign(nb, { variant: 'ornament', color: '' });
    else if (type === 'spacer') Object.assign(nb, { height: 24 });
    design.blocks.push(nb);
    selectedId = nb.id;
    refreshPage(); renderInspector();
  }

  function buildPrintHtml() {
    const page = design.page;
    const spec = PAGE[page.size] || PAGE.portrait;
    return '<style>@page{size:A4 ' + (page.size === 'landscape' ? 'landscape' : 'portrait') + ';margin:0;}' +
      '@import url("' + GF_HREF + '");' +
      'body{margin:0;}' +
      '.ms-print{box-sizing:border-box;width:' + spec.w + 'px;min-height:' + spec.h + 'px;background:' + (page.bg || '#fff') + ';padding:' + (page.pad || 56) + 'px;margin:0 auto;}' +
      '.ms-block{margin-bottom:18px;}</style>' +
      '<div class="ms-print">' + renderPageInner(design) + '</div>';
  }

  // ================= ANA RENDER =================
  function render(view) {
    ensureFonts(document);
    design = load();
    selectedId = null;

    view.innerHTML =
      '<style>' +
        '.ms-wrap{display:grid;grid-template-columns:1fr 320px;gap:16px;align-items:start;}' +
        '@media(max-width:860px){.ms-wrap{grid-template-columns:1fr;}}' +
        '.ms-viewport{background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:20px;overflow:hidden;min-height:200px;}' +
        '.ms-page{box-shadow:0 8px 30px rgba(0,0,0,.15);box-sizing:border-box;}' +
        '.ms-block{cursor:pointer;border-radius:4px;}' +
        '.ms-inspector{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;position:sticky;top:12px;max-height:calc(100vh - 100px);overflow:auto;}' +
        '.ms-addbar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;}' +
      '</style>' +
      '<div class="page-header"><div class="page-header-text">' +
        '<div class="page-title">Menu Studio <span style="font-size:12px;font-weight:600;color:var(--brand-700);background:var(--brand-50);padding:2px 8px;border-radius:999px;vertical-align:middle;">beta</span></div>' +
        '<div class="page-subtitle">Tam özelleştirilebilir menü tasarımcısı — prototip</div>' +
      '</div><div class="page-header-actions">' +
        '<button class="btn btn-outline btn-sm" id="msBack">← Geri</button>' +
        '<button class="btn btn-outline btn-sm" id="msReset">Şablona dön</button>' +
        '<button class="btn btn-primary btn-sm" id="msPrint">' + (PCD.icon ? PCD.icon('print', 14) : '') + ' Yazdır / PDF</button>' +
      '</div></div>' +
      '<div class="ms-addbar">' +
        '<span style="font-size:12px;color:var(--text-3);align-self:center;">+ Blok:</span>' +
        '<button class="btn btn-outline btn-sm" data-add="heading">Başlık</button>' +
        '<button class="btn btn-outline btn-sm" data-add="text">Metin</button>' +
        '<button class="btn btn-outline btn-sm" data-add="section">Bölüm</button>' +
        '<button class="btn btn-outline btn-sm" data-add="image">Görsel</button>' +
        '<button class="btn btn-outline btn-sm" data-add="divider">Ayraç</button>' +
        '<button class="btn btn-outline btn-sm" data-add="spacer">Boşluk</button>' +
      '</div>' +
      '<div class="ms-wrap">' +
        '<div class="ms-viewport" id="msViewport"><div class="ms-page" id="msPage"></div></div>' +
        '<div class="ms-inspector" id="msInspector"></div>' +
      '</div>';

    viewportEl = PCD.$('#msViewport', view);
    pageScaleEl = PCD.$('#msPage', view);
    inspectorEl = PCD.$('#msInspector', view);

    refreshPage();
    renderInspector();

    // blok seçimi (kanvasta tıkla)
    PCD.on(pageScaleEl, 'click', '.ms-block', function (e) {
      e.stopPropagation();
      selectedId = this.getAttribute('data-bid');
      refreshPage(); renderInspector();
    });

    // add-block bar
    view.querySelectorAll('[data-add]').forEach(function (el) {
      el.addEventListener('click', function () { addBlock(el.getAttribute('data-add')); });
    });

    PCD.$('#msBack', view).addEventListener('click', function () { PCD.router.go('menus'); });
    PCD.$('#msPrint', view).addEventListener('click', function () { PCD.print(buildPrintHtml(), 'Menu'); });
    PCD.$('#msReset', view).addEventListener('click', function () {
      PCD.modal.confirm({ title: 'Şablona dön', text: 'Mevcut prototip tasarımı silinip şablon yüklenecek. Emin misin?', okText: 'Evet' }).then(function (ok) {
        if (!ok) return; design = templateDesign(); selectedId = null; refreshPage(); renderInspector();
      });
    });

    let _rsz = null;
    window.addEventListener('resize', function () { clearTimeout(_rsz); _rsz = setTimeout(applyScale, 120); });
  }

  PCD.menuStudio = { render: render };
})();
