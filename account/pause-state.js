/**
 * Ordotype Account - Pause State
 * Detects if the member has a paused subscription (via Memberstack metaData)
 * and injects an "En pause" card on the account page with Resume + Cancel buttons.
 *
 * Depends on: core.js (window.OrdoAccount, window.OrdoMemberstack)
 *
 * Reads metaData:
 *   - pause-end-date: ISO date string (e.g. "2026-10-17")
 *   - paused-group-key: Memberstack group key (e.g. "bouton-compte-praticien-only")
 *
 * Expected DOM:
 *   - Container: #subscriptions-section (where subscription cards live)
 *
 * Make webhook URLs (set as form actions in the injected HTML):
 *   - Resume: posted by #resume-form
 *   - Cancel definitively: posted by #cancel-definitive-form
 */
(function() {
    'use strict';

    var PREFIX = '[PauseState]';
    var RESUME_WEBHOOK = 'PLACEHOLDER_RESUME_WEBHOOK';
    var CANCEL_DEFINITIVE_WEBHOOK = 'PLACEHOLDER_CANCEL_DEFINITIVE_WEBHOOK';
    var REDIRECT_DELAY = 3000;
    var REQUEST_TIMEOUT = 10000;

    // Group key → display label mapping
    var GROUP_LABELS = {
        'bouton-compte-praticien-only': 'Module Médecine Générale (FR)',
        'interne-img-and-ft': 'Module MG - Compte Interne',
        'btn-asso-interne-only': 'Module MG - Compte Interne adhérent',
        'rhumatologie-paid-plan': 'Module Rhumatologie',
        'soins-palliatifs-paid-plan': 'Module Soins palliatifs',
        'btn-ide-only': 'Module MG - Compte IDE',
        'compte-praticien': 'Module Médecine Générale (FR)'
    };

    function init() {
        var ms = window.OrdoMemberstack;
        if (!ms || !ms.metaData) {
            console.log(PREFIX, 'No metaData, skipping');
            return;
        }

        var pauseEndDate = ms.metaData['pause-end-date'];
        var pausedGroupKey = ms.metaData['paused-group-key'];

        if (!pauseEndDate || !pausedGroupKey) {
            console.log(PREFIX, 'No pause data found');
            return;
        }

        var endDate = new Date(pauseEndDate);
        if (isNaN(endDate.getTime()) || endDate <= new Date()) {
            console.log(PREFIX, 'Pause expired or invalid date:', pauseEndDate);
            return;
        }

        var formattedDate = endDate.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        var planLabel = GROUP_LABELS[pausedGroupKey] || 'Abonnement';
        var memberId = ms.memberId || '';

        console.log(PREFIX, 'Member has paused sub:', planLabel, 'until', formattedDate);

        injectPauseCard(planLabel, formattedDate, memberId);
    }

    function injectPauseCard(planLabel, formattedDate, memberId) {
        // Find the subscriptions section to prepend the card
        var target = document.querySelector('[data-pause-target]')
            || document.getElementById('subscriptions-section')
            || document.querySelector('.account-subscriptions');

        if (!target) {
            console.warn(PREFIX, 'No target container found for pause card');
            return;
        }

        var card = document.createElement('div');
        card.id = 'pause-state-card';
        card.style.cssText = 'background:#fff;border:2px solid #2563eb;border-radius:12px;padding:24px;margin-bottom:20px;';

        card.innerHTML = ''
            + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'
            + '  <div style="font-size:16px;font-weight:600;color:#1a2b4a;">' + planLabel + '</div>'
            + '  <span style="background:#eef4ff;color:#2563eb;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;">En pause</span>'
            + '</div>'
            + '<p style="font-size:14px;color:#666;margin:0 0 16px;line-height:1.5;">'
            + '  Votre abonnement est en pause. Il sera réactivé automatiquement le <strong style="color:#1a2b4a;">' + formattedDate + '</strong>.'
            + '</p>'
            + '<div style="display:flex;gap:12px;flex-wrap:wrap;">'
            + '  <button id="resume-btn" class="button is-gradient" style="flex:1;min-width:200px;cursor:pointer;">Reprendre mon abonnement</button>'
            + '  <button id="cancel-definitive-btn" class="button is-grey" style="flex:1;min-width:200px;cursor:pointer;">Annuler définitivement</button>'
            + '</div>'
            + '<div id="pause-action-waiting" style="display:none;text-align:center;padding:12px;color:#666;">Traitement en cours...<br><span style="font-size:13px;">Ne fermez pas cette page.</span></div>'
            + '<div id="pause-action-success" style="display:none;text-align:center;padding:12px;color:#16a34a;font-weight:600;"></div>'
            + '<div id="pause-action-error" style="display:none;text-align:center;padding:12px;color:#dc2626;">Une erreur est survenue. Veuillez réessayer ou nous contacter.</div>'
            + '<input type="hidden" id="pause-member-id" value="' + memberId + '">';

        target.insertBefore(card, target.firstChild);

        // Bind buttons
        document.getElementById('resume-btn').addEventListener('click', function() {
            handleAction(RESUME_WEBHOOK, 'Votre abonnement a été réactivé !');
        });

        document.getElementById('cancel-definitive-btn').addEventListener('click', function() {
            if (confirm('Êtes-vous sûr de vouloir annuler définitivement votre abonnement ?')) {
                handleAction(CANCEL_DEFINITIVE_WEBHOOK, 'Votre abonnement a été annulé.');
            }
        });

        console.log(PREFIX, 'Pause card injected');
    }

    function handleAction(webhookUrl, successMessage) {
        var card = document.getElementById('pause-state-card');
        var btns = card.querySelectorAll('button');
        var waiting = document.getElementById('pause-action-waiting');
        var success = document.getElementById('pause-action-success');
        var error = document.getElementById('pause-action-error');
        var memberId = document.getElementById('pause-member-id').value;

        // Hide buttons, show waiting
        btns.forEach(function(b) { b.style.display = 'none'; });
        waiting.style.display = 'block';
        error.style.display = 'none';

        var xhr = new XMLHttpRequest();
        xhr.open('POST', webhookUrl);
        xhr.timeout = REQUEST_TIMEOUT;
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');

        xhr.onload = function() {
            waiting.style.display = 'none';
            if (xhr.status === 200) {
                success.textContent = successMessage;
                success.style.display = 'block';
                setTimeout(function() {
                    window.location.reload();
                }, REDIRECT_DELAY);
            } else {
                error.style.display = 'block';
                btns.forEach(function(b) { b.style.display = 'block'; });
            }
        };

        xhr.onerror = function() {
            waiting.style.display = 'none';
            error.style.display = 'block';
            btns.forEach(function(b) { b.style.display = 'block'; });
        };

        xhr.ontimeout = function() {
            waiting.style.display = 'none';
            error.style.display = 'block';
            btns.forEach(function(b) { b.style.display = 'block'; });
        };

        xhr.send('memberId=' + encodeURIComponent(memberId) + '&pageUrl=' + encodeURIComponent(window.location.href));
    }

    // Init after OrdoAccount is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
