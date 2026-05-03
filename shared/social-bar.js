/**
 * GFD Social Awareness Bar — dismiss logic
 *
 * Reads localStorage on DOMContentLoaded; hides bar if previously dismissed.
 * On close button click: adds 'social-bar-gone' to <html>, saves to localStorage.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'gfd_social_bar_dismissed';

  function initSocialBar() {
    var bar = document.getElementById('social-bar');
    var btn = document.getElementById('social-bar-close');

    if (!bar || !btn) { return; }

    // Already dismissed — ensure class is present (belt-and-suspenders over inline script)
    if (localStorage.getItem(STORAGE_KEY) === '1') {
      document.documentElement.classList.add('social-bar-gone');
      return;
    }

    btn.addEventListener('click', function () {
      document.documentElement.classList.add('social-bar-gone');
      try {
        localStorage.setItem(STORAGE_KEY, '1');
      } catch (e) { /* private browsing — silently fail */ }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSocialBar);
  } else {
    initSocialBar();
  }
}());
