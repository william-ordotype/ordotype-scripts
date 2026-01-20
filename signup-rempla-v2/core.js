/**
 * Core functionality for Signup Rempla V2
 * - Stores current URL in localStorage for tracking
 * - Adds background-avif class for non-members
 */
(function() {
    // Store location for tracking
    localStorage.setItem('locat', location.href);

    // Add background class for non-members
    if (document.readyState === 'loading') {
        document.addEventListener("DOMContentLoaded", function() {
            if (!localStorage.getItem("_ms-mem")) {
                document.body.classList.add("background-avif");
            }
        });
    } else {
        if (!localStorage.getItem("_ms-mem")) {
            document.body.classList.add("background-avif");
        }
    }
})();
