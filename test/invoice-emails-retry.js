#!/usr/bin/env node
/**
 * Vérifie la règle de relance de la lecture d'état de l'interrupteur factures.
 *
 * Ce qui doit tenir, et qu'une relecture ne suffit pas à garantir :
 *   - une requête sans réponse HTTP est rejouée UNE fois, et si la seconde
 *     tentative aboutit l'interrupteur s'affiche comme si de rien n'était ;
 *   - deux échecs de suite masquent le bloc ET remontent l'incident ;
 *   - un code de réponse attendu (401, 429, 409, 503) n'est PAS rejoué : il dit
 *     quelque chose, et le rejouer doublerait les appels sans rien changer.
 *
 * Usage : node test/invoice-emails-retry.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = 'account/invoice-emails.js';
const REAL = console;

function element(tag) {
    return {
        tagName: tag,
        id: '',
        className: '',
        textContent: '',
        style: {},
        children: [],
        firstChild: null,
        parentElement: null,
        classList: { contains: () => false, add() {}, remove() {} },
        setAttribute() {},
        addEventListener() {},
        appendChild(child) {
            this.children.push(child);
            this.firstChild = this.children[0];
            return child;
        },
    };
}

/** Rejoue une liste de dénouements, un par appel, le dernier valant pour la suite. */
function fetchStub(outcomes) {
    const calls = [];
    function fn(url, opts) {
        calls.push({ url, method: (opts && opts.method) || 'GET' });
        const outcome = outcomes[calls.length - 1] || outcomes[outcomes.length - 1];
        // Une requête qui n'a produit aucune réponse : c'est ce que rend fetch
        // quand la connexion tombe, que le préflight est refusé ou que l'onglet
        // est quitté. Pas de statut, donc rien à lire pour l'appelant.
        if (outcome.transport) return Promise.reject(new TypeError(outcome.transport));
        return Promise.resolve({
            ok: outcome.status < 400,
            status: outcome.status,
            json: () => Promise.resolve(outcome.body || {}),
        });
    }
    return { calls, fn };
}

function run(outcomes, { panneauOuvert = true, ouvrirApres = false } = {}) {
    const src = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
    // La chaîne réelle : l'ancre vit dans un Embed Webflow, lui-même dans le
    // panneau d'onglet. Le module masque les deux premiers ; c'est le troisième
    // qu'il doit observer, sans quoi il s'enferme.
    const panneau = element('div');
    const embed = element('div');
    embed.classList = { contains: (c) => c === 'w-embed', add() {}, remove() {} };
    embed.parentElement = panneau;
    const anchor = element('div');
    anchor.parentElement = embed;
    const observe = { cible: null, debranche: false };
    const pushed = [];
    const reported = [];
    const network = [];
    const stub = fetchStub(outcomes);

    const win = {
        dataLayer: { push(p) { pushed.push(p); } },
        OrdoAccount: { member: { id: 'mem_test', stripeCustomerId: 'cus_test' } },
        $memberstackDom: { getMemberCookie: () => 'jeton-de-test' },
        // Les deux voies du fichier partagé : `report` pour un incident,
        // `reportNetwork` pour une requête restée sans réponse, que le partagé
        // écarte si la page était en train de partir.
        OrdoErrorReporter: {
            report(context) { reported.push(context); },
            reportNetwork(context) { network.push(context); return true; },
        },
        setTimeout,
        clearTimeout,
        // Observateur d'intersection de fabrication maison : il retient sa cible
        // et rend son premier verdict comme le vrai, tout de suite, quand
        // l'élément est déjà visible.
        IntersectionObserver: function(cb) {
            this.observe = (cible) => {
                observe.cible = cible;
                if (panneauOuvert) setTimeout(() => cb([{ target: cible, isIntersecting: true }]), 0);
                if (ouvrirApres) setTimeout(() => cb([{ target: cible, isIntersecting: true }]), 100);
            };
            this.disconnect = () => { observe.debranche = true; };
        },
    };

    global.window = win;
    global.fetch = stub.fn;
    global.document = {
        readyState: 'complete',
        head: { appendChild() {} },
        addEventListener() {},
        removeEventListener() {},
        getElementById: (id) => (id === 'ordotype-invoice-emails' ? anchor : null),
        createElement: (tag) => element(tag),
    };
    global.console = { log() {}, warn() {}, error() {}, info() {} };
    eval(src);
    // Laisse passer l'attente entre les deux tentatives. La console n'est rendue
    // qu'ici : le module journalise depuis ses propres suites, donc après eval.
    return new Promise((resolve) => {
        setTimeout(() => {
            global.console = REAL;
            resolve({ calls: stub.calls, pushed, reported, network, anchor, embed, panneau, observe });
        }, 900);
    });
}

function hiddenReason(pushed) {
    const ev = pushed.find((p) => p && p.event === 'invoice_emails_hidden');
    return ev ? ev.invoice_hidden_reason : null;
}

const CASES = [
    {
        nom: 'on observe le panneau, JAMAIS le bloc que l on masque soi-meme',
        opts: { panneauOuvert: false },
        outcomes: [{ status: 200, body: { eligible: true, enabled: true } }],
        attendu: (r) => {
            // 🔴 L'invariant : masquer ce qu'on observe, c'est un piege qui se
            // referme. Le bloc ne redeviendrait jamais visible, la lecture ne
            // partirait jamais, pour personne, et sans aucune erreur pour le dire.
            if (r.anchor.style.display !== 'none') return 'l ancre n est pas masquee au chargement';
            if (r.embed.style.display !== 'none') return 'l Embed n est pas masque au chargement';
            if (r.observe.cible === r.anchor) return 'on observe l ancre, que l on masque';
            if (r.observe.cible === r.embed) return 'on observe l Embed, que l on masque';
            if (r.observe.cible !== r.panneau) return 'cible observee inattendue';
            return '';
        },
    },
    {
        nom: 'membre non eligible : rien ne s affiche, et l observateur se debranche',
        outcomes: [{ status: 200, body: { eligible: false } }],
        attendu: (r) => {
            if (r.anchor.children.length) return 'un interrupteur a ete rendu pour un membre non eligible';
            if (r.anchor.style.display !== 'none') return 'le bloc est reste visible';
            if (hiddenReason(r.pushed) !== 'not_eligible') return 'raison de masquage : ' + hiddenReason(r.pushed);
            if (!r.observe.debranche) return 'l observateur n a pas ete debranche';
            return '';
        },
    },
    {
        nom: 'panneau fermé : le serveur n est pas interrogé',
        opts: { panneauOuvert: false },
        outcomes: [{ status: 200, body: { eligible: true, enabled: true } }],
        attendu: (r) => {
            if (r.calls.length) return 'requête envoyée alors que le panneau est fermé';
            if (r.pushed.length) return 'un événement a été poussé sans que rien ne soit visible';
            return '';
        },
    },
    {
        nom: 'à l ouverture du panneau, la lecture part et l interrupteur s affiche',
        opts: { panneauOuvert: false, ouvrirApres: true },
        outcomes: [{ status: 200, body: { eligible: true, enabled: true } }],
        attendu: (r) => {
            if (r.calls.length !== 1) return 'attendu 1 appel après ouverture, vu ' + r.calls.length;
            if (!r.pushed.some((p) => p && p.event === 'invoice_emails_shown')) return 'interrupteur non affiché';
            if (!r.anchor.children.length) return 'rien n a été rendu dans l ancrage';
            return '';
        },
    },
    {
        nom: 'une panne de transport est rejouée, et la seconde tentative affiche',
        outcomes: [{ transport: 'Load failed' }, { status: 200, body: { eligible: true, enabled: true } }],
        attendu: (r) => {
            if (r.calls.length !== 2) return 'attendu 2 appels, vu ' + r.calls.length;
            if (r.calls.some((c) => c.method !== 'GET')) return 'la relance doit rester une lecture';
            if (!r.pushed.some((p) => p && p.event === 'invoice_emails_shown')) return 'interrupteur non affiché';
            if (!r.anchor.children.length) return 'rien n a été rendu dans l ancrage';
            if (r.reported.length || r.network.length) return 'incident remonté alors que la lecture a fini par aboutir';
            return '';
        },
    },
    {
        nom: 'deux pannes de suite masquent le bloc et remontent l incident',
        outcomes: [{ transport: 'Load failed' }, { transport: 'NetworkError' }],
        attendu: (r) => {
            if (r.calls.length !== 2) return 'attendu 2 appels, vu ' + r.calls.length;
            if (hiddenReason(r.pushed) !== 'load_error') return 'raison de masquage : ' + hiddenReason(r.pushed);
            // 🔴 Par la voie réseau, pas par report() : c'est elle qui écarte
            // une requête morte avec sa page.
            if (r.network.join() !== 'InvoiceEmails') return 'panne de transport non remontée par la voie réseau';
            if (r.reported.length) return 'une panne sans statut ne doit pas passer par report()';
            return '';
        },
    },
    {
        nom: 'un code inattendu passe par report(), pas par la voie réseau',
        outcomes: [{ status: 500, body: { error: 'boom' } }],
        attendu: (r) => {
            if (r.calls.length !== 1) return 'un code de réponse ne se rejoue pas, vu ' + r.calls.length + ' appels';
            if (r.reported.join() !== 'InvoiceEmails') return 'incident non remonté';
            if (r.network.length) return 'une réponse avec statut n est pas une panne de transport';
            return '';
        },
    },
    {
        nom: 'un code attendu n est pas rejoué, ni remonté',
        outcomes: [{ status: 401, body: { error: 'unauthorized' } }],
        attendu: (r) => {
            if (r.calls.length !== 1) return 'attendu 1 appel, vu ' + r.calls.length;
            if (hiddenReason(r.pushed) !== 'load_error') return 'raison de masquage : ' + hiddenReason(r.pushed);
            if (r.reported.length) return 'un code attendu ne doit pas sonner';
            return '';
        },
    },
];

(async () => {
    let failures = 0;
    for (const cas of CASES) {
        let why;
        try {
            why = cas.attendu(await run(cas.outcomes, cas.opts));
        } catch (e) {
            why = 'harnais : ' + e.message;
        }
        REAL.log((why ? '  KO  ' : '  OK  ') + cas.nom + (why ? '  → ' + why : ''));
        if (why) failures++;
    }
    REAL.log(failures === 0 ? '\ninvoice-emails retry : OK' : `\ninvoice-emails retry : ${failures} ÉCHEC(S)`);
    process.exit(failures === 0 ? 0 : 1);
})();
