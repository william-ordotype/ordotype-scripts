/**
 * Ordotype Inscription Offre Speciale - Countdown Timer
 * Countdown timer with localStorage persistence based on item slug.
 *
 * Required DOM elements:
 * - [ms-code-time-day] - Days display
 * - [ms-code-time-hour] - Hours display
 * - [ms-code-time-minute] - Minutes display
 * - [ms-code-time-second] - Seconds display
 *
 * Optional DOM elements (when countdown ends):
 * - [ms-code-countdown="hide-on-end"] - Elements to remove when timer ends
 * - [ms-code-countdown="display-on-end"] - Elements to show when timer ends
 *
 * Configuration via window.COUNTDOWN_CONFIG:
 * - slug: Item slug for localStorage key (required)
 * - expiresAutomatically: Boolean to enable hide/show on end behavior
 *
 * Usage in Webflow:
 * <script>
 * window.COUNTDOWN_CONFIG = {
 *     slug: "{{wf slug}}",
 *     expiresAutomatically: {{wf offre-qui-expire-automatiquement}}
 * };
 * </script>
 */
(function() {
    'use strict';

    const PREFIX = '[Countdown]';

    function init() {
        const config = window.COUNTDOWN_CONFIG || {};
        const slug = config.slug || '';
        const expiresAutomatically = config.expiresAutomatically || false;

        // Get countdown elements
        const dayEl = document.querySelector('[ms-code-time-day]');
        const hourEl = document.querySelector('[ms-code-time-hour]');
        const minuteEl = document.querySelector('[ms-code-time-minute]');
        const secondEl = document.querySelector('[ms-code-time-second]');

        if (!dayEl || !hourEl || !minuteEl || !secondEl) {
            console.warn(PREFIX, 'Missing countdown elements');
            return;
        }

        const countdownElements = [dayEl, hourEl, minuteEl, secondEl];
        const storageKey = `modifiedCountdownDateTimeISO-${slug}`;

        // Helper to add time to a date
        const addTime = (date, unit, value) => {
            const newDate = new Date(date);
            switch (unit) {
                case 'day':
                    newDate.setDate(newDate.getDate() + value);
                    break;
                case 'hour':
                    newDate.setHours(newDate.getHours() + value);
                    break;
                case 'minute':
                    newDate.setMinutes(newDate.getMinutes() + value);
                    break;
                case 'second':
                    newDate.setSeconds(newDate.getSeconds() + value);
                    break;
            }
            return newDate;
        };

        // Calculate target date
        let targetDate;
        const storedDate = localStorage.getItem(storageKey);

        if (storedDate) {
            targetDate = new Date(storedDate);
        } else {
            targetDate = new Date();

            // Add time from attributes
            const days = parseInt(dayEl.getAttribute('ms-code-time-day') || '0', 10);
            const hours = parseInt(hourEl.getAttribute('ms-code-time-hour') || '0', 10);
            const minutes = parseInt(minuteEl.getAttribute('ms-code-time-minute') || '0', 10);
            const seconds = parseInt(secondEl.getAttribute('ms-code-time-second') || '0', 10);

            if (!isNaN(days)) targetDate = addTime(targetDate, 'day', days);
            if (!isNaN(hours)) targetDate = addTime(targetDate, 'hour', hours);
            if (!isNaN(minutes)) targetDate = addTime(targetDate, 'minute', minutes);
            if (!isNaN(seconds)) targetDate = addTime(targetDate, 'second', seconds);

            localStorage.setItem(storageKey, targetDate.toISOString());
        }

        console.log(PREFIX, 'Target date:', targetDate.toISOString());

        // Update countdown display
        const updateCountdown = () => {
            const now = new Date();
            const diff = targetDate - now;

            if (diff > 0) {
                const timeParts = [
                    Math.floor(diff / (1000 * 60 * 60 * 24)),      // Days
                    Math.floor(diff / (1000 * 60 * 60)) % 24,      // Hours
                    Math.floor(diff / (1000 * 60)) % 60,           // Minutes
                    Math.floor(diff / 1000) % 60                   // Seconds
                ];

                countdownElements.forEach((el, i) => {
                    el.innerText = timeParts[i] < 10 ? `0${timeParts[i]}` : timeParts[i];
                });

                setTimeout(updateCountdown, 1000);
            } else {
                // Countdown ended
                countdownElements.forEach(el => {
                    el.innerText = '00';
                });

                if (expiresAutomatically) {
                    // Remove elements marked to hide on end
                    document.querySelectorAll('[ms-code-countdown="hide-on-end"]').forEach(el => {
                        el.remove();
                    });

                    // Show elements marked to display on end
                    document.querySelectorAll('[ms-code-countdown="display-on-end"]').forEach(el => {
                        el.style.display = 'block';
                    });

                    console.log(PREFIX, 'Countdown ended, elements updated');
                }
            }
        };

        updateCountdown();
        console.log(PREFIX, 'Initialized');
    }

    // Run on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
