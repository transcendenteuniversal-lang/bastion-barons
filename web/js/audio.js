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
  function apply() { if (!ctx) return; sfxGain.gain.value = vol.sfx; musicGain.gain.value = vol.music * 0.35; }

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

  // Música procedural: acordes + baixo + arpejo (+ percussão na batalha)
  const SONGS = {
    menu: { bpm: 74, roots: [262, 220, 175, 196], drums: false },
    battle: { bpm: 112, roots: [220, 175, 196, 165], drums: true },
  };
  function startMusic(id) {
    if (!ctx || musicId === id) return;
    stopMusic(); musicId = id;
    const s = SONGS[id], beat = 60 / s.bpm;
    let bar = 0, next = ctx.currentTime + 0.1;
    const sched = () => {
      while (next < ctx.currentTime + 1.2) {
        const root = s.roots[bar % s.roots.length];
        const off = next - ctx.currentTime;
        [1, 1.26, 1.5].forEach((m) => tone(root * m, beat * 3.8, 'sine', 0.05, off, null, musicGain));
        for (let b = 0; b < 4; b++) {
          tone(root / 2, beat * 0.9, 'triangle', 0.09, off + b * beat, null, musicGain);
          [2, 2.52, 3, 4].forEach((m, k) => tone(root * m, beat * 0.4, 'triangle', 0.025, off + b * beat + k * beat * 0.25, null, musicGain));
          if (s.drums) { tone(70, 0.15, 'sine', 0.2, off + b * beat, 40, musicGain); noise(0.05, 0.05, 6000, off + b * beat + beat / 2, musicGain); }
        }
        next += beat * 4; bar++;
      }
    };
    sched();
    musicTimer = setInterval(sched, 400);
  }
  function stopMusic() { if (musicTimer) clearInterval(musicTimer); musicTimer = null; musicId = null; }

  BB.audio = {
    unlock() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setVolumes(m, s) { vol.music = m; vol.sfx = s; apply(); },
    play(id) {
      if (!ctx || vol.sfx <= 0 || !SFX[id]) return;
      const now = performance.now();
      if (last[id] && now - last[id] < 60) return; // evita empilhar sons iguais
      last[id] = now;
      try { SFX[id](); } catch (e) { /* áudio indisponível */ }
    },
    music(id) { if (!ctx) return; try { startMusic(id); } catch (e) { /* nada */ } },
    stopMusic,
    suspend() { if (ctx) ctx.suspend(); },
    resume() { if (ctx) ctx.resume(); },
  };
  BB.vibrate = (ms) => { if (BB.profile && BB.profile.vibration === false) return; if (window.AndroidBridge && AndroidBridge.vibrate) AndroidBridge.vibrate(ms); else if (navigator.vibrate) navigator.vibrate(ms); };
})(window.BB);
