/* Pont Neuf, petit bras : de l'île de la Cité à la rive gauche (quai de Conti). Cinq arches de pierre en plein
 * cintre, mêmes piles à avant-becs et demi-lunes, même corniche à mascarons que le grand bras ; le pont franchit le
 * bras en biais (les piles suivent le fil de l'eau). La chaussée et les trottoirs sont dessinés par le module de la
 * ville. Origine = point d'ancrage, au niveau de la chaussée ; l'axe du tablier est tourné de 8,4° par rapport à +z. */
import type { QualityLevel } from '@/core/contracts';
import type { MonumentDef } from '../types';
import { Builder, farMaterial, finishFar } from '../kit';
import { deckMatrix, stoneBridge, stoneBridgeFar, type StoneBridgeOpts } from '../kit/x-ponts-pierre';
import { PETIT_BRAS_ARCHES, PONT_NEUF_PETIT_BRAS, bridgeFrame, deckY, type BridgeFrame } from '../x-ponts-plan';

function bridgeOpts(f: BridgeFrame, quality: QualityLevel): StoneBridgeOpts {
  return {
    z0: f.s0, z1: f.s1, half: f.half, arches: PETIT_BRAS_ARCHES.arches, pier: PETIT_BRAS_ARCHES.pier,
    water0: f.waterY - deckY(f, f.s0), water1: f.waterY - deckY(f, f.s1), quality, demiLunes: true,
  };
}

export const def: MonumentDef = {
  key: 'pont_neuf_petit_bras',
  name: 'Pont Neuf (petit bras)',
  radius: 44,
  height: 7,
  build(site, quality) {
    const b = new Builder();
    const f = bridgeFrame(site, PONT_NEUF_PETIT_BRAS);
    b.with(deckMatrix(f, true), () => { stoneBridge(b, bridgeOpts(f, quality)); });
    return b.build('pont_neuf_petit_bras');
  },
  buildFar(site) {
    const b = new Builder();
    const f = bridgeFrame(site, PONT_NEUF_PETIT_BRAS);
    b.with(deckMatrix(f, true), () => stoneBridgeFar(b, bridgeOpts(f, 'bas'), farMaterial(0xd8cbae), farMaterial(0xa39a84, 0.5)));
    return finishFar(b, 'pont_neuf_petit_bras');
  },
};
