/**
 * Ordotype Pathology - Date French
 * Translates English dates/days to French.
 * Depends on: jQuery
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
    const elements = $('.' + dateClass);

    elements.each(function() {
      let text = $(this).text();

      for (const [en, fr] of Object.entries(translations)) {
        const regex = new RegExp('\\b' + en + '\\b', 'gi');
        text = text.replace(regex, fr);
      }

      $(this).text(text);
    });

    console.log('[DateFrench] Translated', elements.length, 'element(s)');
  }

  $(document).ready(init);
})();
