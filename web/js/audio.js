// Áudio original gerado em tempo real (Web Audio). Sons definitivos podem substituir via audio/<id>.mp3 (ver docs/ASSETS.md).
(function (BB) {
  'use strict';
  let ctx = null, master = null, sfxGain = null, musicGain = null, musicTimer = null, musicId = null;
  const vol = { music: 0.6, sfx: 0.8 };
  const last = {};

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.connect(master);
    apply();
  }
  function apply() { if (cur) cur.volume = Math.max(0, Math.min(1, vol.music * 0.9 * duck)); if (!ctx) return; sfxGain.gain.value = vol.sfx; musicGain.gain.value = vol.music * 0.35; }

  function tone(freq, dur, type, gain, when, slideTo, dest) {
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain || 0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxGain); o.start(t); o.stop(t + dur + 0.02);
  }
  let noiseBuf = null;
  function noise(dur, gain, freq, when, dest) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = ctx.currentTime + (when || 0);
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = 0.8;
    g.gain.setValueAtTime(gain || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || sfxGain); s.start(t); s.stop(t + dur + 0.02);
  }

  const SFX = {
    click: () => tone(1100, 0.06, 'triangle', 0.15),
    card: () => tone(500, 0.14, 'triangle', 0.15, 0, 1200),
    spawn: () => { tone(392, 0.09, 'triangle', 0.12); tone(523, 0.09, 'triangle', 0.12, 0.07); tone(659, 0.12, 'triangle', 0.12, 0.14); },
    sword: () => { noise(0.09, 0.18, 3500); tone(1800, 0.06, 'square', 0.03); },
    bow: () => tone(900, 0.14, 'sine', 0.12, 0, 300),
    magic: () => { tone(600, 0.35, 'sine', 0.12, 0, 1400); tone(900, 0.3, 'triangle', 0.06, 0.05, 1800); },
    explosion: () => { noise(0.5, 0.45, 400); tone(80, 0.4, 'sine', 0.3, 0, 40); },
    dragon: () => { noise(0.6, 0.3, 700); tone(140, 0.6, 'sawtooth', 0.08, 0, 70); },
    castle: () => { tone(90, 0.3, 'sine', 0.35, 0, 50); noise(0.25, 0.15, 300); },
    death: () => tone(320, 0.22, 'triangle', 0.1, 0, 90),
    heal: () => { tone(880, 0.2, 'sine', 0.06); tone(1320, 0.25, 'sine', 0.05, 0.08); },
    baron: () => { [262, 330, 392, 523].forEach((f, i) => tone(f, 0.7, 'triangle', 0.12, i * 0.06)); noise(0.4, 0.08, 2000, 0.1); },
    victory: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 1 : 0.25, 'triangle', 0.2, i * 0.22)); },
    defeat: () => { [392, 349, 311, 262].forEach((f, i) => tone(f, i === 3 ? 0.9 : 0.3, 'triangle', 0.18, i * 0.3)); },
    error: () => tone(160, 0.15, 'square', 0.06),
  };

  // Música: faixas em audio/*.ogg (menu, batalha, último minuto) em loop, com troca suave; vinhetas tocam uma vez
  const TRACKS = { menu: 'audio/music_menu.ogg', battle: 'audio/music_battle.ogg', final: 'audio/music_final.ogg' };
  const JINGLES = { victory: 'audio/jingle_victory.ogg', defeat: 'audio/jingle_defeat.ogg', reward: 'audio/jingle_reward.ogg' };
  const els = {};
  let cur = null, wantId = null, duck = 1;
  const el = (src, loop) => { if (!els[src]) { const a = new Audio(src); a.loop = loop; a.preload = 'auto'; els[src] = a; } return els[src]; };
  const level = () => Math.max(0, Math.min(1, vol.music * 0.9 * duck));
  function fade(a, to, ms, done) {
    const from = a.volume, t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); a.volume = from + (to - from) * k; if (k < 1) requestAnimationFrame(step); else if (done) done(); };
    step();
  }
  function startMusic(id) {
    wantId = id;
    if (musicId === id && cur && !cur.paused) return;
    const src = TRACKS[id]; if (!src) return;
    const prev = cur, a = el(src, true);
    musicId = id; cur = a;
    if (prev && prev !== a) fade(prev, 0, 700, () => prev.pause());
    if (prev !== a) { a.currentTime = 0; a.volume = 0; }
    const p = a.play(); if (p && p.catch) p.catch(() => { musicId = null; }); // sem toque do usuário ainda: tenta de novo no unlock
    fade(a, level(), 900);
  }
  function stopMusic() { wantId = null; musicId = null; if (cur) { const a = cur; fade(a, 0, 500, () => a.pause()); } cur = null; }
  function jingle(id) {
    const src = JINGLES[id]; if (!src || vol.music <= 0) return;
    const j = el(src, false); j.currentTime = 0; j.volume = Math.min(1, vol.music * 1.1 + 0.1);
    duck = 0.25; if (cur) fade(cur, level(), 200);
    const p = j.play(); if (p && p.catch) p.catch(() => {});
    j.onended = () => { duck = 1; if (cur) fade(cur, level(), 800); };
  }

  BB.audio = {
    unlock() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); if (wantId && musicId !== wantId) startMusic(wantId); },
    setVolumes(m, s) { vol.music = m; vol.sfx = s; apply(); },
    play(id) {
      if (!ctx || vol.sfx <= 0 || !SFX[id]) return;
      const now = performance.now();
      if (last[id] && now - last[id] < 60) return; // evita empilhar sons iguais
      last[id] = now;
      try { SFX[id](); } catch (e) { /* áudio indisponível */ }
    },
    music(id) { try { startMusic(id); } catch (e) { /* nada */ } },
    jingle(id) { try { jingle(id); } catch (e) { /* nada */ } },
    stopMusic,
    suspend() { if (ctx) ctx.suspend(); if (cur) cur.pause(); },
    resume() { if (ctx) ctx.resume(); if (cur && wantId) { const p = cur.play(); if (p && p.catch) p.catch(() => {}); } },
  };
  BB.vibrate = (ms) => { if (BB.profile && BB.profile.vibration === false) return; if (window.AndroidBridge && AndroidBridge.vibrate) AndroidBridge.vibrate(ms); else if (navigator.vibrate) navigator.vibrate(ms); };
})(window.BB);
