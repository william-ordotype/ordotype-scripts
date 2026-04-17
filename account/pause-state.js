/**
 * Ordotype Account - Pause State
 * Detects if the member has a paused subscription (via Memberstack metaData)
 * and shows the "En pause" card on the account page with Resume + Cancel buttons.
 *
 * Depends on: core.js (window.OrdoAccount, window.OrdoMemberstack)
 *
 * Reads metaData:
 *   - pause-end-date: ISO date string (e.g. "2026-10-17")
 *   - paused-group-key: Memberstack group key (e.g. "bouton-compte-praticien-only")
 *
 * Expected DOM (Webflow):
 *   - #pause-state-card (hidden by default, display:none)
 *   - #pause-plan-label (text: plan name)
 *   - #pause-resume-date (text: formatted date)
 *   - #resume-btn (button)
 *   - #cancel-definitive-btn (button)
 *   - #pause-member-id (hidden input)
 *   - #pause-action-waiting, #pause-action-success, #pause-action-error (messages)
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
        'bouton-compte-praticien-only': 'Module MG - Compte Praticien',
        'interne-img-and-ft': 'Module MG - Compte Interne',
        'btn-asso-interne-only': 'Module MG - Compte Interne adhérent',
        'rhumatologie-paid-plan': 'Module Rhumatologie',
        'soins-palliatifs-paid-plan': 'Module Soins palliatifs',
        'btn-ide-only': 'Module MG - Compte IDE',
        'compte-praticien': 'Module MG - Compte Praticien'
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

        // Populate and show the card
        var card = document.getElementById('pause-state-card');
        var labelEl = document.getElementById('pause-plan-label');
        var dateEl = document.getElementById('pause-resume-date');
        var memberIdInput = document.getElementById('pause-member-id');

        if (!card) {
            console.warn(PREFIX, 'No #pause-state-card found in DOM');
            return;
        }

        if (labelEl) labelEl.textContent = planLabel;
        if (dateEl) dateEl.textContent = 'Reprise automatique le ' + formattedDate;
        if (memberIdInput) memberIdInput.value = memberId;

        card.classList.remove('hidden');
        card.style.display = '';
        console.log(PREFIX, 'Showing pause card:', planLabel, 'until', formattedDate);

        // Bind buttons
        var resumeBtn = document.getElementById('resume-btn');
        var cancelBtn = document.getElementById('cancel-definitive-btn');

        if (resumeBtn) {
            resumeBtn.addEventListener('click', function(e) {
                e.preventDefault();
                handleAction(RESUME_WEBHOOK, 'Votre abonnement a été réactivé !');
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', function(e) {
                e.preventDefault();
                if (confirm('Êtes-vous sûr de vouloir annuler définitivement votre abonnement ?')) {
                    handleAction(CANCEL_DEFINITIVE_WEBHOOK, 'Votre abonnement a été annulé.');
                }
            });
        }
    }

    function handleAction(webhookUrl, successMessage) {
        var resumeBtn = document.getElementById('resume-btn');
        var cancelBtn = document.getElementById('cancel-definitive-btn');
        var waiting = document.getElementById('pause-action-waiting');
        var success = document.getElementById('pause-action-success');
        var error = document.getElementById('pause-action-error');
        var memberId = document.getElementById('pause-member-id').value;

        // Hide buttons, show waiting
        if (resumeBtn) resumeBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (waiting) waiting.style.display = 'block';
        if (error) error.style.display = 'none';

        var xhr = new XMLHttpRequest();
        xhr.open('POST', webhookUrl);
        xhr.timeout = REQUEST_TIMEOUT;
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');

        xhr.onload = function() {
            if (waiting) waiting.style.display = 'none';
            if (xhr.status === 200) {
                if (success) {
                    success.textContent = successMessage;
                    success.style.display = 'block';
                }
                setTimeout(function() { window.location.reload(); }, REDIRECT_DELAY);
            } else {
                showError();
            }
        };

        xhr.onerror = function() {
            if (waiting) waiting.style.display = 'none';
            showError();
        };

        xhr.ontimeout = function() {
            if (waiting) waiting.style.display = 'none';
            showError();
        };

        function showError() {
            if (error) error.style.display = 'block';
            if (resumeBtn) resumeBtn.style.display = '';
            if (cancelBtn) cancelBtn.style.display = '';
        }

        xhr.send('memberId=' + encodeURIComponent(memberId) + '&pageUrl=' + encodeURIComponent(window.location.href));
    }

    // Init after DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
