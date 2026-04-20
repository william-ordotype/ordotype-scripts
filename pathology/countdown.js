/**
 * Ordotype Pathology - Countdown
 * Displays countdown timers based on member's date-de-switch field.
 *
 * Requires:
 * - jQuery
 * - Elements with IDs: js-clock1-days, js-clock2-days, js-clock-fin-internat-days, js-clock4-days, js-clock5-days
 */
(function() {
    'use strict';

    const PREFIX = '[Countdown]';

    if (typeof jQuery === 'undefined') {
        console.warn(PREFIX, 'jQuery not found, skipping');
        return;
    }

    var ms = window.OrdoMemberstack;
    if (!ms || !ms.member || !ms.member.id) {
        console.log(PREFIX, 'No member data found');
        return;
    }

    // Helper function to add days without modifying Date.prototype
    const addDays = (date, days) => {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    };

    const switchDate = ms.safeDate('date-de-switch');
    if (!switchDate) {
        console.log(PREFIX, 'No date-de-switch found');
        return;
    }
    const deadline = addDays(switchDate, 30);
    const newDeadline = addDays(switchDate, 15);
    // Fixed deadline for the fin-internat banner (end of May 4th, Paris time)
    const finInternatDeadline = new Date('2026-05-05T00:00:00+02:00');

    // Pad numbers using padStart for clarity
    const pad = (num, size) => String(num).padStart(size, '0');

    // Calculate time remaining until a given end time
    const getTimeRemaining = endtime => {
        const total = endtime - Date.now();
        const seconds = Math.floor((total / 1000) % 60);
        const minutes = Math.floor((total / 1000 / 60) % 60);
        const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
        const days = Math.floor(total / (1000 * 60 * 60 * 24));
        return { total, days, hours, minutes, seconds };
    };

    // Initialize a clock for a given element ID and end time
    const clock = (id, endtime) => {
        const daysElem = document.getElementById(`${id}-days`);
        if (!daysElem) return;
        const timeinterval = setInterval(() => {
            const time = getTimeRemaining(endtime);
            if (time.total <= 0) {
                clearInterval(timeinterval);
                daysElem.innerHTML = pad(0, 2);
            } else {
                daysElem.innerHTML = pad(time.days, 2);
            }
        }, 1000);
    };

    clock('js-clock1', newDeadline);
    clock('js-clock2', newDeadline);
    clock('js-clock-fin-internat', finInternatDeadline);
    clock('js-clock4', newDeadline);
    clock('js-clock5', newDeadline);

    console.log(PREFIX, 'Countdowns initialized');
})();
