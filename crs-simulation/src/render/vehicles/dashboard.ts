/* Tableau de bord dessiné sur canvas : compteur de vitesse, compte-tours, rapport, voyants (phares,
 * gyrophares, sirène, frein à main, clignotants, alerte moteur). Redessiné seulement quand l'affichage change,
 * au plus 20 fois par seconde. */

import * as THREE from 'three';
import type { Vehicle } from '@/core/contracts';
import { indicatorOn } from './beacons';
import { dashSignature, gearLabel, needleAngle, rpmFraction, speedKmh, speedoMax } from './dashlogic';
import type { DashFlags } from './dashlogic';

const W = 512, H = 256;
const FONT = '"Arial Narrow", Arial, "Liberation Sans Narrow", "DejaVu Sans Condensed", sans-serif';

export class Dashboard {
  readonly texture: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private signature = -1;
  private since = 1;
  private readonly flags: DashFlags = { headlights: false, beacons: false, siren: false, handbrake: false, left: false, right: false, engineWarning: false, engineOn: false };
  /** Nombre de redessins (mesure). */
  redraws = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  update(v: Vehicle, blink: number, night: number, dt: number): void {
    this.since += dt;
    const f = this.flags;
    const on = indicatorOn(blink);
    f.headlights = v.headlights;
    f.beacons = v.beacons;
    f.siren = v.siren !== 0;
    f.handbrake = v.cmd.handbrake;
    f.left = v.indicator < 0 && on;
    f.right = v.indicator > 0 && on;
    f.engineWarning = v.state !== 'ok' || v.health < 50;
    f.engineOn = v.engineOn;
    const kmh = speedKmh(v.speed);
    const rpmF = rpmFraction(v.rpm, v.speed, v.def.maxSpeed, v.engineOn);
    const gear = gearLabel(v.gear, v.speed, v.engineOn);
    const sig = dashSignature(kmh, rpmF, gear, f, night > 0.5);
    if (sig === this.signature || this.since < 0.05) return;
    this.signature = sig;
    this.since = 0;
    this.draw(kmh, rpmF, gear, speedoMax(v.def.maxSpeed), night > 0.5 || v.headlights);
    this.texture.needsUpdate = true;
    this.redraws++;
  }

  private dial(cx: number, cy: number, r: number, max: number, step: number, label: string, value: number, lit: boolean, redFrom: number): void {
    const g = this.g;
    const ink = lit ? '#eaf6ff' : '#d9dde2';
    g.fillStyle = '#0a0c0f';
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = lit ? '#3a6ea8' : '#4a4f57'; g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, r - 1.5, 0, Math.PI * 2); g.stroke();
    // graduations
    const count = Math.round(max / step);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i <= count * 2; i++) {
      const a = needleAngle(i / (count * 2));
      const major = i % 2 === 0;
      const r0 = r - (major ? 16 : 10), r1 = r - 5;
      const red = (i / (count * 2)) >= redFrom;
      g.strokeStyle = red ? '#ff4a3a' : ink; g.lineWidth = major ? 3 : 1.5;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
      if (major) {
        g.fillStyle = red ? '#ff6a5a' : ink;
        g.font = `700 ${r > 80 ? 17 : 15}px ${FONT}`;
        g.fillText(String(Math.round((i / 2) * step)), cx + Math.cos(a) * (r - 31), cy + Math.sin(a) * (r - 31));
      }
    }
    g.fillStyle = lit ? '#8fc4ff' : '#9aa0a8';
    g.font = `700 13px ${FONT}`;
    g.fillText(label, cx, cy + r * 0.42);
    // aiguille
    const a = needleAngle(value);
    g.strokeStyle = '#ff5a2a'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - Math.cos(a) * 12, cy - Math.sin(a) * 12); g.lineTo(cx + Math.cos(a) * (r - 20), cy + Math.sin(a) * (r - 20)); g.stroke();
    g.fillStyle = '#1c1e22'; g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#555a62'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.stroke();
  }

  private lampIcon(x: number, y: number, w: number, label: string, on: boolean, color: string): void {
    const g = this.g;
    g.fillStyle = on ? color : '#15171a';
    g.strokeStyle = on ? color : '#30343a';
    g.lineWidth = 1.5;
    const h = 26;
    g.beginPath();
    g.roundRect(x - w / 2, y - h / 2, w, h, 5);
    g.fill(); g.stroke();
    g.fillStyle = on ? '#07090c' : '#3d424a';
    g.font = `700 13px ${FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, x, y + 1);
  }

  private draw(kmh: number, rpmF: number, gear: string, max: number, lit: boolean): void {
    const g = this.g;
    const f = this.flags;
    g.fillStyle = '#050607';
    g.fillRect(0, 0, W, H);
    // compteur de vitesse (gauche), compte-tours (droite)
    this.dial(118, 112, 104, max, max > 140 ? 20 : 10, 'km/h', Math.min(1, kmh / max), lit, 2);
    this.dial(394, 112, 104, 8, 1, '×1000 tr/min', rpmF * 0.75, lit, 0.75);
    // afficheur central : vitesse numérique et rapport
    g.fillStyle = '#0c1014';
    g.beginPath(); g.roundRect(216, 52, 80, 96, 8); g.fill();
    g.strokeStyle = '#2b3138'; g.lineWidth = 2; g.stroke();
    g.fillStyle = lit ? '#9fd4ff' : '#cfd6dd';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 40px ${FONT}`;
    g.fillText(String(kmh), 256, 84);
    g.font = `700 12px ${FONT}`;
    g.fillStyle = '#7d8791';
    g.fillText('km/h', 256, 110);
    g.font = `700 24px ${FONT}`;
    g.fillStyle = gear === 'R' ? '#ff6a4a' : '#e8ecef';
    g.fillText(gear, 256, 132);
    // clignotants
    const arrow = (x: number, dir: number, on: boolean): void => {
      g.fillStyle = on ? '#3fe05a' : '#17201a';
      g.beginPath();
      g.moveTo(x + dir * 14, 22); g.lineTo(x - dir * 2, 10); g.lineTo(x - dir * 2, 17); g.lineTo(x - dir * 14, 17);
      g.lineTo(x - dir * 14, 27); g.lineTo(x - dir * 2, 27); g.lineTo(x - dir * 2, 34);
      g.closePath(); g.fill();
    };
    arrow(236, -1, f.left);
    arrow(276, 1, f.right);
    // rangée de voyants
    const y = 232;
    this.lampIcon(60, y, 86, 'PHARES', f.headlights, '#3f9bff');
    this.lampIcon(160, y, 86, 'GYRO', f.beacons, '#2f6bff');
    this.lampIcon(260, y, 86, 'SIRÈNE', f.siren, '#ffb020');
    this.lampIcon(360, y, 86, 'FREIN', f.handbrake, '#ff3b30');
    this.lampIcon(452, y, 78, 'MOTEUR', f.engineWarning || !f.engineOn, f.engineOn ? '#ffb020' : '#ff3b30');
  }

  dispose(): void {
    this.texture.dispose();
  }
}
