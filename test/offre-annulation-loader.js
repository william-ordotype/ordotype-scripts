#!/usr/bin/env node
/**
 * Page d'offre d'annulation : un formulaire envoyé avant que ses scripts soient branchés ne part
 * jamais en envoi natif (page brute {"error":"invalid_json"}) ; il est retenu puis rejoué une fois
 * les scripts prêts, et passe alors par la fenêtre du motif. Si les scripts des formulaires échouent
 * ou tardent, le message d'erreur du formulaire s'affiche. Un script annexe en erreur ne bloque plus
 * les formulaires.
 *
 * Le réseau est simulé : chaque <script> ajouté par le chargeur attend qu'on le déclare chargé ou en
 * erreur ; les scripts simulés posent des écouteurs `submit` comme les vrais.
 *
 * Usage : node test/offre-annulation-loader.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const LOADER = fs.readFileSync(path.join(ROOT, 'offre-annulation/loader.js'), 'utf8');
const BASE = 'https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/';

const GABARIT = `<!doctype html><html><head>
  <script src="${BASE}offre-annulation/loader.js"></script></head><body>
  <form id="redeem-form" action="https://webhooks.ordotype.fr/.netlify/functions/member-forms" method="POST"><button type="submit">Offre</button></form>
  <div id="waiting-message-redeem" style="display:none"></div><div id="error-message-redeem" style="display:none"></div>
  <form id="pause-form" action="https://webhooks.ordotype.fr/.netlify/functions/member-forms" method="POST"><button type="submit">Pause</button></form>
  <div id="waiting-message-pause" style="display:none"></div><div id="error-message-pause" style="display:none"></div>
  <form id="cancel-form" action="https://webhooks.ordotype.fr/.netlify/functions/member-forms" method="POST"><button type="submit">Non merci</button></form>
  <div id="waiting-message-cancel" style="display:none"></div><div id="error-message-cancel" style="display:none"></div>
</body></html>`;

// Comme en ligne : l'offre -50 % dans son bloc `.inscr-p_actions`.
const GABARIT_BLOC = GABARIT
  .replace('<form id="redeem-form"', '<div class="inscr-p_actions" id="offre"><form id="redeem-form"')
  .replace('<div id="error-message-redeem" style="display:none"></div>', '<div id="error-message-redeem" style="display:none"></div></div>');
assert.notStrictEqual(GABARIT_BLOC, GABARIT);

const tick = () => new Promise((r) => setTimeout(r, 0));
async function flush() { for (let i = 0; i < 20; i++) await tick(); }

function page(options = {}) {
  const natifs = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => { if (/not implemented/i.test(e.message)) natifs.push(e.message); });
  const dom = new JSDOM(options.bloc ? GABARIT_BLOC : GABARIT, { url: 'https://www.ordotype.fr/membership/offre-annulation', runScripts: 'outside-only', virtualConsole });
  const w = dom.window; const d = w.document;
  const rapports = [];
  w.OrdoErrorReporter = { report: (nom, err) => rapports.push(err.name) };
  w.console.log = () => {}; w.console.error = () => {};
  // Minuterie de la garde (15 s) déclenchée à la main.
  const minuteries = [];
  w.setTimeout = (fn, ms) => { minuteries.push({ fn, ms }); return minuteries.length; };
  w.clearTimeout = (id) => { if (minuteries[id - 1]) minuteries[id - 1].fn = null; };
  const traites = [];
  // Brancher comme les vrais scripts : écouteur puis marqueur `data-ordo-bound`.
  const brancher = (id) => {
    const f = d.getElementById(id);
    f.addEventListener('submit', (e) => { e.preventDefault(); traites.push(id); });
    f.setAttribute('data-ordo-bound', '');
  };
  const differes = [];
  const comportement = {
    'shared/redeem-cancel-forms.js': () => {
      const go = () => ['redeem-form', 'cancel-form'].forEach(brancher);
      if (options.brancherTard) differes.push(go); else go();
    },
    'offre-annulation/pause-form.js': () => brancher('pause-form'),
    // Offre en cours : décide tout de suite si le test le demande, comme après la réponse du serveur.
    'offre-annulation/current-offer.js': () => {
      const bloc = d.getElementById('offre');
      if (options.decision && bloc) { bloc.setAttribute('data-ordo-offer', options.decision); bloc.style.visibility = ''; }
    },
    // Fenêtre du motif : coupe le premier envoi (capture), puis laisse passer le second.
    'offre-annulation/cancel-reason-modal.js': () => {
      let passe = false;
      d.getElementById('cancel-form').addEventListener('submit', (e) => {
        if (passe) return;
        e.preventDefault(); e.stopImmediatePropagation(); traites.push('motif');
        passe = true;
      }, true);
    },
  };
  const attente = new Map();
  const head = d.head;
  const ajouter = head.appendChild.bind(head);
  head.appendChild = (n) => {
    if (n.tagName !== 'SCRIPT') return ajouter(n);
    const nom = n.src.replace(/^.*ordotype-scripts@[^/]+\//, '');
    attente.set(nom, n);
    return n;
  };
  const charger = async (nom, issue = 'ok') => {
    for (let i = 0; i < 40 && !attente.has(nom); i++) await tick();
    const n = attente.get(nom); assert.ok(n, 'script demandé : ' + nom);
    attente.delete(nom);
    if (issue === 'ok') { if (comportement[nom]) comportement[nom](); n.onload(); } else n.onerror();
    await flush();
  };
  const tout = async (sauf = {}) => {
    for (const nom of ['offre-annulation/cancel-reason-modal.js', 'shared/memberstack-utils.js', 'shared/error-reporter.js', 'offre-annulation/current-offer.js', 'shared/opacity-reveal.js',
      'shared/countdown.js', 'offre-annulation/session-stats.js', 'offre-annulation/pause-form.js', 'shared/redeem-cancel-forms.js']) {
      await charger(nom, sauf[nom] || 'ok');
    }
  };
  // jsdom émet lui-même DOMContentLoaded : le chargeur s'initialise une seule fois, comme en vrai.
  w.eval(LOADER);
  const visible = (id) => d.getElementById(id).style.display === 'block';
  const clic = (id) => d.querySelector('#' + id + ' button').click();
  const brancherMaintenant = async () => { differes.splice(0).forEach((f) => f()); await flush(); };
  const demandes = () => Array.from(attente.keys());
  return { w, d, natifs, traites, rapports, minuteries, charger, tout, visible, clic, brancherMaintenant, demandes };
}

async function ouvrir(options) {
  const p = page(options);
  await flush();
  return p;
}

(async () => {
  // 1. Clic sur l'offre avant les scripts : retenu, « Patientez » affiché, rejoué une fois prêt.
  {
    const p = await ouvrir();
    p.clic('redeem-form');
    await flush();
    assert.deepStrictEqual(p.natifs, [], 'aucun envoi natif');
    assert.ok(p.visible('waiting-message-redeem'), 'attente affichée');
    await p.tout();
    assert.deepStrictEqual(p.traites, ['redeem-form'], 'rejoué une seule fois par le script');
    assert.ok(!p.visible('waiting-message-redeem'));
    assert.deepStrictEqual(p.natifs, []);
  }
  // 2. « Non merci » avant les scripts : rejoué via la fenêtre du motif.
  {
    const p = await ouvrir();
    p.clic('cancel-form');
    await p.tout();
    assert.deepStrictEqual(p.traites, ['motif'], 'la fenêtre du motif intercepte le rejeu');
    assert.deepStrictEqual(p.natifs, []);
  }
  // 3. Script des formulaires en erreur : message d'erreur, jamais d'envoi natif, rapport.
  {
    const p = await ouvrir();
    p.clic('cancel-form');
    await p.tout({ 'shared/redeem-cancel-forms.js': 'erreur' });
    assert.ok(p.visible('error-message-cancel'), 'erreur affichée pour l\'envoi retenu');
    assert.ok(!p.visible('waiting-message-cancel'));
    p.clic('redeem-form'); await flush();
    assert.ok(p.visible('error-message-redeem'), 'erreur aussi pour un clic après l\'échec');
    assert.deepStrictEqual(p.natifs, []);
    assert.ok(p.rapports.includes('FormScriptsFailed'));
  }
  // 4. Un script annexe en erreur (compte à rebours) ne bloque plus les formulaires.
  {
    const p = await ouvrir();
    await p.tout({ 'shared/countdown.js': 'erreur' });
    p.clic('pause-form'); await flush();
    assert.deepStrictEqual(p.traites, ['pause-form']);
    assert.deepStrictEqual(p.natifs, []);
  }
  // 5. Scripts muets : au bout de 15 s, l'envoi retenu affiche l'erreur.
  {
    const p = await ouvrir();
    p.clic('redeem-form'); await flush();
    const garde = p.minuteries.find((m) => m.ms === 15000 && m.fn);
    assert.ok(garde, 'minuterie de 15 s posée');
    garde.fn(); await flush();
    assert.ok(p.visible('error-message-redeem'));
    assert.ok(p.rapports.includes('FormsNotReady'));
    assert.deepStrictEqual(p.natifs, []);
    // Les scripts finissent par arriver : un nouveau clic passe normalement.
    await p.tout();
    p.clic('redeem-form'); await flush();
    assert.deepStrictEqual(p.traites, ['redeem-form']);
  }
  // 7. Script chargé mais formulaires branchés plus tard (Memberstack lent) : le clic attend le marqueur.
  {
    const p = await ouvrir({ brancherTard: true });
    await p.tout();
    p.clic('redeem-form'); await flush();
    assert.deepStrictEqual(p.traites, [], 'pas encore branché : retenu');
    assert.ok(p.visible('waiting-message-redeem'));
    assert.deepStrictEqual(p.natifs, []);
    await p.brancherMaintenant();
    assert.deepStrictEqual(p.traites, ['redeem-form'], 'rejoué dès le branchement');
    assert.ok(!p.visible('waiting-message-redeem'));
  }
  // 8. Le script de l'offre échoue, celui de la pause non : la pause marche, l'offre affiche son erreur.
  {
    const p = await ouvrir();
    await p.tout({ 'shared/redeem-cancel-forms.js': 'erreur' });
    p.clic('pause-form'); p.clic('redeem-form'); await flush();
    assert.deepStrictEqual(p.traites, ['pause-form']);
    assert.ok(p.visible('error-message-redeem'));
    assert.ok(!p.visible('error-message-pause'));
    assert.deepStrictEqual(p.natifs, []);
  }
  // 9. Bloc de l'offre -50 % : masqué (place gardée) dès le chargeur, rendu à current-offer.js.
  {
    const p = await ouvrir({ bloc: true, decision: 'current' });
    const bloc = () => p.d.getElementById('offre');
    assert.strictEqual(bloc().style.visibility, 'hidden', 'masqué avant tout script');
    assert.notStrictEqual(bloc().style.display, 'none', 'sa place est gardée');
    await p.tout();
    assert.strictEqual(bloc().style.visibility, '', 'rendu par current-offer.js');
    const filet = p.minuteries.find((m) => m.ms === 10000 && m.fn);
    assert.ok(filet, 'filet de 10 s posé');
    bloc().style.visibility = 'hidden'; // ce que le script aurait laissé, décision prise : le filet n'y touche pas
    filet.fn(); await flush();
    assert.strictEqual(bloc().style.visibility, 'hidden');
  }
  // 10. current-offer.js ne se charge pas : le bloc réapparaît aussitôt, les formulaires marchent.
  {
    const p = await ouvrir({ bloc: true });
    await p.tout({ 'offre-annulation/current-offer.js': 'erreur' });
    assert.strictEqual(p.d.getElementById('offre').style.visibility, '');
    p.clic('redeem-form'); await flush();
    assert.deepStrictEqual(p.traites, ['redeem-form']);
  }
  // 11. current-offer.js chargé mais sans décision : le filet de 10 s réaffiche le bloc.
  {
    const p = await ouvrir({ bloc: true });
    await p.tout();
    assert.strictEqual(p.d.getElementById('offre').style.visibility, 'hidden');
    p.minuteries.find((m) => m.ms === 10000 && m.fn).fn(); await flush();
    assert.strictEqual(p.d.getElementById('offre').style.visibility, '');
  }
  // 13. current-offer.js part dès l'ouverture, en parallèle, sans attendre la file des autres scripts.
  {
    const p = await ouvrir({ bloc: true });
    const d = p.demandes();
    assert.ok(d.includes('offre-annulation/current-offer.js'), 'demandé avant tout chargement : ' + d.join(', '));
    assert.ok(d.includes('offre-annulation/cancel-reason-modal.js'));
    assert.ok(!d.includes('shared/opacity-reveal.js'), 'la file, elle, attend');
  }
  // 12. Page sans bloc (gabarit ancien) : rien n'est masqué, aucun filet posé.
  {
    const p = await ouvrir();
    assert.ok(!p.minuteries.some((m) => m.ms === 10000));
  }
  // 6. Une fois prêts, la garde ne s'interpose plus.
  {
    const p = await ouvrir();
    await p.tout();
    p.clic('redeem-form'); p.clic('pause-form'); await flush();
    assert.deepStrictEqual(p.traites, ['redeem-form', 'pause-form']);
    assert.ok(!p.visible('waiting-message-redeem'));
  }
  console.log('offre-annulation-loader : OK');
})().catch((e) => { console.error(e); process.exit(1); });
