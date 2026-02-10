/**
 * Ordotype Homepage - Countdown
 * Displays countdown timers based on member's date-de-switch field.
 *
 * Requires:
 * - jQuery
 * - Elements with IDs: js-clock1-days, js-clock5-days, js-clock6-days, js-clock7-days, js-clock8-days
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

    // Base date from custom field "date-de-switch"
    const baseDate = ms.safeDate('date-de-switch');
    if (!baseDate) {
        console.log(PREFIX, 'No date-de-switch found');
        return;
    }

    // Calculate new deadline by adding 15 days to the base date
    const newdeadline = new Date(baseDate);
    newdeadline.setDate(newdeadline.getDate() + 15);

    // Define a fixed deadline for js-clock1
    const fixedDeadline = new Date("2025-11-03");

    // Calculate the number of remaining days until the given end time
    const getDaysRemaining = endTime => {
        const total = endTime - Date.now();
        return Math.floor(total / (1000 * 60 * 60 * 24));
    };

    // Update the element with the id `${id}-days` with the remaining days
    const updateClock = (id, endTime) => {
        const element = document.getElementById(`${id}-days`);
        if (element) {
            const daysRemaining = getDaysRemaining(endTime);
            element.innerHTML = daysRemaining >= 0 ? daysRemaining : "00";
        }
    };

    // Update clocks using the newdeadline
    updateClock('js-clock5', newdeadline);
    updateClock('js-clock6', newdeadline);
    updateClock('js-clock7', newdeadline);
    updateClock('js-clock8', newdeadline);

    // Update js-clock1 with the fixed deadline
    updateClock('js-clock1', fixedDeadline);

    console.log(PREFIX, 'Countdowns initialized');
})();
