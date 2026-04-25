/* ================================================================
   ProChefDesk — auth.js
   Handles email signup/signin, Google OAuth, guest mode.
   ================================================================ */

(function () {
  'use strict';
  const PCD = window.PCD;

  const auth = {
    init: function () {
      const supabase = PCD.cloud && PCD.cloud.getClient();
      if (!supabase) {
        PCD.log('auth: no supabase — guest mode only.');
        return Promise.resolve();
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(function (event, session) {
        PCD.log('auth event:', event);
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          if (session && session.user) {
            auth._setUser(session.user);
          }
        } else if (event === 'SIGNED_OUT') {
          auth._clearUser();
        } else if (event === 'USER_UPDATED') {
          if (session && session.user) auth._setUser(session.user);
        }
      });

      // Check existing session — graceful failure if iOS has evicted it
      return supabase.auth.getSession().then(function (res) {
        if (res.data && res.data.session && res.data.session.user) {
          auth._setUser(res.data.session.user);
          // Pull cloud data — silent failure if network issue
          return PCD.cloud.pull().catch(function (e) {
            PCD.warn('Cloud pull failed (will retry on next sync):', e && e.message);
          }).then(function () {
            return PCD.cloud.fetchPlan();
          }).then(function (plan) {
            PCD.store.set('plan', plan);
          }).catch(function (e) {
            PCD.warn('Plan fetch failed:', e && e.message);
          });
        } else if (res.error) {
          // "Invalid Refresh Token" or network error on iOS — treat as logged out
          PCD.warn('Session check error (treating as logged out):', res.error.message);
          auth._clearUser();
        }
      }).catch(function (e) {
        // Supabase unreachable — app should still work offline
        PCD.warn('Auth init failed (offline?):', e && e.message);
      });
    },

    _setUser: function (supaUser) {
      const user = {
        id: supaUser.id,
        email: supaUser.email,
        name: (supaUser.user_metadata && (supaUser.user_metadata.full_name || supaUser.user_metadata.name)) || supaUser.email,
        avatar: supaUser.user_metadata && supaUser.user_metadata.avatar_url || null,
      };
      PCD.store.set('user', user);
    },

    _clearUser: function () {
      PCD.store.set('user', null);
    },

    signUp: function (email, password) {
      const supabase = PCD.cloud && PCD.cloud.getClient();
      if (!supabase) return Promise.reject(new Error('no_backend'));
      return supabase.auth.signUp({ email: email, password: password });
    },

    signIn: function (email, password) {
      const supabase = PCD.cloud && PCD.cloud.getClient();
      if (!supabase) return Promise.reject(new Error('no_backend'));
      return supabase.auth.signInWithPassword({ email: email, password: password });
    },

    signInWithGoogle: function () {
      const supabase = PCD.cloud && PCD.cloud.getClient();
      if (!supabase) return Promise.reject(new Error('no_backend'));
      return supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      });
    },

    signOut: function () {
      const supabase = PCD.cloud && PCD.cloud.getClient();
      if (supabase) {
        return supabase.auth.signOut().then(function () {
          auth._clearUser();
        });
      }
      auth._clearUser();
      return Promise.resolve();
    },

    openAuthModal: function () {
      const t = PCD.i18n.t;
      let mode = 'sign_in'; // or 'sign_up'

      function body() {
        return `
          <div class="text-center mb-4">
            <div class="alert-dialog-icon info">👨‍🍳</div>
            <h3 style="font-size:20px;font-weight:700;letter-spacing:-0.01em;">${t('auth_welcome')}</h3>
            <p style="font-size:13px;color:var(--text-3);margin-top:6px;">${t('auth_welcome_desc')}</p>
          </div>
          <button id="authGoogle" class="btn btn-outline btn-block mb-3" style="min-height:48px;">
            <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3L37.7 9.3C34.3 6.3 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8c1.8-4.3 6-7.5 11.1-7.5 3.1 0 5.8 1.1 7.9 3L37.7 9.3C34.3 6.3 29.5 4 24 4c-7.6 0-14.2 4.2-17.7 10.7z"/><path fill="#4CAF50" d="M24 44c5.4 0 10.2-2.1 13.6-5.4l-6.3-5.3c-2 1.5-4.6 2.4-7.3 2.4-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.7 39.8 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4 5.7l6.3 5.3c-.4.4 6.7-4.9 6.7-15 0-1.3-.1-2.6-.4-3.9z"/></svg>
            ${t('auth_sign_in_google')}
          </button>
          <div class="flex items-center gap-2 mb-3">
            <div style="flex:1;height:1px;background:var(--border);"></div>
            <span class="text-xs text-muted">or</span>
            <div style="flex:1;height:1px;background:var(--border);"></div>
          </div>
          <div class="field">
            <label class="field-label">${t('auth_email')}</label>
            <input id="authEmail" type="email" class="input" autocomplete="email" placeholder="chef@kitchen.com">
          </div>
          <div class="field">
            <label class="field-label">${t('auth_password')}</label>
            <input id="authPassword" type="password" class="input" autocomplete="current-password" placeholder="••••••••">
          </div>
          <button id="authSubmit" class="btn btn-primary btn-block" style="min-height:48px;">
            ${t(mode === 'sign_in' ? 'auth_sign_in_email' : 'auth_sign_up_email')}
          </button>
          <div class="text-center mt-4" style="font-size:13px;color:var(--text-3);">
            <span id="authToggleQ">${t(mode === 'sign_in' ? 'auth_no_account' : 'auth_have_account')}</span>
            <a id="authToggle" href="#" style="margin-inline-start:4px;font-weight:600;">
              ${t(mode === 'sign_in' ? 'sign_up' : 'sign_in')}
            </a>
          </div>
          <div class="text-center mt-4">
            <button id="authGuest" class="btn btn-ghost btn-sm">${t('auth_continue_guest')}</button>
          </div>
        `;
      }

      const m = PCD.modal.open({
        title: t('auth_welcome'),
        body: body(),
        size: 'sm',
        footer: '',
        closable: true,
      });

      function renderAgain() {
        m.setBody(body());
        wireUp();
      }

      function wireUp() {
        const emailEl = PCD.$('#authEmail', m.el);
        const passEl = PCD.$('#authPassword', m.el);

        PCD.on(m.el, 'click', '#authGoogle', function () {
          if (!PCD.cloud.ready) {
            PCD.toast.warning(t('auth_backend_not_configured'));
            return;
          }
          auth.signInWithGoogle().catch(function (e) {
            PCD.toast.error(e.message || t('err_generic'));
          });
        });

        PCD.on(m.el, 'click', '#authSubmit', function () {
          const email = (emailEl.value || '').trim();
          const pw = passEl.value;
          if (!PCD.isEmail(email)) { PCD.toast.error('Invalid email'); return; }
          if (!pw || pw.length < 6) { PCD.toast.error('Password too short'); return; }
          if (!PCD.cloud.ready) {
            PCD.toast.warning(t('auth_backend_not_configured'));
            return;
          }
          const btn = this;
          btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
          const fn = mode === 'sign_in' ? auth.signIn : auth.signUp;
          fn(email, pw).then(function (res) {
            btn.disabled = false;
            if (res.error) {
              PCD.toast.error(res.error.message || t('auth_invalid_credentials'));
              renderAgain();
              return;
            }
            if (mode === 'sign_up' && res.data && !res.data.session) {
              PCD.toast.info(t('auth_magic_sent'));
            } else {
              PCD.toast.success(t('success'));
            }
            m.close();
          }).catch(function (e) {
            btn.disabled = false;
            PCD.toast.error(e.message || t('err_generic'));
            renderAgain();
          });
        });

        PCD.on(m.el, 'click', '#authToggle', function (e) {
          e.preventDefault();
          mode = (mode === 'sign_in') ? 'sign_up' : 'sign_in';
          renderAgain();
        });

        PCD.on(m.el, 'click', '#authGuest', function () {
          m.close();
        });
      }
      wireUp();
    },
  };

  PCD.auth = auth;
})();
