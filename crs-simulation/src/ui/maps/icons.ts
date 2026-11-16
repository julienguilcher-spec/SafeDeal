/* =====================================================================================
 * Pictogrammes au trait (zone 24 × 24), en SVG en ligne : aucun fichier d'image.
 * ===================================================================================== */

const PATHS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  locate: '<circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12.500l9 5 9-5M3 16.500l9 5 9-5"/>',
  search: '<circle cx="10.500" cy="10.500" r="6.500"/><path d="M15.300 15.300l5.200 5.200"/>',
  pin: '<path d="M12 21.500c-4-5.200-6-8.300-6-11a6 6 0 0 1 12 0c0 2.700-2 5.800-6 11z"/><circle cx="12" cy="10.500" r="2.200"/>',
  units: '<rect x="3.500" y="7" width="17" height="11" rx="1.500"/><path d="M3.500 7l17 11M20.500 7l-17 11"/>',
  orders: '<path d="M5 21.500V3.500"/><path d="M5 4.500h13l-3 4.250 3 4.250H5"/>',
  alert: '<path d="M12 3.500l9.500 16.500h-19z"/><path d="M12 10v4.500"/><circle cx="12" cy="17.300" r="1" fill="currentColor" stroke="none"/>',
  road: '<path d="M8 3L4.500 21M16 3l3.500 18"/><path d="M12 4v3M12 10.500v3M12 17v3"/>',
  radio: '<rect x="7.500" y="8" width="9.500" height="13" rx="2"/><path d="M10 8V2.500"/><path d="M10.500 12h3.500"/><circle cx="12.250" cy="16.500" r="1.300" fill="currentColor" stroke="none"/>',
  select: '<path d="M4 4h4M4 4v4M20 4h-4M20 4v4M4 20h4M4 20v-4M20 20h-4M20 20v-4"/>',
  hand: '<path d="M8.500 12.500V6.200a1.500 1.500 0 0 1 3 0V11"/><path d="M11.500 10.500V4.500a1.500 1.500 0 0 1 3 0V11"/><path d="M14.500 11V6.500a1.500 1.500 0 0 1 3 0v8c0 3.800-2.500 6.500-6.200 6.500-2.300 0-3.900-.9-5.100-2.700l-2.400-3.600c-.9-1.400.9-2.800 2.100-1.600l2.600 2.400"/>',
  slow: '<circle cx="12" cy="13" r="7.500"/><path d="M12 13V8.500M12 13l3 2M9.500 2.500h5"/>',
  chevron: '<path d="M9 5.500l6.500 6.500L9 18.500"/>',
  down: '<path d="M5.500 9l6.500 6.500L18.500 9"/>',
  arrow: '<path d="M12 20V4.500M5.500 11L12 4.500l6.500 6.500"/>',
  phone: '<path d="M6.500 3.500h3l1.500 4.500-2 1.500c1 2.300 2.700 4 5 5l1.500-2 4.500 1.500v3c0 1.100-.9 2-2 2C10.500 19 5 13.500 4.500 5.500c0-1.100.9-2 2-2z"/>',
  metro: '<circle cx="12" cy="12" r="9"/><path d="M7.500 16.500v-9l4.500 6 4.500-6v9"/>',
  barrier: '<path d="M3 9h18v5H3z"/><path d="M6 14v6M18 14v6M7 9l3 5M12 9l3 5M17 9l3 5"/>',
  check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>',
  flag: '<path d="M6 21V4"/><path d="M6 5h11l-2.500 3.500L17 12H6"/>',
  fire: '<path d="M12 3c4 4.500 6 7.500 6 11a6 6 0 0 1-12 0c0-2 1-3.800 2.500-5 .2 2 1 3 2 3.500C10 9.500 10.500 6 12 3z"/>',
  cross: '<path d="M9.500 4h5v5.500H20v5h-5.500V20h-5v-5.500H4v-5h5.500z"/>',
  list: '<path d="M8.500 6.500H20M8.500 12H20M8.500 17.500H20"/><circle cx="4.500" cy="6.500" r="1" fill="currentColor" stroke="none"/><circle cx="4.500" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.500" cy="17.500" r="1" fill="currentColor" stroke="none"/>',
  megaphone: '<path d="M4 10v4l3 .800 9.500 4.200V5L7 9.200z"/><path d="M7.500 15v3.500h3V16"/><path d="M19.500 9.500a4 4 0 0 1 0 5"/>',
  shield: '<path d="M12 3l7.500 2.500v6c0 4.500-3 7.800-7.500 9.500-4.500-1.700-7.500-5-7.500-9.500v-6z"/>',
  drone: '<rect x="9.500" y="9.500" width="5" height="5" rx="1.200"/><path d="M9.500 9.500L7 7M14.500 9.500L17 7M9.500 14.500L7 17M14.500 14.500L17 17"/><circle cx="5.500" cy="5.500" r="2.500"/><circle cx="18.500" cy="5.500" r="2.500"/><circle cx="5.500" cy="18.500" r="2.500"/><circle cx="18.500" cy="18.500" r="2.500"/>',
  eye: '<path d="M2.500 12c2.500-4.500 5.800-6.500 9.500-6.500s7 2 9.500 6.500c-2.500 4.500-5.800 6.500-9.500 6.500s-7-2-9.500-6.500z"/><circle cx="12" cy="12" r="2.800"/>',
} as const;

export type IconName = keyof typeof PATHS;

/** Balise SVG d'un pictogramme (couleur du texte courant). */
export function icon(name: IconName, size = 18): string {
  return `<svg class="cm-ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}

/** Crée un élément avec classe et texte éventuels. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Bouton des écrans de carte et de commandement (souris, doigt, manette par le groupe de focus). */
export function button(
  label: string, onClick: () => void, opts?: { icon?: IconName; className?: string; title?: string; id?: string },
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cm-btn' + (opts?.className ? ' ' + opts.className : '');
  if (opts?.icon) b.innerHTML = icon(opts.icon);
  if (label !== '') {
    const span = document.createElement('span');
    span.className = 'cm-btn-t';
    span.textContent = label;
    b.appendChild(span);
  }
  if (opts?.title) {
    b.title = opts.title;
    if (label === '') b.setAttribute('aria-label', opts.title);
  }
  if (opts?.id) b.dataset.id = opts.id;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** N'écrit le texte que s'il change (pas de travail de mise en page inutile). */
export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Bascule une classe seulement si nécessaire. */
export function setClass(node: HTMLElement, name: string, on: boolean): void {
  if (node.classList.contains(name) !== on) node.classList.toggle(name, on);
}
