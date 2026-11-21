/* =====================================================================================
 * RENDU DU DÉCOR — peinture des étalages de vitrine (un par catégorie de commerce), de
 * l'intérieur pillé et de l'intérieur calciné. Chaque peintre dessine dans un repère de
 * w × h pixels logiques (256 × 192), ce qu'on voit à travers la vitre : mur, sol, mobilier,
 * marchandise. Aucune marque : formes génériques et libellés neutres.
 * ===================================================================================== */

export type G = CanvasRenderingContext2D;
export type Painter = (g: G, w: number, h: number, rnd: () => number) => void;

export function hex(c: number): string {
  return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
}

function grad(g: G, x0: number, y0: number, x1: number, y1: number, a: string, b: string): CanvasGradient {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, a);
  gr.addColorStop(1, b);
  return gr;
}

/** Mur du fond, sol, léger vignettage : la base de tous les intérieurs. */
function room(g: G, w: number, h: number, wallTop: string, wallBottom: string, floor: string, floorH = 0.2): void {
  g.fillStyle = grad(g, 0, 0, 0, h, wallTop, wallBottom);
  g.fillRect(0, 0, w, h);
  g.fillStyle = floor;
  g.fillRect(0, h * (1 - floorH), w, h * floorH);
  g.fillStyle = grad(g, 0, h * (1 - floorH), 0, h, 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0)');
  g.fillRect(0, h * (1 - floorH), w, h * floorH);
  const v = g.createRadialGradient(w / 2, h * 0.45, h * 0.3, w / 2, h * 0.5, w * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.33)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}

function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}

function spot(g: G, x: number, y: number, r: number, color = 'rgba(255,240,210,0.5)'): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

function mannequin(g: G, x: number, y: number, s: number, top: string, bottom: string): void {
  g.fillStyle = '#d9d2c6';
  g.beginPath();
  g.ellipse(x, y - 78 * s, 7 * s, 9 * s, 0, 0, 7);
  g.fill();
  g.fillRect(x - 2.5 * s, y - 70 * s, 5 * s, 6 * s);
  g.fillStyle = top;
  g.beginPath();
  g.moveTo(x - 15 * s, y - 64 * s);
  g.lineTo(x + 15 * s, y - 64 * s);
  g.lineTo(x + 12 * s, y - 30 * s);
  g.lineTo(x - 12 * s, y - 30 * s);
  g.fill();
  g.fillRect(x - 20 * s, y - 63 * s, 6 * s, 30 * s);
  g.fillRect(x + 14 * s, y - 63 * s, 6 * s, 30 * s);
  g.fillStyle = bottom;
  g.fillRect(x - 12 * s, y - 31 * s, 11 * s, 31 * s);
  g.fillRect(x + 1 * s, y - 31 * s, 11 * s, 31 * s);
  g.fillStyle = '#3a3a3a';
  g.fillRect(x - 13 * s, y - 1, 26 * s, 3);
}

function shelves(g: G, x: number, y: number, w: number, h: number, rows: number, rnd: () => number, palette: readonly string[], board = '#c9c2b4'): void {
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const yy = y + r * rh;
    let xx = x + 2;
    while (xx < x + w - 6) {
      const bw = 5 + rnd() * 9, bh = rh * (0.45 + rnd() * 0.4);
      g.fillStyle = palette[Math.floor(rnd() * palette.length)]!;
      g.fillRect(xx, yy + rh - 3 - bh, bw, bh);
      xx += bw + 1 + rnd() * 2;
    }
    g.fillStyle = board;
    g.fillRect(x, yy + rh - 3, w, 3);
  }
}

const mode: Painter = (g, w, h, rnd) => {
  room(g, w, h, '#efe9df', '#d9d1c4', '#8a7a66');
  // portant au fond
  g.fillStyle = '#6a6a6a';
  g.fillRect(150, 52, 96, 3);
  const cl = ['#b23a48', '#2a4d69', '#e0c080', '#3f6b4a', '#22252a', '#d98fa5', '#f0efe9'];
  for (let i = 0; i < 9; i++) {
    g.fillStyle = cl[i % cl.length]!;
    g.fillRect(154 + i * 10, 56, 8, 52 + rnd() * 22);
  }
  spot(g, 60, 20, 80);
  spot(g, 130, 20, 70);
  mannequin(g, 48, h - 22, 1.25, '#2a4d69', '#22252a');
  mannequin(g, 102, h - 24, 1.2, '#b23a48', '#e6dccb');
  mannequin(g, 198, h - 20, 1.3, '#e0c080', '#34495e');
};

const luxe: Painter = (g, w, h) => {
  room(g, w, h, '#2a2623', '#15120f', '#3a332c', 0.16);
  spot(g, 70, 10, 110, 'rgba(255,232,190,0.55)');
  spot(g, 190, 10, 110, 'rgba(255,232,190,0.55)');
  g.fillStyle = '#e9e3d6';
  g.fillRect(40, 108, 60, 54);
  g.fillRect(160, 124, 60, 38);
  // sac à main
  g.fillStyle = '#7a2e22';
  rr(g, 46, 72, 48, 36, 5);
  g.strokeStyle = '#7a2e22';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(70, 72, 14, Math.PI, 0);
  g.stroke();
  g.fillStyle = '#c9a227';
  g.fillRect(66, 84, 8, 6);
  // escarpin
  g.fillStyle = '#16181a';
  g.beginPath();
  g.moveTo(166, 122);
  g.quadraticCurveTo(180, 96, 196, 112);
  g.lineTo(214, 120);
  g.lineTo(214, 124);
  g.lineTo(166, 124);
  g.fill();
  g.fillRect(168, 104, 3, 20);
  // cadre doré
  g.strokeStyle = '#c9a227';
  g.lineWidth = 3;
  g.strokeRect(112, 30, 34, 46);
};

const bijouterie: Painter = (g, w, h, rnd) => {
  room(g, w, h, '#1c2740', '#0f1626', '#18203a', 0.12);
  spot(g, 64, 12, 90, 'rgba(255,245,220,0.6)');
  spot(g, 192, 12, 90, 'rgba(255,245,220,0.6)');
  for (let t = 0; t < 3; t++) {
    const x = 16 + t * 80, y = 100 + (t % 2) * 10;
    g.fillStyle = '#e8dfcc';
    g.beginPath();
    g.moveTo(x, y + 44);
    g.lineTo(x + 64, y + 44);
    g.lineTo(x + 56, y);
    g.lineTo(x + 8, y);
    g.fill();
    for (let i = 0; i < 12; i++) {
      g.fillStyle = i % 3 === 0 ? '#ffffff' : '#e3b83a';
      g.beginPath();
      g.arc(x + 14 + (i % 4) * 12 + rnd() * 2, y + 9 + Math.floor(i / 4) * 12, 2.6, 0, 7);
      g.fill();
    }
  }
  // bustes à collier
  for (const x of [56, 128, 200]) {
    g.fillStyle = '#0a0c12';
    g.beginPath();
    g.moveTo(x - 16, 88);
    g.quadraticCurveTo(x, 30, x + 16, 88);
    g.fill();
    g.strokeStyle = '#f0d060';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, 60, 9, 0.2, Math.PI - 0.2);
    g.stroke();
  }
};

const alimentation: Painter = (g, w, h, rnd) => {
  room(g, w, h, '#f1e6c8', '#d9c9a0', '#7d6a4e');
  shelves(g, 8, 10, 240, 62, 2, rnd, ['#b23a2e', '#e0b040', '#4f7d3a', '#f0efe0', '#8a4f2a']);
  const fruits = ['#e8862a', '#c8322a', '#7fae3a', '#e8c82a', '#7a3a8a'];
  for (let c = 0; c < 4; c++) {
    const x = 6 + c * 62, y = 96 + (c % 2) * 6;
    g.fillStyle = '#9a7a4e';
    g.fillRect(x, y + 30, 58, 44);
    g.fillStyle = '#6f5636';
    g.fillRect(x, y + 44, 58, 3);
    g.fillStyle = fruits[c % fruits.length]!;
    for (let i = 0; i < 16; i++) {
      g.beginPath();
      g.arc(x + 7 + (i % 6) * 9 + rnd() * 2, y + 28 - Math.floor(i / 6) * 8 + rnd() * 2, 5, 0, 7);
      g.fill();
    }
    g.fillStyle = '#20241f';
    g.fillRect(x + 18, y + 52, 22, 12);
    g.fillStyle = '#f0f0e8';
    g.fillRect(x + 21, y + 56, 16, 2);
  }
};

const supermarche: Painter = (g, w, h, rnd) => {
  room(g, w, h, '#f4f4f0', '#dedfda', '#9a9a94', 0.14);
  shelves(g, 6, 34, 244, 124, 5, rnd, ['#d93a2a', '#f2c200', '#2a7ad9', '#3aa85a', '#f08a2a', '#ffffff', '#7a3a9a'], '#b9bab4');
  g.fillStyle = '#d6202a';
  g.fillRect(0, 0, w, 30);
  g.fillStyle = '#ffe14a';
  g.font = '800 22px Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText('PROMO  −30 %', w / 2, 23);
};

const cafe: Painter = (g, w, h, rnd) => {
  room(g, w, h, '#6b4a30', '#3a2618', '#2a1c12', 0.24);
  // étagère à bouteilles et comptoir
  g.fillStyle = '#2a1a10';
  g.fillRect(120, 34, 128, 50);
  const bc = ['#3f7d4a', '#c8a23a', '#8a2a22', '#d9d2c0', '#2a4d69'];
  for (let i = 0; i < 20; i++) {
    g.fillStyle = bc[Math.floor(rnd() * bc.length)]!;
    g.fillRect(124 + (i % 10) * 12, 38 + Math.floor(i / 10) * 24, 6, 18);
  }
  g.fillStyle = '#4a3020';
  g.fillRect(112, 96, 144, 56);
  g.fillStyle = '#b08a4a';
  g.fillRect(108, 92, 150, 6);
  // lampes suspendues
  for (const x of [40, 90, 170, 220]) {
    g.fillStyle = '#1a1a1a';
    g.fillRect(x - 0.5, 0, 1, 18);
    spot(g, x, 22, 46, 'rgba(255,200,110,0.75)');
    g.fillStyle = '#ffd98a';
    g.beginPath();
    g.arc(x, 21, 5, 0, 7);
    g.fill();
  }
  // tables et chaises
  for (const x of [30, 80]) {
    g.fillStyle = '#e8e4da';
    g.fillRect(x - 16, 126, 32, 3);
    g.fillStyle = '#1c1c1c';
    g.fillRect(x - 1.5, 129, 3, 30);
    g.fillStyle = '#b98b4e';
    g.fillRect(x - 28, 112, 3, 46);
    g.fillRect(x - 28, 132, 12, 3);
  }
  // ardoise
  g.fillStyle = '#20241f';
  g.fillRect(6, 30, 40, 54);
  g.fillStyle = '#e8e8dc';
  for (let i = 0; i < 6; i++) g.fillRect(11, 38 + i * 7, 16 + rnd() * 14, 1.6);
};

const rapide: Painter = (g, w, h, rnd) => {
  room(g, w, h, '#f6f1e6', '#e6dccb', '#b0a696', 0.18);
  const cols = ['#d9480f', '#f2b705', '#3a8a3a'];
  for (let i = 0; i < 4; i++) {
    const x = 6 + i * 62;
    g.fillStyle = '#1a1a1a';
    g.fillRect(x, 12, 58, 44);
    g.fillStyle = cols[i % 3]!;
    g.fillRect(x + 3, 15, 52, 9);
    for (let k = 0; k < 6; k++) {
      g.fillStyle = k % 2 ? '#e8a23a' : '#c8322a';
      g.beginPath();
      g.arc(x + 11 + (k % 3) * 17, 33 + Math.floor(k / 3) * 13, 4.5, 0, 7);
      g.fill();
      g.fillStyle = '#f0f0e8';
      g.fillRect(x + 17 + (k % 3) * 17 - 10, 39 + Math.floor(k / 3) * 13, 9, 1.4);
    }
  }
  spot(g, 128, 34, 150, 'rgba(255,250,235,0.35)');
  g.fillStyle = '#c8322a';
  g.fillRect(0, 100, w, 54);
  g.fillStyle = '#f6f1e6';
  g.fillRect(0, 96, w, 6);
  for (let i = 0; i < 3; i++) {
    g.fillStyle = '#2a2a2a';
    g.fillRect(40 + i * 80, 76, 18, 20);
    g.fillStyle = '#9fd0ff';
    g.fillRect(42 + i * 80, 78, 14, 9 + rnd() * 3);
  }
};

const pharmacie: Painter = (g, w, h, rnd) => {
  room(g, w, h, '#f7faf7', '#e3ebe4', '#aab5ac', 0.16);
  shelves(g, 8, 14, 240, 96, 4, rnd, ['#ffffff', '#dfeee3', '#3aa85a', '#2a7ad9', '#f2f2f2', '#9ad0b0'], '#c4cec6');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 118, w, 40);
  g.fillStyle = '#1f8f4e';
  g.fillRect(0, 114, w, 5);
  g.fillRect(118, 124, 20, 6);
  g.fillRect(125, 117, 6, 20);
};

const tabac: Painter = (g, w, h, rnd) => {
  room(g, w, h, '#e9dfcf', '#cbbfa8', '#6f6250', 0.14);
  const covers = ['#d93a2a', '#2a7ad9', '#f2c200', '#22252a', '#3aa85a', '#d96aa8', '#f08a2a', '#ffffff', '#7a3a9a'];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 11; c++) {
      const x = 8 + c * 22, y = 12 + r * 36;
      g.fillStyle = covers[Math.floor(rnd() * covers.length)]!;
      g.fillRect(x, y, 19, 30);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(x + 2, y + 3, 15, 4);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + 3, y + 12, 13, 12);
    }
    g.fillStyle = '#5a4a36';
    g.fillRect(4, 12 + r * 36 + 30, 248, 3);
  }
};

const telephonie: Painter = (g, w, h, rnd) => {
  room(g, w, h, '#ffffff', '#eef1f4', '#c9ced4', 0.2);
  for (let i = 0; i < 3; i++) {
    const gr = g.createLinearGradient(12 + i * 82, 12, 82 + i * 82, 70);
    const a = ['#2a7ad9', '#a61e69', '#16a085'][i]!, b = ['#7ee0c3', '#f08a2a', '#2a4d69'][i]!;
    gr.addColorStop(0, a);
    gr.addColorStop(1, b);
    g.fillStyle = gr;
    g.fillRect(12 + i * 82, 12, 68, 58);
  }
  for (let t = 0; t < 2; t++) {
    const y = 104 + t * 30;
    g.fillStyle = '#d8c7a6';
    g.fillRect(16 + t * 10, y, 224 - t * 20, 8);
    for (let i = 0; i < 8; i++) {
      const x = 26 + t * 10 + i * 26;
      g.fillStyle = '#16181a';
      rr(g, x, y - 16, 9, 16, 1.5);
      g.fillStyle = ['#7ee0c3', '#ffd23f', '#9fc8ff', '#f08a8a'][Math.floor(rnd() * 4)]!;
      g.fillRect(x + 1, y - 14.5, 7, 12);
    }
  }
};

const agence: Painter = (g, w, h, rnd) => {
  room(g, w, h, '#e9edf0', '#cfd6db', '#8a9299', 0.16);
  g.fillStyle = '#5a4a36';
  g.fillRect(150, 108, 100, 48);
  g.fillStyle = '#22252a';
  g.fillRect(180, 86, 30, 22);
  // annonces collées à la vitre
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      const x = 10 + c * 48, y = 10 + r * 50;
      g.fillStyle = '#ffffff';
      g.fillRect(x, y, 40, 44);
      g.fillStyle = ['#7aa0c0', '#c0a07a', '#8ab08a', '#b0b0b8'][Math.floor(rnd() * 4)]!;
      g.fillRect(x + 3, y + 3, 34, 20);
      g.fillStyle = '#44484e';
      g.fillRect(x + 3, y + 27, 26, 2);
      g.fillRect(x + 3, y + 32, 30, 2);
      g.fillStyle = '#c8322a';
      g.fillRect(x + 3, y + 37, 16, 3);
    }
  }
};

const banque: Painter = (g, w, h) => {
  room(g, w, h, '#dfe5ea', '#c3ccd4', '#8f989f', 0.14);
  g.fillStyle = '#6f7a84';
  g.fillRect(20, 100, 216, 56);
  g.fillStyle = '#aab4bc';
  g.fillRect(16, 94, 224, 7);
  for (let i = 0; i < 3; i++) {
    g.fillStyle = '#2a3440';
    g.fillRect(44 + i * 70, 62, 28, 32);
    g.fillStyle = '#9fc8ff';
    g.fillRect(47 + i * 70, 65, 22, 14);
  }
  // bande dépolie à hauteur des yeux
  g.fillStyle = 'rgba(240,244,247,0.72)';
  g.fillRect(0, 66, w, 44);
  g.fillStyle = 'rgba(29,53,87,0.55)';
  for (let i = 0; i < 9; i++) g.fillRect(8 + i * 28, 84, 14, 8);
};

const hotel: Painter = (g, w, h) => {
  room(g, w, h, '#7a5a3a', '#4a3220', '#5a1e1e', 0.22);
  spot(g, 60, 60, 80, 'rgba(255,210,130,0.8)');
  g.fillStyle = '#e8c88a';
  g.beginPath();
  g.moveTo(44, 66);
  g.lineTo(76, 66);
  g.lineTo(68, 44);
  g.lineTo(52, 44);
  g.fill();
  g.fillStyle = '#2a1a10';
  g.fillRect(58.5, 66, 3, 40);
  g.fillStyle = '#3a2416';
  g.fillRect(110, 92, 140, 62);
  g.fillStyle = '#c9a227';
  g.fillRect(106, 88, 148, 5);
  g.fillStyle = '#1a120c';
  g.fillRect(150, 30, 70, 44);
  g.fillStyle = '#c9a227';
  for (let i = 0; i < 12; i++) g.fillRect(156 + (i % 6) * 10, 36 + Math.floor(i / 6) * 18, 5, 9);
  // plante
  g.fillStyle = '#3f6b35';
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.ellipse(22 + (i - 3) * 3, 110 - i * 4, 5, 14, (i - 3) * 0.25, 0, 7);
    g.fill();
  }
  g.fillStyle = '#8a5a3a';
  g.fillRect(12, 124, 22, 30);
};

const autre: Painter = (g, w, h, rnd) => {
  room(g, w, h, '#e6e0d4', '#c9c1b2', '#7a7062');
  shelves(g, 10, 16, 150, 110, 4, rnd, ['#8a6a4a', '#b0483a', '#4a6a8a', '#d9c9a0', '#5a7a5a', '#e8e4da']);
  g.fillStyle = '#5a4a3a';
  g.fillRect(176, 106, 70, 48);
  g.fillStyle = '#3f6b35';
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.ellipse(210 + (i - 2.5) * 5, 86 - (i % 3) * 6, 6, 15, (i - 2.5) * 0.3, 0, 7);
    g.fill();
  }
  spot(g, 128, 10, 120);
};

const pille: Painter = (g, w, h, rnd) => {
  room(g, w, h, '#3a3834', '#1c1b19', '#2a2824', 0.26);
  // étagères vides, de travers
  g.fillStyle = '#5a554c';
  g.save();
  g.translate(30, 40);
  g.rotate(0.08);
  g.fillRect(0, 0, 110, 3);
  g.fillRect(0, 34, 110, 3);
  g.restore();
  g.save();
  g.translate(150, 60);
  g.rotate(-0.22);
  g.fillRect(0, 0, 96, 3);
  g.restore();
  g.fillRect(28, 20, 3, 90);
  g.fillRect(140, 24, 3, 88);
  // marchandise répandue au sol
  const cl = ['#8a7a66', '#b0a696', '#6a4a3a', '#c9c1b2', '#4a5a6a', '#9a3b2e'];
  for (let i = 0; i < 38; i++) {
    g.save();
    g.translate(rnd() * w, h * 0.72 + rnd() * h * 0.26);
    g.rotate(rnd() * 3);
    g.fillStyle = cl[Math.floor(rnd() * cl.length)]!;
    g.fillRect(-6, -4, 6 + rnd() * 12, 4 + rnd() * 8);
    g.restore();
  }
  // câbles qui pendent
  g.strokeStyle = '#111';
  g.lineWidth = 1.5;
  for (const x of [70, 176, 214]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.quadraticCurveTo(x + 12, 30, x - 4, 44 + rnd() * 20);
    g.stroke();
  }
};

const brule: Painter = (g, w, h, rnd) => {
  g.fillStyle = grad(g, 0, 0, 0, h, '#0c0b0a', '#1a1512');
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#050505';
  g.lineWidth = 7;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(rnd() * w, 0);
    g.lineTo(rnd() * w, h);
    g.stroke();
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = rnd() < 0.2 ? 'rgba(120,48,16,0.5)' : 'rgba(40,36,32,0.8)';
    g.fillRect(rnd() * w, h * 0.55 + rnd() * h * 0.45, 4 + rnd() * 16, 3 + rnd() * 8);
  }
  g.fillStyle = grad(g, 0, h * 0.7, 0, h, 'rgba(90,30,8,0)', 'rgba(90,30,8,0.35)');
  g.fillRect(0, h * 0.7, w, h * 0.3);
};

export const DISPLAY_PAINTERS: Readonly<Record<string, Painter>> = {
  etal_mode: mode, etal_luxe: luxe, etal_bijouterie: bijouterie, etal_alimentation: alimentation,
  etal_supermarche: supermarche, etal_cafe_restaurant: cafe, etal_restauration_rapide: rapide, etal_pharmacie: pharmacie,
  etal_tabac_presse: tabac, etal_telephonie: telephonie, etal_agence: agence, etal_banque: banque, etal_hotel: hotel,
  etal_autre: autre, etal_pille: pille, etal_brule: brule,
};
