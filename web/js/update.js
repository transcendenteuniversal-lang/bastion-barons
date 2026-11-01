// Atualização automática: ao abrir, o app procura uma versão mais nova nos Releases do GitHub.
(function (BB) {
  'use strict';
  const REPO = 'transcendenteuniversal-lang/bastion-barons';
  BB.openUrl = function (url) {
    if (window.AndroidBridge && window.AndroidBridge.openUrl) window.AndroidBridge.openUrl(url);
    else window.open(url, '_blank');
  };
  BB.checkUpdate = async function () {
    const v = BB.VERSION;
    if (!v || !v.code || !window.AndroidBridge) return; // só o app instalado baixa APK novo
    if (v.store === 'play') return; // instalado pela Google Play: a própria loja atualiza
    try {
      const r = await fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { cache: 'no-store' });
      if (!r.ok) return;
      const rel = await r.json();
      const code = parseInt(String(rel.tag_name || '').replace(/\D/g, ''), 10);
      const apk = (rel.assets || []).find((a) => /\.apk$/i.test(a.name));
      if (!apk || !(code > v.code)) return;
      const notes = String(rel.body || '').split('\n').filter((l) => l.trim() && !/^Co-Authored|^Claude-Session/.test(l)).slice(0, 6).join('\n');
      BB.ui.modal(BB.T('update.title'), (rel.name || rel.tag_name) + '\n\n' + notes, [
        { label: BB.T('update.go'), cls: 'gold', fn: () => BB.openUrl(apk.browser_download_url) },
        { label: BB.T('update.later'), cls: 'dark' },
      ]);
    } catch (e) { /* sem internet: segue jogando a versão instalada */ }
  };
})(window.BB);
