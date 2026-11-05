// Idiomas: textos em strings.js. Nenhum texto de interface fica fixo no código.
(function (BB) {
  'use strict';
  const LANGS = [{ id: 'pt', name: 'Português (Brasil)' }, { id: 'en', name: 'English' }];
  let cur = 'pt';
  BB.LANGS = LANGS;
  BB.setLang = function (id) { cur = BB.STRINGS[id] ? id : 'en'; document.documentElement.lang = cur === 'pt' ? 'pt-BR' : 'en'; };
  BB.lang = () => cur;
  BB.detectLang = () => (/^pt/i.test(navigator.language || '') ? 'pt' : 'en');
  // T('chave', a, b...) substitui {0}, {1}...
  BB.T = function (key) {
    let s = (BB.STRINGS[cur] && BB.STRINGS[cur][key]) || (BB.STRINGS.en && BB.STRINGS.en[key]) || key;
    for (let i = 1; i < arguments.length; i++) s = s.split('{' + (i - 1) + '}').join(arguments[i]);
    return s;
  };
  BB.cardName = (id) => BB.T('card.' + id + '.name');
  BB.playerName = (p) => (!p.playerName || p.playerName === 'Barão' || p.playerName === 'Baron' ? BB.T('ui.default_name') : p.playerName);
  BB.baronName = (id) => BB.T('baron.' + id + '.name');
  BB.castleName = (id) => BB.T('castle.' + id + '.name');
})(window.BB);
