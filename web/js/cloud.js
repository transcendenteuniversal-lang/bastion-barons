// Nuvem da Ranqueada (Supabase, direto pela API REST, sem biblioteca externa):
// login por e-mail (código de 6 dígitos) ou Google, leitura do ranking e gravação da própria linha.
// Gravação: INSERT para linha nova e UPDATE para linha existente (nunca upsert: o upsert passa pela regra
// de INSERT do banco, que limita a 40 pontos, e seria recusado para quem já tem mais pontos).
(function (BB) {
  'use strict';
  const AUTH_KEY = 'bb_auth_v1';
  const TABLE = 'ranked_players';
  const COLS = 'user_id,name,baron,season,points,max_league,streak,wins,losses,draws,trophies,prev_season,prev_points,updated_at';
  const NATIVE_REDIRECT = 'com.bastionbarons.game://auth';

  const cfg = () => BB.CLOUD_CONFIG || {};
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } },
  };

  class CloudError extends Error { constructor(status, msg) { super(msg || 'cloud ' + status); this.status = status; } }

  const C = {
    configured() { const c = cfg(); return !!(c.url && c.anonKey); },
    session() { try { return JSON.parse(ls.get(AUTH_KEY) || 'null'); } catch (e) { return null; } },
    loggedIn() { const s = C.session(); return !!(s && s.user && s.user.id && s.access_token); },
    userId() { const s = C.session(); return s && s.user ? s.user.id : null; },
    email() { const s = C.session(); return s && s.user ? s.user.email || '' : ''; },
    saveSession(s) { ls.set(AUTH_KEY, JSON.stringify(s)); },
    signOut() { ls.del(AUTH_KEY); },

    async req(path, opt) {
      opt = opt || {};
      const c = cfg();
      const headers = Object.assign({ apikey: c.anonKey, 'Content-Type': 'application/json' }, opt.headers || {});
      if (opt.auth !== false) {
        const tok = opt.auth === 'user' ? await C.token() : (C.loggedIn() ? await C.token() : c.anonKey);
        headers.Authorization = 'Bearer ' + tok;
      }
      let r;
      try { r = await fetch(c.url.replace(/\/$/, '') + path, { method: opt.method || 'GET', headers, body: opt.body ? JSON.stringify(opt.body) : undefined }); }
      catch (e) { throw new CloudError(0, 'offline'); }
      const txt = await r.text();
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
      if (!r.ok) throw new CloudError(r.status, (data && (data.message || data.msg || data.error_description || data.error)) || ('HTTP ' + r.status));
      return { data, headers: r.headers };
    },

    // ------------------------------------------------------------ login
    async token() {
      const s = C.session();
      if (!s) throw new CloudError(401, 'not logged in');
      if (s.expires_at && s.expires_at - 60 < Date.now() / 1000 && s.refresh_token) {
        try {
          const { data } = await C.req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: s.refresh_token } });
          C.store(data);
        } catch (e) { if (e.status === 400 || e.status === 401) { C.signOut(); throw new CloudError(401, 'session expired'); } }
      }
      return C.session().access_token;
    },
    store(d) {
      const old = C.session() || {};
      C.saveSession({
        access_token: d.access_token, refresh_token: d.refresh_token || old.refresh_token,
        expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
        user: d.user ? { id: d.user.id, email: d.user.email } : old.user,
      });
    },
    // e-mail: envia um código de 6 dígitos (o modelo de e-mail do Supabase precisa mostrar {{ .Token }})
    // o e-mail padrão do Supabase traz um link de login: ele volta para o jogo pelo mesmo caminho do Google
    async emailStart(email) { await C.req('/auth/v1/otp?redirect_to=' + encodeURIComponent(C.backUrl()), { method: 'POST', auth: false, body: { email, create_user: true } }); },
    async emailVerify(email, code) {
      const { data } = await C.req('/auth/v1/verify', { method: 'POST', auth: false, body: { type: 'email', email, token: String(code).trim() } });
      C.store(data);
      return C.loggedIn();
    },
    // Google: abre a página de login do Google; ela volta para o jogo com o acesso no endereço (#access_token=...)
    backUrl() { return window.AndroidBridge && window.AndroidBridge.openUrl ? NATIVE_REDIRECT : location.href.split('#')[0]; },
    googleUrl() {
      return cfg().url.replace(/\/$/, '') + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(C.backUrl());
    },
    googleStart() {
      const url = C.googleUrl();
      if (window.AndroidBridge && window.AndroidBridge.openUrl) window.AndroidBridge.openUrl(url); // navegador do sistema (o Google não aceita login dentro do app)
      else location.href = url;
    },
    // volta do login (app: deep link com.bastionbarons.game://auth#...; navegador: a própria página com #access_token)
    async handleRedirect(url) {
      const frag = String(url || '').split('#')[1] || '';
      const q = new URLSearchParams(frag);
      if (!q.get('access_token')) return false;
      C.store({ access_token: q.get('access_token'), refresh_token: q.get('refresh_token'), expires_in: Number(q.get('expires_in')) || 3600 });
      try { const { data } = await C.req('/auth/v1/user', { auth: 'user' }); C.store({ access_token: q.get('access_token'), user: data }); }
      catch (e) { C.signOut(); return false; }
      if (C.onLogin) C.onLogin();
      return true;
    },
    async checkRedirect() {
      try {
        if (window.AndroidBridge && window.AndroidBridge.takeAuthRedirect) {
          const u = window.AndroidBridge.takeAuthRedirect();
          if (u) return C.handleRedirect(u);
        }
        if (location.hash.indexOf('access_token=') >= 0) {
          const u = location.href;
          history.replaceState(null, '', location.href.split('#')[0]);
          return C.handleRedirect(u);
        }
      } catch (e) { /* nada */ }
      return false;
    },
    async deleteAccount() { await C.req('/rest/v1/rpc/delete_my_account', { method: 'POST', auth: 'user', body: {} }); C.signOut(); },

    // ------------------------------------------------------------ ranking
    async readSeason(season) {
      const { data } = await C.req('/rest/v1/' + TABLE + '?select=' + COLS + '&season=eq.' + season + '&order=points.desc&limit=200');
      return data || [];
    },
    // linhas que valem para a colocação final de uma temporada já encerrada
    async readFinal(season) {
      const { data } = await C.req('/rest/v1/' + TABLE + '?select=user_id,season,points,prev_season,prev_points&or=(season.eq.' + season + ',prev_season.eq.' + season + ')&limit=1000');
      return (data || []).map((r) => ({ id: r.user_id, points: r.season === season ? r.points : r.prev_points }));
    },
    async countAbove(season, points) {
      const { headers } = await C.req('/rest/v1/' + TABLE + '?select=user_id&season=eq.' + season + '&points=gt.' + (points | 0) + '&user_id=neq.' + C.userId(),
        { headers: { Prefer: 'count=exact', Range: '0-0' } });
      const cr = headers.get('content-range') || '';
      return Number(cr.split('/')[1]) || 0;
    },
    async myRow() {
      const { data } = await C.req('/rest/v1/' + TABLE + '?select=' + COLS + '&user_id=eq.' + C.userId(), { auth: 'user' });
      return data && data[0] ? data[0] : null;
    },
    rowFrom(st, name, baron) {
      return {
        user_id: C.userId(), name: String(name).slice(0, 20), baron, season: st.season, points: st.points, max_league: st.maxLeague,
        streak: st.streak, wins: st.wins, losses: st.losses, draws: st.draws, trophies: st.trophies,
        prev_season: st.prevSeason || '', prev_points: st.prevPoints || 0,
      };
    },
    async insert(row) {
      const { data } = await C.req('/rest/v1/' + TABLE, { method: 'POST', auth: 'user', body: row, headers: { Prefer: 'return=representation' } });
      return data && data[0];
    },
    async update(row) {
      const { data } = await C.req('/rest/v1/' + TABLE + '?user_id=eq.' + row.user_id, { method: 'PATCH', auth: 'user', body: row, headers: { Prefer: 'return=representation' } });
      return data && data[0];
    },
    // grava a própria linha: UPDATE se já existe, INSERT se é nova (com troca automática se a suposição errar)
    async upload(row, exists) {
      if (exists === undefined || exists === null) exists = !!(await C.myRow());
      if (exists) {
        const r = await C.update(row);
        if (r) return r;
        return C.insert(row); // linha sumiu (conta recriada): cria de novo
      }
      try { return await C.insert(row); }
      catch (e) { if (e.status === 409) return C.update(row); throw e; }
    },
  };

  C.CloudError = CloudError;
  BB.cloud = C;
})(window.BB = window.BB || {});
