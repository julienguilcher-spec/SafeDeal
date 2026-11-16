/* =====================================================================================
 * CARTE DE PARIS — MONUMENTS modélisés à la main
 * -------------------------------------------------------------------------------------
 * Entrée : raw/normalized/landmarks.geojson (43 emprises pour 40 monuments).
 * Le format exige une clé UNIQUE par entrée. Un monument en plusieurs morceaux donne donc
 * plusieurs entrées : la première garde la clé d'origine, les suivantes reçoivent une clé
 * propre (tableau PART_KEYS). Pour les fontaines de la Concorde, la seconde clé est un alias
 * déjà connu de src/world/monuments/keys.ts : les deux entrées mènent au même modèle.
 * ===================================================================================== */
import { M, readLayer, projectPolygons, simplifyRing, orientedBox, signedArea, round1 } from './build-lib.mjs';

/**
 * Azimut APPROXIMATIF (degrés depuis le nord, sens horaire) vers lequel regarde la façade
 * principale. Valeurs de docs/research/04-paris-lieux-monuments.md (§ 3.0) quand elles existent,
 * sinon estimation (marquée `guess`). Le cap final est l'axe du rectangle englobant de l'emprise
 * le plus proche de cet azimut : la donnée ne sert qu'à choisir entre les quatre côtés.
 */
const FACADE_AZIMUTH = {
  arc_triomphe: 115, tour_eiffel: 314, obelisque_concorde: 116, fontaines_concorde: 116, louvre: 291,
  pyramide_louvre: 291, arc_carrousel: 296, notre_dame: 296.5, sainte_chapelle: 299, conciergerie: 28,
  opera_garnier: 164, invalides: 4, grand_palais: 89, petit_palais: 275, pont_alexandre_iii: 181, madeleine: 206,
  palais_bourbon: 23, hotel_de_ville: 290, opera_bastille: 320, statue_republique: 225, palais_chaillot: 134,
  ecole_militaire: 314, centre_pompidou: 290, palais_royal: 200, hotel_marine: 206, hotel_crillon: 206,
  palais_justice: 118,
};
const FACADE_GUESS = {
  colonne_vendome: 205, colonne_juillet: 270, tour_saint_jacques: 180, bourse_commerce: 250, palais_elysee: 26,
  saint_eustache: 285, saint_sulpice: 281, pont_neuf: 200, institut_de_france: 15, musee_orsay: 22,
  gare_saint_lazare: 170, prefecture_police: 28, hotel_matignon: 20,
};
/** Emprises rondes ou carrées sans façade : l'azimut est appliqué tel quel. */
const NO_SNAP = new Set(['obelisque_concorde', 'fontaines_concorde', 'colonne_vendome', 'colonne_juillet', 'statue_republique', 'bourse_commerce', 'tour_eiffel']);

/**
 * Noms publiés à la place de celui de la source. L'aile ouest des palais de Gabriel porte dans la
 * source le nom du palace qui l'occupe : c'est une enseigne commerciale, la carte ne la publie pas
 * (docs/research/04-paris-lieux-monuments.md, § 0.3). La clé, elle, reste celle du lot B.
 */
const NEUTRAL_NAMES = { hotel_crillon: 'Hôtel de la place de la Concorde (palais de Gabriel, aile ouest)' };

/** Clé et nom de chaque morceau d'un monument en plusieurs morceaux, dans l'ordre choisi par `order`. */
const PART_KEYS = {
  fontaines_concorde: {
    // du nord au sud
    order: (a, b) => a.cz - b.cz,
    parts: [
      { key: 'fontaines_concorde', name: 'Fontaine des Fleuves' },
      { key: 'fontaine_des_mers', name: 'Fontaine des Mers' },
    ],
  },
  palais_chaillot: {
    // d'est en ouest : aile de Paris, puis aile de Passy
    order: (a, b) => b.cx - a.cx,
    parts: [
      { key: 'palais_chaillot', name: 'Palais de Chaillot — aile de Paris' },
      { key: 'palais_chaillot_passy', name: 'Palais de Chaillot — aile de Passy' },
    ],
  },
  pont_neuf: {
    // du plus grand au plus petit : grand bras (rive droite), puis petit bras (rive gauche)
    order: (a, b) => b.area - a.area,
    parts: [
      { key: 'pont_neuf', name: 'Pont Neuf — grand bras' },
      { key: 'pont_neuf_petit_bras', name: 'Pont Neuf — petit bras' },
    ],
  },
};

/**
 * Lit les monuments et fixe, pour chaque morceau : clé de sortie, nom, emprise simplifiée,
 * ancrage (centre du rectangle englobant) et cap.
 */
export function loadLandmarkParts() {
  const fc = readLayer('landmarks');
  const groups = new Map();
  for (const f of fc.features) {
    const p = f.properties;
    const polys = projectPolygons(f.geometry);
    if (polys.length !== 1) throw new Error(`monument « ${p.key} » : un polygone attendu, ${polys.length} reçu(s)`);
    const ring = simplifyRing(polys[0].outer, 0.3);
    const box = orientedBox(ring);
    const part = {
      baseKey: p.key, key: p.key, name: NEUTRAL_NAMES[p.key] ?? p.name, ring, box, cx: box.cx, cz: box.cz, area: Math.abs(signedArea(ring)),
      sourceIds: p.sourceIds ?? [], height: p.height ?? null, heightSource: p.heightSource ?? null,
      isBridge: /^pont_/.test(p.key), srcPart: p.part ?? null,
    };
    const list = groups.get(p.key);
    if (list === undefined) groups.set(p.key, [part]);
    else list.push(part);
  }
  const parts = [];
  for (const [baseKey, list] of groups) {
    if (list.length > 1) {
      const rule = PART_KEYS[baseKey];
      if (rule === undefined || rule.parts.length !== list.length) throw new Error(`monument « ${baseKey} » : ${list.length} morceaux sans règle de nommage (PART_KEYS)`);
      list.sort(rule.order);
      for (let i = 0; i < list.length; i++) { list[i].key = rule.parts[i].key; list[i].name = rule.parts[i].name; }
    }
    for (const part of list) {
      const guess = FACADE_AZIMUTH[baseKey] === undefined;
      const az = FACADE_AZIMUTH[baseKey] ?? FACADE_GUESS[baseKey];
      if (az === undefined) throw new Error(`monument « ${baseKey} » : azimut de façade inconnu (FACADE_AZIMUTH)`);
      // Azimut -> cap du jeu : h = π − azimut.
      let heading = Math.PI - (az * Math.PI) / 180;
      let snapped = false;
      if (!NO_SNAP.has(baseKey) && part.box.length > 1) {
        // Les quatre directions du rectangle englobant ; on garde la plus proche du cap approximatif.
        const base = M.headingOf(part.box.ux, part.box.uz);
        let best = heading, bestDiff = Infinity;
        for (let k = 0; k < 4; k++) {
          const h = base + (k * Math.PI) / 2;
          const d = Math.abs(Math.atan2(Math.sin(h - heading), Math.cos(h - heading)));
          if (d < bestDiff) { bestDiff = d; best = h; }
        }
        // Au-delà de 25° d'écart, l'emprise n'a pas de côté franc dans cette direction : on garde l'azimut.
        if (bestDiff <= (25 * Math.PI) / 180) {
          heading = Math.atan2(Math.sin(best), Math.cos(best));
          snapped = true;
        }
      }
      part.heading = heading;
      part.headingInfo = { azimuthApprox: az, guess, snappedToFootprint: snapped, azimuthFinal: round1((((Math.PI - heading) * 180) / Math.PI + 720) % 360) };
      parts.push(part);
    }
  }
  const seen = new Set();
  for (const p of parts) {
    if (seen.has(p.key)) throw new Error(`monument : clé en double « ${p.key} »`);
    seen.add(p.key);
  }
  return parts;
}

/** Entrées de landmarks.json. Un pont sans hauteur connue reçoit celle de son tablier au-dessus de l'eau. */
export function buildLandmarks(parts, ctx) {
  const out = [];
  const report = [];
  for (const p of parts) {
    const y = ctx.heightAt(p.cx, p.cz);
    let height = p.height, heightSource = p.heightSource;
    if (!(height > 0)) {
      height = round1(Math.max(3, y - ctx.waterLevel + 1.1));
      heightSource = 'tablier + parapet au-dessus du plan d\'eau (calculé)';
    }
    out.push({ key: p.key, name: p.name, x: p.cx, z: p.cz, y, heading: p.heading, height, footprint: p.ring });
    report.push({
      key: p.key, name: p.name, x: round1(p.cx), z: round1(p.cz), y: round1(y), height, heightSource,
      areaM2: Math.round(p.area), vertices: p.ring.length >> 1, buildings: p.sourceIds.length, ...p.headingInfo,
    });
  }
  return { list: out, report };
}
