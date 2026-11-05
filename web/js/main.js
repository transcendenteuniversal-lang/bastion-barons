// Inicialização do jogo.
(async function (BB) {
  'use strict';
  BB.platform.loadingStart();
  await BB.platform.init();
  BB.platform.loadingStart();
  BB.content = new BB.Content(BB.CONTENT);
  BB.profile = BB.Progress.load(BB.content);
  if (BB.FORCE_LANG) BB.profile.language = BB.FORCE_LANG;
  if (!BB.profile.language) BB.profile.language = BB.detectLang();
  BB.setLang(BB.profile.language);
  BB.save = () => BB.Progress.save(BB.profile);
  BB.audio.setVolumes(BB.profile.music, BB.profile.sfx);
  BB.renderer = new BB.Renderer(document.getElementById('field'));
  document.getElementById('field').style.display = 'none';
  document.getElementById('rotateMsg').textContent = BB.T('ui.rotate');
  // o resto das imagens carrega em segundo plano depois que a primeira tela aparece (início rápido)
  BB.preloadRest = () => { if (!BB._pre) { BB._pre = true; setTimeout(() => BB.art.preload(BB.content), 300); } };

  // o áudio só pode começar depois do primeiro toque
  document.addEventListener('pointerdown', () => BB.audio.unlock(), { capture: true });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', () => BB.renderer.resize());
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') BB.ui.onBack(); });

  // chamados pelo app Android (MainActivity)
  BB.onAppPause = () => { BB.save(); if (BB.battle) BB.battle.onAppPause(); BB.audio.suspend(); };
  BB.onAppResume = () => BB.audio.resume();
  document.addEventListener('visibilitychange', () => (document.hidden ? BB.onAppPause() : BB.onAppResume()));

  BB.onAppPause = ((f) => () => { f(); BB.platform.gameplayStop(); })(BB.onAppPause);
  BB.ui.show('splash');
})(window.BB);
