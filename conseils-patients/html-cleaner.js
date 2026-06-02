/**
 * Ordotype Conseils Patients - HTML Cleaner
 * Cleans zero-width characters and removes empty paragraphs.
 * Depends on: jQuery
 */
(function() {
  'use strict';

  function init() {
    $('.w-richtext, .rc-html-fcp').each(function() {
      var $this = $(this);
      var html = $this.html();

      // Clean zero-width characters
      html = html.replace(/‍["']?&zwj;["']?/gi, '');
      html = html.replace(/&zwj;|&zwnj;/g, '');
      html = html.replace(/[\u200C\u200D]/g, '');

      // Apply the cleaned HTML
      $this.html(html);

      // Remove the first paragraph if it's empty
      // (reveal-on-parse / CMS exports can leave a leading empty <p>,
      // which causes a ~10px layout shift via p { margin-bottom: 10px })
      var $firstP = $this.children('p:first-child');
      if ($firstP.length && !$.trim($firstP.text())) {
        $firstP.remove();
      }

      // Remove ONLY the last paragraph if it's empty
      var $lastP = $this.children('p:last-child');
      if ($lastP.length && !$.trim($lastP.text())) {
        $lastP.remove();
      }
    });

    console.log('[HTMLCleaner] Cleaned rich text elements');
  }

  $(document).ready(init);
})();
