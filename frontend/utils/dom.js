// utils/dom.js

/**
 * DOM Utility Functions
 * Simple helpers for common DOM operations
 */

/**
 * Injects CSS into the document head
 * @param {string} css - CSS content to inject
 * @param {string} id - Optional unique ID for the style element
 * @returns {HTMLStyleElement} The created style element
 *
 * @example
 * injectStyle(`
 *   @keyframes fadeIn {
 *     from { opacity: 0; }
 *     to { opacity: 1; }
 *   }
 * `);
 */
export function injectStyle(css, id = null) {
    const style = document.createElement('style');
    if (id) {
        style.id = id;
    }
    style.textContent = css;
    document.head.appendChild(style);
    return style;
}

/**
 * Removes a style element by ID
 * @param {string} id - ID of the style element to remove
 * @returns {boolean} True if element was found and removed
 */
export function removeStyle(id) {
    const style = document.getElementById(id);
    if (style) {
        style.remove();
        return true;
    }
    return false;
}
