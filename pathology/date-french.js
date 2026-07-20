/**
 * Ordotype Pathology - Date French
 * Translates English dates/days to French.
 * Vanilla DOM — must not depend on jQuery (survives jQuery CDN failure).
 */
(function() {
  'use strict';

  const dateClass = 'dateclass';

  const translations = {
    'January': 'Janvier',
    'February': 'Février',
    'March': 'Mars',
    'April': 'Avril',
    'May': 'Mai',
    'June': 'Juin',
    'July': 'Juillet',
    'August': 'Août',
    'September': 'Septembre',
    'October': 'Octobre',
    'November': 'Novembre',
    'December': 'Décembre',
    'Monday': 'Lundi',
    'Tuesday': 'Mardi',
    'Wednesday': 'Mercredi',
    'Thursday': 'Jeudi',
    'Friday': 'Vendredi',
    'Saturday': 'Samedi',
    'Sunday': 'Dimanche'
  };

  function init() {
    const elements = document.querySelectorAll('.' + dateClass);

    elements.forEach(function(el) {
      let text = el.textContent;

      for (const [en, fr] of Object.entries(translations)) {
        const regex = new RegExp('\\b' + en + '\\b', 'gi');
        text = text.replace(regex, fr);
      }

      el.textContent = text;
    });

    console.log('[DateFrench] Translated', elements.length, 'element(s)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
