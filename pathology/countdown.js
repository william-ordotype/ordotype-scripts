/**
 * Ordotype Pathology - Countdown
 * Displays countdown timers based on member's date-de-switch field.
 *
 * Requires:
 * - jQuery
 * - Elements with IDs: js-clock1-days, js-clock2-days, js-clock3-days, js-clock4-days, js-clock5-days
 */
(function() {
    'use strict';

    const PREFIX = '[Countdown]';

    if (typeof jQuery === 'undefined') {
        console.warn(PREFIX, 'jQuery not found, skipping');
        return;
    }

    const memString = localStorage.getItem('_ms-mem');
    if (!memString) {
        console.log(PREFIX, 'No member data found');
        return;
    }

    const member = JSON.parse(memString);
    if (!member) {
        console.log(PREFIX, 'Could not parse member data');
        return;
    }

    // Helper function to add days without modifying Date.prototype
    const addDays = (date, days) => {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    };

    const switchDate = new Date(member.customFields["date-de-switch"]);
    const deadline = addDays(switchDate, 30);
    const newDeadline = addDays(switchDate, 15);
    const endSummer22 = new Date('2025-11-03T00:00:00');

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
    clock('js-clock3', endSummer22);
    clock('js-clock4', newDeadline);
    clock('js-clock5', newDeadline);

    console.log(PREFIX, 'Countdowns initialized');
})();
