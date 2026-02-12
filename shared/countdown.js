/**
 * Ordotype - Countdown Timer (Shared)
 * Per-user countdown using localStorage persistence.
 * Based on Memberscript #9 v0.1.
 *
 * Configuration (optional, set before loading this script):
 * window.COUNTDOWN_CONFIG = { storageKey: 'myCustomKey' };
 *
 * Required DOM elements:
 * - Time display: [ms-code-time-hour], [ms-code-time-minute], [ms-code-time-second], [ms-code-time-millisecond]
 * - Optional: [ms-code-countdown="hide-on-end"] - elements removed when countdown ends
 * - Optional: [ms-code-countdown="show-on-end"] - elements shown (display:flex) when countdown ends
 *
 * Usage:
 * <script defer src="https://cdn.jsdelivr.net/gh/william-ordotype/ordotype-scripts@main/shared/countdown.js"></script>
 */
(function() {
  'use strict';

  var PREFIX = '[Countdown]';
  var config = window.COUNTDOWN_CONFIG || {};
  var STORAGE_KEY = config.storageKey || 'countdownDateTimeStorage';
  var UPDATE_INTERVAL = 10;

  function addTime(date, unit, value) {
    var newDate = new Date(date);
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

  function getTargetDate() {
    var stored = localStorage.getItem(STORAGE_KEY);

    if (stored) {
      return new Date(stored);
    }

    var targetDate = new Date();

    var timeUnits = [
      { attr: 'ms-code-time-hour', unit: 'hour' },
      { attr: 'ms-code-time-minute', unit: 'minute' },
      { attr: 'ms-code-time-second', unit: 'second' },
      { attr: 'ms-code-time-millisecond', unit: 'millisecond' }
    ];

    timeUnits.forEach(function(item) {
      var el = document.querySelector('[' + item.attr + ']');
      if (el) {
        var value = parseInt(el.getAttribute(item.attr), 10);
        if (!isNaN(value)) {
          targetDate = addTime(targetDate, item.unit, value);
        }
      }
    });

    localStorage.setItem(STORAGE_KEY, targetDate.toISOString());
    return targetDate;
  }

  function pad(num) {
    return num < 10 ? '0' + num : num.toString();
  }

  function updateCountdown(targetDate, elements) {
    var diff = targetDate - new Date();

    if (diff > 0) {
      var hours = Math.floor(diff / (1000 * 60 * 60)) % 24;
      var minutes = Math.floor(diff / (1000 * 60)) % 60;
      var seconds = Math.floor(diff / 1000) % 60;
      var milliseconds = Math.floor(diff) % 1000;

      if (elements.hour) elements.hour.innerText = pad(hours);
      if (elements.minute) elements.minute.innerText = pad(minutes);
      if (elements.second) elements.second.innerText = pad(seconds);
      if (elements.millisecond) elements.millisecond.innerText = milliseconds.toString().padStart(3, '0').slice(0, 2);

      setTimeout(function() { updateCountdown(targetDate, elements); }, UPDATE_INTERVAL);
    } else {
      if (elements.hour) elements.hour.innerText = '00';
      if (elements.minute) elements.minute.innerText = '00';
      if (elements.second) elements.second.innerText = '00';
      if (elements.millisecond) elements.millisecond.innerText = '00';

      document.querySelectorAll('[ms-code-countdown="hide-on-end"]').forEach(function(el) {
        el.remove();
      });

      document.querySelectorAll('[ms-code-countdown="show-on-end"]').forEach(function(el) {
        el.style.display = 'flex';
      });

      console.log(PREFIX, 'Countdown ended');
    }
  }

  function init() {
    var elements = {
      hour: document.querySelector('[ms-code-time-hour]'),
      minute: document.querySelector('[ms-code-time-minute]'),
      second: document.querySelector('[ms-code-time-second]'),
      millisecond: document.querySelector('[ms-code-time-millisecond]')
    };

    if (!elements.hour && !elements.minute && !elements.second && !elements.millisecond) {
      console.log(PREFIX, 'No countdown elements found');
      return;
    }

    var targetDate = getTargetDate();
    updateCountdown(targetDate, elements);

    console.log(PREFIX, 'Initialized (key:', STORAGE_KEY + ', target:', targetDate.toISOString() + ')');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
