#!/usr/bin/env node
/**
 * Aucun `dataLayer.push` ne doit être hors d'un try/catch.
 *
 * Le balayage précédent était écrit à la main et ratait la forme
 * `(window.dataLayer = window.dataLayer || []).push(...)` : il annonçait zéro
 * alors qu'il restait un push nu dans homepage/member-redirects.js.
 *
 * Usage : node test/no-naked-datalayer-push.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['.git', 'node_modules', 'backups', 'external-backups', 'test']);
// Toute forme d'appel : window.dataLayer.push, (window.dataLayer = …).push, dl.push…
const PUSH = /(^|[^\w.])(?:window\.)?dataLayer\s*(?:=[^;]*?)?\)?\s*\.push\s*\(|\)\.push\s*\(/;

const naked = [];
(function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) continue;
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(p); continue; }
        if (!entry.name.endsWith('.js')) continue;
        const lines = fs.readFileSync(p, 'utf8').split('\n');
        lines.forEach((line, i) => {
            const s = line.trim();
            if (!s.includes('dataLayer') || !s.includes('.push')) return;
            if (s.startsWith('//') || s.startsWith('*') || s.startsWith('/*')) return;
            if (!PUSH.test(s)) return;
            if (s.includes('typeof') ) return;                 // garde, pas un appel
            if (/try\s*\{/.test(s) && /catch/.test(s)) return; // try/catch sur une ligne
            const before = lines.slice(Math.max(0, i - 30), i).join('\n');
            const opens = (before.match(/try\s*\{/g) || []).length;
            const closes = (before.match(/\}\s*catch/g) || []).length;
            if (opens > closes) return;
            naked.push(`${path.relative(ROOT, p)}:${i + 1}  ${s.slice(0, 70)}`);
        });
    }
})(ROOT);

if (naked.length) {
    console.log('pushs dataLayer NON protégés :');
    naked.forEach((n) => console.log('  ' + n));
} else {
    console.log('aucun push dataLayer non protégé');
}
process.exit(naked.length ? 1 : 0);
