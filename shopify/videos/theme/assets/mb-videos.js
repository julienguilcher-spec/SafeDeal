/* Maison Bosoni — les vidéos.
 *
 * La vignette est un simple bouton avec l'image de YouTube : tant qu'on n'a
 * pas cliqué, rien ne charge de chez YouTube et aucun cookie n'est déposé.
 * Au clic, on remplace la vignette par le lecteur sans cookie
 * (youtube-nocookie.com), qui démarre tout seul. */
(function () {
  'use strict';

  function lancer(bouton) {
    const id = bouton.dataset.youtubeId;
    if (!id) return;
    const titre = bouton.getAttribute('aria-label') || 'Vidéo';
    const cadre = document.createElement('div');
    cadre.className = 'mb-video__player';
    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0&modestbranding=1&hl=fr';
    iframe.title = titre.replace(/^Lire la vidéo\s*:\s*/, '');
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    cadre.appendChild(iframe);
    bouton.replaceWith(cadre);
    iframe.focus();
  }

  function armer(racine) {
    (racine || document).querySelectorAll('[data-mb-video]').forEach(function (b) {
      if (b.__arme) return;
      b.__arme = true;
      b.addEventListener('click', function () { lancer(b); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { armer(); });
  else armer();

  // l'éditeur de thème recharge les sections à la volée
  document.addEventListener('shopify:section:load', function (e) { armer(e.target); });
})();
