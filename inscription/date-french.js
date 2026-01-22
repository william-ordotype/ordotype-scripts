/**
 * Ordotype Inscription - Date French Converter
 * Converts English dates to French format in CMS content.
 *
 * Targets elements with class: .text-link-body1.text-weight-semibold.w-embed
 * Converts "Month DD, YYYY" to "DD mois YYYY" with "Valable jusqu'au" prefix.
 */
(function() {
    'use strict';

    const PREFIX = '[DateFrench]';

    const FRENCH_MONTHS = [
        'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
    ];

    /**
     * Convert English date string to French format
     * @param {string} dateStr - Date in "Month DD, YYYY" format
     * @returns {string} - Date in "DD mois YYYY" format
     */
    function convertToFrench(dateStr) {
        const [engMonth, day, year] = dateStr.split(/[\s,]+/);
        const monthIndex = new Date(dateStr).getMonth();

        if (!isNaN(monthIndex)) {
            return `${day} ${FRENCH_MONTHS[monthIndex]} ${year}`;
        } else {
            console.error(PREFIX, `Invalid month: ${engMonth}`);
            return dateStr;
        }
    }

    /**
     * Convert all CMS date elements on the page
     */
    function convertAllDates() {
        const dateElements = document.querySelectorAll('.text-link-body1.text-weight-semibold.w-embed');
        let converted = 0;

        dateElements.forEach(element => {
            const dateMatch = element.innerText.match(/[\w]+ [\d]{2}, [\d]{4}/);
            if (dateMatch) {
                element.innerText = `Valable jusqu'au ${convertToFrench(dateMatch[0])}`;
                converted++;
            }
        });

        if (converted > 0) {
            console.log(PREFIX, `Converted ${converted} date(s)`);
        }
    }

    // Run after page load to ensure CMS content is ready
    window.addEventListener('load', convertAllDates);
})();
