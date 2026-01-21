/**
 * Ordotype - Countdown Timer
 * User-specific countdown that persists in localStorage.
 *
 * Page: /membership/offre-annulation
 *
 * Required DOM elements:
 * - Time display: [ms-code-time-hour], [ms-code-time-minute], [ms-code-time-second], [ms-code-time-millisecond]
 * - Optional: [ms-code-countdown="hide-on-end"] - elements to hide when countdown ends
 * - Optional: [ms-code-countdown="show-on-end"] - elements to show when countdown ends
 *
 * Usage in Webflow footer:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/offre-annulation/countdown.js"></script>
 */
(function() {
  'use strict';

  const PREFIX = '[Countdown]';
  const STORAGE_KEY = 'countdownDateTime';
  const UPDATE_INTERVAL = 10; // milliseconds

  /**
   * Add time to a date
   */
  function addTime(date, unit, value) {
    const newDate = new Date(date);
    switch (unit) {
      case 'hour':
        newDate.setHours(newDate.getHours() + value);
        break;
      case 'minute':
        newDate.setMinutes(newDate.getMinutes() + value);
        break;
      case 'second':
        newDate.setSeconds(newDate.getSeconds() + value);
        break;
      case 'millisecond':
        newDate.setMilliseconds(newDate.getMilliseconds() + value);
        break;
    }
    return newDate;
  }

  /**
   * Get or create the target countdown date
   */
  function getTargetDate() {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored) {
      return new Date(stored);
    }

    // Calculate new target date from attributes
    let targetDate = new Date();

    const timeUnits = [
      { attr: 'ms-code-time-hour', unit: 'hour' },
      { attr: 'ms-code-time-minute', unit: 'minute' },
      { attr: 'ms-code-time-second', unit: 'second' },
      { attr: 'ms-code-time-millisecond', unit: 'millisecond' }
    ];

    timeUnits.forEach(({ attr, unit }) => {
      const el = document.querySelector(`[${attr}]`);
      if (el && el.hasAttribute(attr)) {
        const value = parseInt(el.getAttribute(attr), 10);
        if (!isNaN(value)) {
          targetDate = addTime(targetDate, unit, value);
        }
      }
    });

    localStorage.setItem(STORAGE_KEY, targetDate.toISOString());
    return targetDate;
  }

  /**
   * Format number with leading zero
   */
  function pad(num) {
    return num < 10 ? `0${num}` : num.toString();
  }

  /**
   * Update countdown display
   */
  function updateCountdown(targetDate, elements) {
    const now = new Date();
    const diff = targetDate - now;

    if (diff > 0) {
      // Calculate time parts
      const hours = Math.floor(diff / (1000 * 60 * 60)) % 24;
      const minutes = Math.floor(diff / (1000 * 60)) % 60;
      const seconds = Math.floor(diff / 1000) % 60;
      const milliseconds = Math.floor(diff) % 1000;

      // Update elements
      if (elements.hour) elements.hour.innerText = pad(hours);
      if (elements.minute) elements.minute.innerText = pad(minutes);
      if (elements.second) elements.second.innerText = pad(seconds);
      if (elements.millisecond) elements.millisecond.innerText = milliseconds.toString().padStart(3, '0').slice(0, 2);

      // Continue countdown
      setTimeout(() => updateCountdown(targetDate, elements), UPDATE_INTERVAL);
    } else {
      // Countdown ended
      onCountdownEnd(elements);
    }
  }

  /**
   * Handle countdown end
   */
  function onCountdownEnd(elements) {
    // Set all to zero
    if (elements.hour) elements.hour.innerText = '00';
    if (elements.minute) elements.minute.innerText = '00';
    if (elements.second) elements.second.innerText = '00';
    if (elements.millisecond) elements.millisecond.innerText = '00';

    // Hide elements marked to hide on end
    document.querySelectorAll('[ms-code-countdown="hide-on-end"]').forEach(el => {
      el.remove();
    });

    // Show elements marked to show on end
    document.querySelectorAll('[ms-code-countdown="show-on-end"]').forEach(el => {
      el.style.display = 'flex';
    });

    console.log(PREFIX, 'Countdown ended');
  }

  /**
   * Initialize
   */
  function init() {
    const elements = {
      hour: document.querySelector('[ms-code-time-hour]'),
      minute: document.querySelector('[ms-code-time-minute]'),
      second: document.querySelector('[ms-code-time-second]'),
      millisecond: document.querySelector('[ms-code-time-millisecond]')
    };

    // Check if any countdown elements exist
    if (!elements.hour && !elements.minute && !elements.second && !elements.millisecond) {
      console.log(PREFIX, 'No countdown elements found');
      return;
    }

    const targetDate = getTargetDate();
    updateCountdown(targetDate, elements);

    console.log(PREFIX, 'Initialized, target:', targetDate.toISOString());
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
