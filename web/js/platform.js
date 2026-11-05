// Camada de plataforma: app Android / navegador comum ou CrazyGames (SDK v3).
// Na CrazyGames o progresso é salvo com o Data Module (SDK.data), que acompanha a conta do jogador;
// fora dela usa o localStorage do aparelho.
(function (BB) {
  'use strict';
  const local = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } },
    remove(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } },
  };
  let sdk = null, playing = false;

  const P = {
    name: 'web',
    storage: local,
    // inicializa o SDK quando o jogo roda na CrazyGames (o script do SDK é incluído pelo build da CrazyGames)
    async init() {
      const CG = window.CrazyGames && window.CrazyGames.SDK;
      if (!CG) return;
      try {
        await CG.init();
        sdk = CG; P.name = 'crazygames';
        if (sdk.data) P.storage = {
          get(k) { try { return sdk.data.getItem(k); } catch (e) { return local.get(k); } },
          set(k, v) { try { sdk.data.setItem(k, v); } catch (e) { local.set(k, v); } },
          remove(k) { try { sdk.data.removeItem(k); } catch (e) { local.remove(k); } },
        };
      } catch (e) { sdk = null; } // SDK indisponível (ex.: aberto fora do site): segue com localStorage
    },
    get isCrazyGames() { return !!sdk; },
    loadingStart() { try { sdk && sdk.game.loadingStart(); } catch (e) { /* nada */ } },
    loadingStop() { try { sdk && sdk.game.loadingStop(); } catch (e) { /* nada */ } },
    gameplayStart() { if (playing) return; playing = true; try { sdk && sdk.game.gameplayStart(); } catch (e) { /* nada */ } },
    gameplayStop() { if (!playing) return; playing = false; try { sdk && sdk.game.gameplayStop(); } catch (e) { /* nada */ } },
    happytime() { try { sdk && sdk.game.happytime(); } catch (e) { /* nada */ } },
  };
  BB.platform = P;
})(window.BB = window.BB || {});
