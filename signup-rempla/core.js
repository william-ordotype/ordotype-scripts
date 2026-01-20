/**
 * Core functionality for Signup Rempla
 * - Stores current URL in localStorage for tracking
 * - Adds background-avif class for non-members
 */
(function() {
    const PREFIX = '[OrdoSignupRempla]';

    // Store location for tracking
    localStorage.setItem('locat', location.href);
    console.log(PREFIX, 'Stored location:', location.href);

    // Add background class for non-members
    document.addEventListener("DOMContentLoaded", function() {
        if (!localStorage.getItem("_ms-mem")) {
            document.body.classList.add("background-avif");
            console.log(PREFIX, 'Added background-avif class (non-member)');
        }
    });
})();
