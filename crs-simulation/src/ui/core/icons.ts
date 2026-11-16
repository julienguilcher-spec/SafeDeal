/* =====================================================================================
 * Interface — pictogrammes au trait (zone 24 × 24), dessinés par le code : aucun fichier d'image.
 * Chaque entrée est le contenu d'un <svg> (tracés en « currentColor »).
 *   icon('pin')               → SVGSVGElement prêt à insérer
 *   iconMarkup('pin')         → chaîne SVG complète (pour innerHTML)
 *   itemIcon('bouclier')      → pictogramme d'un objet (repli : boîte)
 * ===================================================================================== */

const DOT = ' fill="currentColor" stroke="none"';
const CLOUD = '<path d="M7 15a4 4 0 0 1-.5-7.970A5.500 5.500 0 0 1 17.200 8a3.500 3.500 0 0 1-.2 7z"/>';
const SHIELD = '<rect x="6" y="3" width="12" height="18" rx="2.500"/><rect x="9" y="6" width="6" height="3.500" rx="1"/><path d="M12 12.500v5"/>';
const CAMERA = '<rect x="3" y="7.500" width="18" height="12" rx="2"/><circle cx="12" cy="13.500" r="3.200"/><path d="M8 7.500L9.500 5h5L16 7.500"/>';
const PLACARD = '<rect x="5" y="3" width="14" height="10" rx="1.500"/><path d="M12 13v8.500"/><path d="M8.500 6.500h7M8.500 9.500h4.500"/>';
const RADIO = `<rect x="7.500" y="8" width="9.500" height="13" rx="2"/><path d="M10 8V2.500"/><path d="M10.500 12h3.500"/><circle cx="12.250" cy="16.500" r="1.300"${DOT}/>`;
const MEGAPHONE = '<path d="M3.500 10v4l3 .700 9.500 4.300V5L6.500 9.300z"/><path d="M7 14.700l1.200 4.800h2.600l-1-3.800"/><path d="M19 9.500a3.500 3.500 0 0 1 0 5"/>';
const MASK = '<path d="M6 10a6 6 0 0 1 12 0v2.500a6 6 0 0 1-12 0z"/><circle cx="9.500" cy="10.500" r="1.700"/><circle cx="14.500" cy="10.500" r="1.700"/><rect x="10" y="15.500" width="4" height="5" rx="1"/>';
const FLAG = '<path d="M5 21.500V3.500"/><path d="M5 4.500h13l-3 4.250 3 4.250H5"/>';
const GRENADE = '<rect x="8" y="8" width="8" height="12" rx="2"/><path d="M10 8V5.500h4V8M14 5.500l3 3"/>';
const STAR = 'M12 3.500l2.500 5.200 5.700.700-4.200 4 1 5.700L12 16.400l-5 2.700 1-5.700-4.200-4 5.700-.700z';

export const ICONS = {
  // ── interface générale ──
  play: `<path d="M7.500 4.500v15l12-7.500z"${DOT}/>`,
  dice: `<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="8.500" cy="8.500" r="1.250"${DOT}/><circle cx="15.500" cy="8.500" r="1.250"${DOT}/><circle cx="12" cy="12" r="1.250"${DOT}/><circle cx="8.500" cy="15.500" r="1.250"${DOT}/><circle cx="15.500" cy="15.500" r="1.250"${DOT}/>`,
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  trash: '<path d="M4.500 7h15M9.500 7V4.500h5V7M6.500 7l1 13h9l1-13M10 10.500v6M14 10.500v6"/>',
  edit: '<path d="M4 20l1-4.500L16.500 4l3.500 3.500L8.500 19z"/><path d="M14.500 6l3.500 3.500"/>',
  gear: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.500"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M5.300 18.700l2.100-2.100M16.600 7.400l2.100-2.100"/>',
  info: `<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.600" r="1.100"${DOT}/>`,
  back: '<path d="M10 5l-7 7 7 7M3.500 12H21"/>',
  check: '<path d="M4.500 12.500l5 5L19.500 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron_right: '<path d="M9 5l7 7-7 7"/>',
  chevron_left: '<path d="M15 5l-7 7 7 7"/>',
  chevron_down: '<path d="M5 9l7 7 7-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  pin: '<path d="M12 21.500s-6.500-6.300-6.500-11a6.500 6.500 0 0 1 13 0c0 4.700-6.500 11-6.500 11z"/><circle cx="12" cy="10.500" r="2.300"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6.500V12l3.500 2.500"/>',
  crowd: '<circle cx="8" cy="8" r="2.800"/><circle cx="16.500" cy="9" r="2.300"/><path d="M2.500 19.500c0-3.300 2.500-5.500 5.500-5.500s5.500 2.200 5.500 5.500M15 14.200c3.300-.600 6.500 1.400 6.500 5.300"/>',
  pulse: '<path d="M2.500 12h4l2.500-6 4 12 2.500-6h6"/>',
  timer: '<circle cx="12" cy="13.500" r="7.500"/><path d="M12 9.500v4l2.500 1.500M9.500 2.500h5M12 2.500V6"/>',
  shield: '<path d="M12 2.500l8 3v6c0 5-3.400 8.700-8 10-4.600-1.300-8-5-8-10v-6z"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  bookmark: '<path d="M6.500 3.500h11v17l-5.500-4-5.500 4z"/>',
  megaphone: MEGAPHONE,
  radio: RADIO,
  eye: '<path d="M2 12s3.600-6.500 10-6.500S22 12 22 12s-3.600 6.500-10 6.500S2 12 2 12z"/><circle cx="12" cy="12" r="2.800"/>',
  warning: `<path d="M12 3.500l9.500 16.500h-19z"/><path d="M12 10v4.500"/><circle cx="12" cy="17.200" r="1"${DOT}/>`,
  wind: '<path d="M3 9h10.500a2.500 2.500 0 1 0-2.500-2.500M3 13h15a2.800 2.800 0 1 1-2.800 2.800M3 17h7"/>',
  arrow_up: '<path d="M12 20V4.500M6 10.500l6-6 6 6"/>',
  nav: `<path d="M12 3l6.500 17-6.500-4-6.500 4z"${DOT}/>`,
  heart: '<path d="M12 20.500s-8-4.800-8-10.700A4.300 4.300 0 0 1 12 7a4.300 4.300 0 0 1 8 2.800c0 5.900-8 10.700-8 10.700z"/>',
  bolt: '<path d="M13 2.500L5 13.500h6l-1 8 8-11h-6z"/>',
  mask: MASK,
  siren: '<path d="M4 10v4h3l4.500 3.500v-11L7 10z"/><path d="M15 9a4.200 4.200 0 0 1 0 6M17.800 6.500a8 8 0 0 1 0 11"/>',
  beacons: '<path d="M7 17.500V13a5 5 0 0 1 10 0v4.500"/><path d="M4 17.500h16v3H4z"/><path d="M12 2.500v2.500M4.500 5.500l1.800 1.800M19.500 5.500l-1.800 1.800"/>',
  headlights: '<path d="M10.500 5a7 7 0 0 0 0 14c1.400 0 2-3.100 2-7s-.600-7-2-7z"/><path d="M15.500 7.500H21M15.500 12H21M15.500 16.500H21"/>',
  handbrake: '<circle cx="12" cy="12" r="6"/><path d="M10.500 15.500v-7h2.100a2 2 0 0 1 0 4h-2.100"/><path d="M3.800 6.500a9.500 9.500 0 0 0 0 11M20.200 6.500a9.500 9.500 0 0 1 0 11"/>',
  battery: '<rect x="3" y="8" width="16" height="9" rx="2"/><path d="M21.500 11v3"/>',
  altitude: '<path d="M12 17V4.500M7 9.500l5-5 5 5M4 20.500h16"/>',
  photo: CAMERA,
  target: `<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.800"${DOT}/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>`,
  drop: '<path d="M12 3s6.500 7 6.500 11.500a6.500 6.500 0 0 1-13 0C5.500 10 12 3 12 3z"/>',
  scale: '<path d="M12 4v16M6.500 20h11M5 7h14M5 7l-2.500 6a2.800 2.800 0 0 0 5 0zM19 7l-2.500 6a2.800 2.800 0 0 0 5 0z"/>',
  flag: FLAG,
  star: `<path d="${STAR}"/>`,
  chevrons: '<path d="M5 9l7-4 7 4M5 14l7-4 7 4M5 19l7-4 7 4"/>',
  list: `<path d="M8.500 6.500h11M8.500 12h11M8.500 17.500h11"/><circle cx="4.700" cy="6.500" r="1.100"${DOT}/><circle cx="4.700" cy="12" r="1.100"${DOT}/><circle cx="4.700" cy="17.500" r="1.100"${DOT}/>`,
  flame: '<path d="M12 21.500c-3.600 0-6.500-2.600-6.500-6.300 0-3.200 2.300-4.700 3.300-7.700.5 1.500 1.200 2.300 2.200 2.800 0-3 .800-5.800 3-7.800.200 3.300 4.500 6.300 4.500 11.700 0 4.200-2.900 7.300-6.500 7.300z"/>',
  car: '<path d="M3 16.500v-4l2-5h14l2 5v4M3 16.500h18M5 12.500h14"/><circle cx="7" cy="17" r="1.800"/><circle cx="17" cy="17" r="1.800"/>',
  metro: '<circle cx="12" cy="12" r="9"/><path d="M7.500 16.500v-9l4.500 6 4.500-6v9"/>',
  hand: '<path d="M8.500 12.500V6.200a1.500 1.500 0 0 1 3 0V11"/><path d="M11.500 10.500V4.500a1.500 1.500 0 0 1 3 0V11"/><path d="M14.500 11V6.500a1.500 1.500 0 0 1 3 0v8c0 3.800-2.500 6.500-6.200 6.500-2.300 0-3.900-.900-5.100-2.700l-2.400-3.600c-.900-1.400.900-2.800 2.100-1.600l2.600 2.400"/>',
  box: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  download: '<path d="M12 3.500v12M6.500 10.500l5.500 5.500 5.500-5.500M4 20.500h16"/>',
  upload: '<path d="M12 16.500v-12M6.500 9.500L12 4l5.500 5.500M4 20.500h16"/>',
  keyboard: '<rect x="2.500" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.500 10h.01M13 10h.01M16.500 10h.01M7.500 14.500h9"/>',
  sound: '<path d="M4 10v4h3l4.500 3.500v-11L7 10z"/><path d="M15 9a4.200 4.200 0 0 1 0 6"/>',
  monitor: '<rect x="3" y="4.500" width="18" height="12" rx="2"/><path d="M9 20.500h6M12 16.500v4"/>',
  gamepad: `<path d="M7 7.500h10a4.500 4.500 0 0 1 4.500 4.500v2.500a3 3 0 0 1-5.600 1.500l-.900-1.500H9l-.900 1.500A3 3 0 0 1 2.500 14.500V12A4.500 4.500 0 0 1 7 7.500z"/><path d="M7.500 10v3M6 11.500h3"/><circle cx="16.500" cy="11.500" r="1"${DOT}/>`,
  resume: `<path d="M7.500 4.500v15l12-7.500z"/>`,
  restart: '<path d="M4.500 12a7.500 7.500 0 1 0 2.300-5.400"/><path d="M4 4.500v4.500h4.500"/>',
  exit: '<path d="M13 4H5.500v16H13"/><path d="M10 12h10.500M17 8.500l3.500 3.500-3.500 3.500"/>',
  lock: '<rect x="5.500" y="10.500" width="13" height="10" rx="2"/><path d="M8.500 10.500V8a3.500 3.500 0 0 1 7 0v2.500"/>',

  // ── météo ──
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.500V5M12 19v2.500M2.500 12H5M19 12h2.500M5.300 5.300l1.800 1.800M16.900 16.900l1.800 1.800M5.300 18.700l1.800-1.800M16.900 7.100l1.800-1.800"/>',
  moon: '<path d="M19.500 14.500A8 8 0 0 1 9.500 4.500a8 8 0 1 0 10 10z"/>',
  dusk: '<path d="M5.500 16.500a6.500 6.500 0 0 1 13 0M2.500 16.500h19M6 20h12M12 5.500V7M4.800 9.300l1.200 1.200M19.200 9.300L18 10.500"/>',
  meteo_clair: '<circle cx="12" cy="12" r="4"/><path d="M12 2.500V5M12 19v2.500M2.500 12H5M19 12h2.500M5.300 5.300l1.800 1.800M16.900 16.900l1.800 1.800M5.300 18.700l1.800-1.800M16.900 7.100l1.800-1.800"/>',
  meteo_nuageux: '<circle cx="7.500" cy="7.500" r="2.800"/><path d="M7.500 2.200v1.300M2.200 7.500h1.300M3.800 3.800l.900.900M11.200 3.800l-.900.900"/><path d="M9.500 20a3.800 3.800 0 0 1-.4-7.580A5 5 0 0 1 18.700 13.500a3.300 3.300 0 0 1-.4 6.500z"/>',
  meteo_couvert: '<path d="M7 18.500a4.500 4.500 0 0 1-.600-8.960A6 6 0 0 1 18 10.500a4 4 0 0 1-.5 8z"/>',
  meteo_pluie: `${CLOUD}<path d="M8.500 18l-1 3M12.500 18l-1 3M16.500 18l-1 3"/>`,
  meteo_averse: `${CLOUD}<path d="M7.500 17.500l-1.500 4M11 17.500l-1.500 4M14.500 17.500l-1.500 4M18 17.500l-1.500 4"/>`,
  meteo_brouillard: '<path d="M4 8h16M6 12h14M4 16h13M8 20h10"/>',
  meteo_orage: `${CLOUD}<path d="M12.500 14.500l-2.500 3.500h3.500l-2 3.500"/>`,

  // ── rôles ──
  role_crs: SHIELD,
  role_chef_groupe: '<path d="M5 8.500l7 4 7-4M5 14l7 4 7-4"/><path d="M5 4.500h14"/>',
  role_commandant: `<circle cx="12" cy="12" r="9.300"/><path d="M12 6.300l1.700 3.600 3.900.500-2.900 2.700.700 3.900L12 15.100l-3.400 1.900.700-3.900-2.900-2.700 3.900-.500z"/>`,
  role_commissaire: '<circle cx="12" cy="6" r="3"/><path d="M5 21v-3.500A5.500 5.500 0 0 1 10.500 12h3a5.500 5.500 0 0 1 5.500 5.500V21"/><path d="M8.200 12.600L15 21M11 12l7 8.500"/>',
  role_bravm: '<circle cx="5.500" cy="16.500" r="3.500"/><circle cx="18.500" cy="16.500" r="3.500"/><path d="M5.500 16.500l4-6.500h5l4 6.500M9.500 10L8 7H6M14.500 10L16 6.500h2.500M9.500 16.500H15"/>',
  role_gendarme_centaure: '<path d="M2.500 16v-5l3-4h9l3 3h3.500l.5 2.500V16"/><circle cx="6.500" cy="17" r="2.300"/><circle cx="12" cy="17" r="2.300"/><circle cx="17.500" cy="17" r="2.300"/><path d="M9 7V4.500h4.500"/>',
  role_operateur_canon_eau: '<path d="M2.500 17v-7h9v7M11.500 12h4l3 2.500V17"/><circle cx="6" cy="18" r="2"/><circle cx="15" cy="18" r="2"/><path d="M7 10V7.500l4-2"/><path d="M13 4.500c3-.500 6 .500 8.500 3" stroke-dasharray="2 2.200"/>',
  role_telepilote: '<circle cx="5.500" cy="6.500" r="3"/><circle cx="18.500" cy="6.500" r="3"/><circle cx="5.500" cy="17.500" r="3"/><circle cx="18.500" cy="17.500" r="3"/><rect x="9.500" y="9.500" width="5" height="5" rx="1.200"/><path d="M7.600 8.600l2 1.500M16.400 8.600l-2 1.500M7.600 15.400l2-1.500M16.400 15.400l-2-1.500"/>',
  role_street_medic: '<circle cx="12" cy="12" r="9"/><path d="M12 7.500v9M7.500 12h9" stroke-width="2.600"/>',
  role_secouriste: '<path d="M4 16a8 8 0 0 1 16 0"/><path d="M2.500 16h19v2.800h-19z"/><path d="M12 8V4.500M9.500 4.500h5"/><path d="M12 10.500v3.500M10.200 12.200h3.600"/>',
  role_journaliste: CAMERA,
  role_manifestant: PLACARD,

  // ── objets ──
  item_bouclier: SHIELD,
  item_baton: '<path d="M4.500 19.500L18 6M15.200 4.800l4 4"/>',
  item_tonfa: '<path d="M4 18.500L19 6M13 11l3.500 4"/>',
  item_gazeuse: '<rect x="8" y="9" width="8" height="12" rx="2"/><path d="M10 9V6.500h4V9M14 5.500h2.500"/><path d="M19 3.500v.010M20.500 5.500v.010M19 7.500v.010" stroke-width="2.200"/>',
  item_grenade_lacrymo: `${GRENADE}<path d="M10.500 12.500h3"/>`,
  item_grenade_gm2l: `${GRENADE}<path d="M8 12h8M8 16h8"/>`,
  item_grenade_desencerclement: '<circle cx="12" cy="14.500" r="6"/><path d="M10 8.800V5h4v3.800M14 5l3.500 2.500"/><path d="M12 12v5M9.500 14.500h5"/>',
  item_lanceur_cougar: '<path d="M2.500 9.500h13v4h-13zM15.500 10.500H20l1.500 6.500h-3l-1-3.500h-2M6 13.500V17"/>',
  item_lbd40: '<path d="M2.500 10.500h11v3h-11zM13.500 10h5l2.500 7h-3l-1.200-3.500h-3.300M7 13.500V17M9 10.500v-2h4"/>',
  item_pistolet: '<path d="M3.500 7H19v4h-9l-1 1.500H6.500l-1.500 7H3l1-8.500h-.500zM11 11v2.500"/>',
  item_menottes: '<circle cx="7" cy="14.500" r="4"/><circle cx="17" cy="14.500" r="4"/><path d="M10.200 12.200h3.600M7 10.500v-3M17 10.500v-3"/>',
  item_radio: RADIO,
  item_megaphone: MEGAPHONE,
  item_extincteur: '<rect x="8" y="8" width="7" height="13" rx="2"/><path d="M10 8V5.500h3V8M13 5.500h3.500l2 3M10 5.500L7.500 4M8 12.500h7"/>',
  item_lampe: '<path d="M7 3h10l-2 6v11.500H9V9z"/><path d="M12 13v2.500"/>',
  item_masque_gaz: MASK,
  item_fusee_sommation: '<path d="M12 3l3 5v8H9V8z"/><path d="M9 16l-2.500 4.500M15 16l2.500 4.500M12 16v5"/>',
  item_telecommande_drone: '<rect x="3" y="9" width="18" height="9" rx="3"/><circle cx="8" cy="13.500" r="1.800"/><circle cx="16" cy="13.500" r="1.800"/><path d="M8 9V5M16 9V5"/>',
  item_pave: '<path d="M4.500 9.500L12 6l7.500 3.500v6L12 19l-7.500-3.500z"/><path d="M4.500 9.500L12 13l7.500-3.500M12 13v6"/>',
  item_bouteille: '<path d="M10 3h4v4l2 3.500V20a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9.500L10 7z"/><path d="M8 14h8"/>',
  item_molotov: '<path d="M9.500 9h4v2.500L15 14v6a1 1 0 0 1-1 1H8.500a1 1 0 0 1-1-1v-6l2-2.500z"/><path d="M11.500 9c-1.500-2 .500-3 0-5.500 2.500 1.500 3.500 3.500 2 5.500"/>',
  item_mortier: '<path d="M5 20.500l3-9 4 1.300-3 9z"/><path d="M11.500 9.500l2-3M17.500 3v3M16 4.500h3M19 9.500l1.500 1.500"/>',
  item_fumigene: '<rect x="9.500" y="11" width="5" height="10" rx="1.200"/><path d="M12 11c0-2-2.500-2.500-1.500-4.500s3.500-1 3-3.500"/>',
  item_pancarte: PLACARD,
  item_banderole: '<path d="M4 20.500V5M20 20.500V5M4 6.500h16v7H4"/><path d="M7.500 10h9"/>',
  item_drapeau: FLAG,
  item_parapluie: '<path d="M3 12.500a9 9 0 0 1 18 0z"/><path d="M12 12.500V19a2 2 0 0 1-4 0M12 3.500v-1"/>',
  item_bombe_peinture: '<rect x="8" y="9" width="8" height="12" rx="2"/><path d="M10 9V6.500h4V9M12 6.500v-2M8 13.500h8"/>',
  item_marteau: '<path d="M5 20l8.500-8.500"/><path d="M11 6l7 7 2.500-2.500-3-3 1-1L15 3z"/>',
  item_barre: '<path d="M5 20.500L17.500 8M17.500 8c1-1.500 3-1.500 3.500-3.500M17.500 8l-2-2"/>',
  item_telephone: '<rect x="7.500" y="3" width="9" height="18" rx="2"/><path d="M11 18h2"/>',
  item_butin: '<path d="M6 9h12l1.500 11.500h-15z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/>',
  item_raquette: '<ellipse cx="14.500" cy="8.500" rx="5" ry="6" transform="rotate(35 14.500 8.500)"/><path d="M10.800 13.800L4.500 20.500"/>',
  item_trousse_secours: '<rect x="3.500" y="7.500" width="17" height="12.500" rx="2"/><path d="M9 7.500V5h6v2.500M12 10.500v6.500M8.800 13.800h6.400"/>',
  item_serum_physiologique: '<path d="M9.500 3h5v3l2 3.500V20a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V9.500l2-3.500z"/><path d="M12 12.500s2 2.200 2 3.600a2 2 0 0 1-4 0c0-1.400 2-3.600 2-3.600z"/>',
  item_brancard: '<path d="M2.500 10h19M5 10v3.500h14V10M7 13.500L5.500 18M17 13.500l1.500 4.500"/>',
  item_lance_incendie: '<path d="M3 14.500l7-3 1.500 3.500-7 3z"/><path d="M10.500 11.800l4-2.300 1.500 3.500-4 1.800"/><path d="M17.500 9.500l4-2M18 12l3.500.500M17 7l2.500-3.500"/>',
  item_appareil_photo: CAMERA,
  item_camera_tv: '<rect x="3" y="8" width="12.500" height="9.500" rx="2"/><path d="M15.500 11.500l5.500-3v8l-5.500-3"/><path d="M6.500 8V5.500h5"/>',
  item_micro: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.500 11.500a6.500 6.500 0 0 0 13 0M12 18v3.500M8.500 21.500h7"/>',
} as const;

export type IconName = keyof typeof ICONS;

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

export function hasIcon(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}

/** Chaîne SVG complète (pour innerHTML). */
export function iconMarkup(name: IconName, className = 'ui-ic'): string {
  return `<svg class="${className}" ${SVG_ATTRS}>${ICONS[name]}</svg>`;
}

/** Élément SVG prêt à insérer. */
export function icon(name: IconName, className = 'ui-ic'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = ICONS[name];
  return svg;
}

/** Nom du pictogramme d'un objet (repli : boîte). */
export function itemIconName(itemId: string): IconName {
  const key = 'item_' + itemId;
  return hasIcon(key) ? key : 'box';
}

/** Nom du pictogramme d'un rôle. */
export function roleIconName(role: string): IconName {
  const key = 'role_' + role;
  return hasIcon(key) ? key : 'shield';
}

/** Nom du pictogramme d'une météo. */
export function weatherIconName(weather: string): IconName {
  const key = 'meteo_' + weather;
  return hasIcon(key) ? key : 'meteo_couvert';
}
