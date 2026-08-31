/**
 * GFD Social Awareness Bar — dismiss logic + founder connection links
 *
 * Reads localStorage on DOMContentLoaded; hides bar if previously dismissed.
 * On close button click: adds 'social-bar-gone' to <html>, saves to localStorage.
 * Also exposes the founder's LinkedIn profile in public, high-intent connection areas.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'gfd_social_bar_dismissed';
  var FOUNDER_LINKEDIN = 'https://www.linkedin.com/in/weaverbrett/';

  function makeFounderLink(text, className, ariaLabel) {
    var link = document.createElement('a');
    link.href = FOUNDER_LINKEDIN;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = text;
    if (className) link.className = className;
    if (ariaLabel) link.setAttribute('aria-label', ariaLabel);
    link.setAttribute('data-founder-linkedin', 'true');
    return link;
  }

  function addFounderLinks() {
    if (document.querySelector('[data-founder-linkedin]')) return;

    var socialLinks = document.querySelector('.social-bar-links');
    if (socialLinks) {
      socialLinks.appendChild(makeFounderLink(
        'IN',
        'social-bar-link',
        'Connect with founder Brett Weaver on LinkedIn (opens in new tab)'
      ));
    }

    var contactDetails = document.querySelector('#contact .contact-details');
    if (contactDetails) {
      var contactItem = document.createElement('div');
      contactItem.className = 'contact-item';

      var icon = document.createElement('span');
      icon.className = 'icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = 'in';

      var contactLink = makeFounderLink(
        'Connect with founder Brett Weaver on LinkedIn',
        '',
        'Connect with founder Brett Weaver on LinkedIn (opens in new tab)'
      );

      contactItem.appendChild(icon);
      contactItem.appendChild(contactLink);
      contactDetails.appendChild(contactItem);
    }

    var footerLinks = document.querySelector('.footer-links');
    if (footerLinks) {
      footerLinks.appendChild(makeFounderLink(
        'Founder on LinkedIn',
        '',
        'Connect with founder Brett Weaver on LinkedIn (opens in new tab)'
      ));
    }
  }

  function initSocialBar() {
    var bar = document.getElementById('social-bar');
    var btn = document.getElementById('social-bar-close');

    addFounderLinks();

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
