/* ================================================================
   ProChefDesk — cropper.js
   Draggable, resizable image cropper. Works on mouse + touch.
   - 4 corner handles to resize
   - Center drag to move frame
   - Ratio presets (Free, 1:1, 4:3, 3:2, 16:9)
   - Rotate 90°
   - Exports cropped image as dataURL (JPEG, max 1200px wide)

   Usage:
     PCD.cropper.open(imageDataUrl).then(function(croppedDataUrl) { ... });
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  const RATIOS = [
    { key: 'cropper_ratio_free', ratio: null },
    { key: 'cropper_ratio_square', ratio: 1 },
    { key: 'cropper_ratio_4_3', ratio: 4/3 },
    { key: 'cropper_ratio_3_2', ratio: 3/2 },
    { key: 'cropper_ratio_16_9', ratio: 16/9 },
  ];

  function open(imageSrc) {
    return new Promise(function (resolve, reject) {
      const t = PCD.i18n.t;

      const state = {
        img: null,
        naturalW: 0,
        naturalH: 0,
        displayW: 0,   // display w of stage
        displayH: 0,
        imgDisplayW: 0,
        imgDisplayH: 0,
        imgOffsetX: 0, // where image top-left sits on stage
        imgOffsetY: 0,
        rotation: 0,   // 0, 90, 180, 270
        crop: { x: 0, y: 0, w: 0, h: 0 }, // in stage coords
        ratio: null,
      };

      const stage = PCD.el('div', { class: 'cropper-stage' });
      const imgEl = PCD.el('img', { class: 'cropper-img', draggable: 'false' });
      stage.appendChild(imgEl);

      const frame = PCD.el('div', { class: 'cropper-frame' });
      ['nw', 'ne', 'sw', 'se'].forEach(function (h) {
        frame.appendChild(PCD.el('div', { class: 'cropper-handle h-' + h, 'data-h': h }));
      });
      stage.appendChild(frame);

      const toolbar = PCD.el('div', { class: 'cropper-toolbar' });
      RATIOS.forEach(function (r, i) {
        const b = PCD.el('button', { class: 'cropper-ratio-btn' + (i === 0 ? ' active' : ''), text: t(r.key), 'data-ridx': i });
        toolbar.appendChild(b);
      });
      const rotateBtn = PCD.el('button', { class: 'cropper-ratio-btn', 'data-rotate': '1' });
      rotateBtn.innerHTML = '⟳ ' + t('cropper_rotate');
      toolbar.appendChild(rotateBtn);

      const container = PCD.el('div');
      container.appendChild(stage);
      container.appendChild(toolbar);

      const applyBtn = PCD.el('button', { class: 'btn btn-primary', text: t('cropper_apply') });
      const cancelBtn = PCD.el('button', { class: 'btn btn-secondary', text: t('cancel') });
      const footer = PCD.el('div');
      footer.appendChild(cancelBtn);
      footer.appendChild(applyBtn);

      const modal = PCD.modal.open({
        title: t('cropper_title'),
        body: container,
        footer: footer,
        size: 'lg',
        closable: true,
        onClose: function () { resolve(null); }
      });

      // Load image
      imgEl.onload = function () {
        state.naturalW = imgEl.naturalWidth;
        state.naturalH = imgEl.naturalHeight;
        // Wait a tick for stage to have dimensions
        setTimeout(layoutImage, 30);
      };
      imgEl.onerror = function () {
        modal.close();
        reject(new Error('image load failed'));
      };
      imgEl.src = imageSrc;

      function layoutImage() {
        const stageRect = stage.getBoundingClientRect();
        state.displayW = stageRect.width;
        state.displayH = stageRect.height;
        // Fit image inside stage (contain)
        const nw = state.rotation % 180 === 0 ? state.naturalW : state.naturalH;
        const nh = state.rotation % 180 === 0 ? state.naturalH : state.naturalW;
        const scale = Math.min(state.displayW / nw, state.displayH / nh);
        state.imgDisplayW = nw * scale;
        state.imgDisplayH = nh * scale;
        state.imgOffsetX = (state.displayW - state.imgDisplayW) / 2;
        state.imgOffsetY = (state.displayH - state.imgDisplayH) / 2;

        // Apply rotation visually
        imgEl.style.width = state.naturalW * scale + 'px';
        imgEl.style.height = state.naturalH * scale + 'px';
        // Position with rotation
        const rot = state.rotation;
        let tx = state.imgOffsetX, ty = state.imgOffsetY;
        // For rotated image we need to shift origin so it stays in bounds
        if (rot === 90) { tx += state.imgDisplayW; }
        if (rot === 180) { tx += state.imgDisplayW; ty += state.imgDisplayH; }
        if (rot === 270) { ty += state.imgDisplayH; }
        imgEl.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) rotate(' + rot + 'deg)';
        imgEl.style.transformOrigin = '0 0';

        // Initialize crop to center 80% of image
        const cw = state.imgDisplayW * 0.8;
        const ch = state.imgDisplayH * 0.8;
        state.crop = {
          x: state.imgOffsetX + (state.imgDisplayW - cw) / 2,
          y: state.imgOffsetY + (state.imgDisplayH - ch) / 2,
          w: cw,
          h: ch
        };
        if (state.ratio) enforceRatio();
        updateFrame();
      }

      function enforceRatio() {
        if (!state.ratio) return;
        // Keep current area, adjust to match ratio
        const curRatio = state.crop.w / state.crop.h;
        if (Math.abs(curRatio - state.ratio) < 0.001) return;
        if (curRatio > state.ratio) {
          // too wide, reduce width
          state.crop.w = state.crop.h * state.ratio;
        } else {
          state.crop.h = state.crop.w / state.ratio;
        }
        // Ensure inside image bounds
        const maxX = state.imgOffsetX + state.imgDisplayW - state.crop.w;
        const maxY = state.imgOffsetY + state.imgDisplayH - state.crop.h;
        state.crop.x = PCD.clamp(state.crop.x, state.imgOffsetX, maxX);
        state.crop.y = PCD.clamp(state.crop.y, state.imgOffsetY, maxY);
      }

      function updateFrame() {
        frame.style.left = state.crop.x + 'px';
        frame.style.top = state.crop.y + 'px';
        frame.style.width = state.crop.w + 'px';
        frame.style.height = state.crop.h + 'px';
      }

      // -------- DRAG / RESIZE --------
      let drag = null;

      function onStart(e) {
        const target = e.target;
        const handle = target.getAttribute && target.getAttribute('data-h');
        const isHandle = !!handle;
        const isFrame = target === frame || target.closest('.cropper-frame') === frame;
        if (!isFrame && !isHandle) return;

        e.preventDefault();
        const pt = getPoint(e);
        drag = {
          mode: isHandle ? ('resize-' + handle) : 'move',
          startX: pt.x,
          startY: pt.y,
          startCrop: Object.assign({}, state.crop)
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
        document.addEventListener('touchcancel', onEnd);
      }

      function onMove(e) {
        if (!drag) return;
        e.preventDefault();
        const pt = getPoint(e);
        const dx = pt.x - drag.startX;
        const dy = pt.y - drag.startY;

        if (drag.mode === 'move') {
          let nx = drag.startCrop.x + dx;
          let ny = drag.startCrop.y + dy;
          const maxX = state.imgOffsetX + state.imgDisplayW - state.crop.w;
          const maxY = state.imgOffsetY + state.imgDisplayH - state.crop.h;
          state.crop.x = PCD.clamp(nx, state.imgOffsetX, maxX);
          state.crop.y = PCD.clamp(ny, state.imgOffsetY, maxY);
        } else {
          // resize
          resizeCrop(drag.mode.replace('resize-', ''), drag.startCrop, dx, dy);
        }
        updateFrame();
      }

      function onEnd() {
        drag = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        document.removeEventListener('touchcancel', onEnd);
      }

      function getPoint(e) {
        if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        return { x: e.clientX, y: e.clientY };
      }

      function resizeCrop(handle, start, dx, dy) {
        const min = 40;
        const maxX = state.imgOffsetX + state.imgDisplayW;
        const maxY = state.imgOffsetY + state.imgDisplayH;

        let x = start.x, y = start.y, w = start.w, h = start.h;

        if (handle === 'nw') { x = start.x + dx; y = start.y + dy; w = start.w - dx; h = start.h - dy; }
        if (handle === 'ne') { y = start.y + dy; w = start.w + dx; h = start.h - dy; }
        if (handle === 'sw') { x = start.x + dx; w = start.w - dx; h = start.h + dy; }
        if (handle === 'se') { w = start.w + dx; h = start.h + dy; }

        // ratio lock
        if (state.ratio) {
          // adjust h from w (or vice versa, pick larger delta)
          if (Math.abs(dx) >= Math.abs(dy)) {
            h = w / state.ratio;
            if (handle.indexOf('n') === 0) y = start.y + start.h - h;
          } else {
            w = h * state.ratio;
            if (handle.indexOf('w') === 1) x = start.x + start.w - w;
          }
        }

        // bounds
        if (w < min) { if (handle.indexOf('w') === 1) x += w - min; w = min; }
        if (h < min) { if (handle.indexOf('n') === 0) y += h - min; h = min; }

        if (x < state.imgOffsetX) { w -= (state.imgOffsetX - x); x = state.imgOffsetX; }
        if (y < state.imgOffsetY) { h -= (state.imgOffsetY - y); y = state.imgOffsetY; }
        if (x + w > maxX) w = maxX - x;
        if (y + h > maxY) h = maxY - y;

        if (state.ratio) {
          // reconcile if bounds hit
          if (w / h > state.ratio) w = h * state.ratio;
          else h = w / state.ratio;
        }

        state.crop.x = x; state.crop.y = y; state.crop.w = w; state.crop.h = h;
      }

      frame.addEventListener('mousedown', onStart);
      frame.addEventListener('touchstart', onStart, { passive: false });

      // Ratio buttons
      PCD.on(toolbar, 'click', '.cropper-ratio-btn', function () {
        const rotate = this.getAttribute('data-rotate');
        if (rotate) {
          state.rotation = (state.rotation + 90) % 360;
          layoutImage();
          return;
        }
        const idx = parseInt(this.getAttribute('data-ridx'), 10);
        toolbar.querySelectorAll('.cropper-ratio-btn').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        state.ratio = RATIOS[idx].ratio;
        enforceRatio();
        updateFrame();
      });

      // -------- APPLY --------
      applyBtn.addEventListener('click', function () {
        try {
          // Map crop (stage coords) back to natural image coords
          const scale = state.imgDisplayW / (state.rotation % 180 === 0 ? state.naturalW : state.naturalH);
          const cx = (state.crop.x - state.imgOffsetX) / scale;
          const cy = (state.crop.y - state.imgOffsetY) / scale;
          const cw = state.crop.w / scale;
          const ch = state.crop.h / scale;

          const canvas = document.createElement('canvas');
          const rot = state.rotation;
          const nw = state.naturalW, nh = state.naturalH;
          const off = document.createElement('canvas');
          off.width = (rot % 180 === 0) ? nw : nh;
          off.height = (rot % 180 === 0) ? nh : nw;
          const offCtx = off.getContext('2d');
          offCtx.translate(off.width / 2, off.height / 2);
          offCtx.rotate(rot * Math.PI / 180);
          offCtx.drawImage(state.img || imgEl, -nw / 2, -nh / 2, nw, nh);

          const maxOutW = 900;
          const outW = Math.min(maxOutW, Math.round(cw));
          const outH = Math.round(outW * (ch / cw));
          canvas.width = outW;
          canvas.height = outH;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(off, cx, cy, cw, ch, 0, 0, outW, outH);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          // Detach onClose so closing doesn't trigger resolve(null)
          modal._onClose = null;
          window.removeEventListener('resize', resize);
          modal.close();
          resolve(dataUrl);
        } catch (err) {
          PCD.error && PCD.error('crop apply failed:', err);
          modal._onClose = null;
          window.removeEventListener('resize', resize);
          modal.close();
          resolve(null);
        }
      });

      cancelBtn.addEventListener('click', function () {
        modal.close();
      });

      // Recalc on resize
      const resize = PCD.debounce(layoutImage, 200);
      window.addEventListener('resize', resize);
      // Cleanup on close (resize listener)
      const origOnClose = modal._onClose;
      modal._onClose = function () {
        window.removeEventListener('resize', resize);
        if (origOnClose) origOnClose();
      };
    });
  }

  PCD.cropper = { open: open };
})();
