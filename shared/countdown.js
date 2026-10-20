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
 * - Optional unit label: <span> inside `.spacing-left` in the same `.time` box as the number
 *   (heures / minutes / secondes). When present, the number has no leading zero and the label
 *   agrees with it (1 minute, 2 minutes). Without it, the number keeps two digits (00:15:00).
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

  // Libellé Webflow de l'unité : le <span> du bloc .spacing-left voisin, dans la même case .time
  // que le chiffre (page /membership/gerer-son-offre-de-stockage). null s'il n'y en a pas.
  function findLabel(el) {
    var box = el && el.closest ? el.closest('.time') : null;
    return box ? box.querySelector('.spacing-left span') : null;
  }

  // Avec un libellé : chiffre sans zéro devant et libellé accordé (« 1 minute », « 2 minutes »,
  // 0 et 1 au singulier). Sans libellé (affichage « 00:15:00 ») : deux chiffres, comme avant.
  function setUnit(el, label, value, singular, plural) {
    if (!el) return;
    if (!label) {
      el.textContent = pad(value);
      return;
    }
    el.textContent = String(value);
    var text = value > 1 ? plural : singular;
    if (label.textContent !== text) label.textContent = text;
  }

  function updateCountdown(targetDate, elements) {
    var diff = targetDate - new Date();
    var labels = elements.labels;

    if (diff > 0) {
      var hours = Math.floor(diff / (1000 * 60 * 60)) % 24;
      var minutes = Math.floor(diff / (1000 * 60)) % 60;
      var seconds = Math.floor(diff / 1000) % 60;
      var milliseconds = Math.floor(diff) % 1000;

      setUnit(elements.hour, labels.hour, hours, 'heure', 'heures');
      setUnit(elements.minute, labels.minute, minutes, 'minute', 'minutes');
      setUnit(elements.second, labels.second, seconds, 'seconde', 'secondes');
      if (elements.millisecond) elements.millisecond.innerText = milliseconds.toString().padStart(3, '0').slice(0, 2);

      setTimeout(function() { updateCountdown(targetDate, elements); }, UPDATE_INTERVAL);
    } else {
      setUnit(elements.hour, labels.hour, 0, 'heure', 'heures');
      setUnit(elements.minute, labels.minute, 0, 'minute', 'minutes');
      setUnit(elements.second, labels.second, 0, 'seconde', 'secondes');
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

    elements.labels = {
      hour: findLabel(elements.hour),
      minute: findLabel(elements.minute),
      second: findLabel(elements.second)
    };

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
