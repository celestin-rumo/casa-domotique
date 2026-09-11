// Les couleurs, telles que l'app les montre et les écrit. Deux façons de dire
// la même chose à une ampoule — des kelvins, ou une teinte — et un aperçu RVB
// pour chacune, calculé sur le natel : l'écran ne demande jamais au Pi quelle
// couleur il doit afficher. Partagé par Pièces et par le réveil.
export type Rgb = [number, number, number];

export function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

export function kelvinRgb(k: number): Rgb {
  const chaud = [255, 180, 107], neutre = [255, 241, 224], froid = [207, 227, 255];
  if (k <= 4000) {
    const t = Math.min(1, Math.max(0, (k - 2200) / 1800));
    return [lerp(chaud[0], neutre[0], t), lerp(chaud[1], neutre[1], t), lerp(chaud[2], neutre[2], t)];
  }
  const u = Math.min(1, (k - 4000) / 2500);
  return [lerp(neutre[0], froid[0], u), lerp(neutre[1], froid[1], u), lerp(neutre[2], froid[2], u)];
}

export function hsRgb(h: number, sPct: number): Rgb {
  const s = sPct / 100, l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const r = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
  return [Math.round((r[0] + m) * 255), Math.round((r[1] + m) * 255), Math.round((r[2] + m) * 255)];
}

export const css = (rgb: Rgb) => `rgb(${rgb.join(", ")})`;

const octet = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

export function rgbHex([r, g, b]: Rgb): string {
  return [r, g, b].map((v) => octet(v).toString(16).padStart(2, "0")).join("");
}

export function hexRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0) as Rgb;
}

// Le chemin inverse de hsRgb, pour replacer les curseurs d'un point existant.
export function teinteSaturationDe([r, g, b]: Rgb): [number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  if (d === 0) return [0, 0];
  const l = (max + min) / 2;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [Math.round((h * 60 + 360) % 360), Math.round(Math.min(1, s) * 100)];
}

// --- La courbe du réveil ---------------------------------------------------
//
// Le format est celui de input_text.reveil_courbe (packages/reveil.yaml) :
// des points « position,intensité,couleur » séparés par des points-virgules.
// Position et intensité sont des pourcentages ; la couleur est « k2700 » pour
// un blanc en kelvins, ou « ff8a3c » pour une teinte. Le Pi lit le même texte
// et retombe sur la même courbe par défaut : ce fichier et le script doivent
// dire la même chose.
export type Point = { p: number; b: number; c: string };

export const COURBE_DEFAUT: Point[] = [
  { p: 0, b: 1, c: "k2000" },
  { p: 100, b: 78, c: "k4000" },
];

const borne = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function lireCourbe(brut: string | undefined): Point[] {
  const points: Point[] = [];
  for (const morceau of (brut ?? "").toLowerCase().split(";")) {
    const [p, b, c] = morceau.split(",").map((s) => s.trim());
    if (c === undefined || !/^(k\d{4,5}|[0-9a-f]{6})$/.test(c)) continue;
    const np = Number(p), nb = Number(b);
    if (!Number.isFinite(np) || !Number.isFinite(nb)) continue;
    points.push({ p: borne(np, 0, 100), b: borne(nb, 0, 100), c });
  }
  // Moins de deux points, ce n'est pas une courbe : le Pi prend alors la
  // courbe par défaut, et l'app aussi, pour montrer ce qui se passera.
  return points.length >= 2 ? points.sort((x, y) => x.p - y.p) : COURBE_DEFAUT;
}

export function ecrireCourbe(points: Point[]): string {
  return [...points]
    .sort((x, y) => x.p - y.p)
    .map((pt) => `${Math.round(pt.p)},${Math.round(pt.b)},${pt.c}`)
    .join(";");
}

export const estBlanc = (c: string) => c.startsWith("k");
export const kelvinDe = (c: string) => Number(c.slice(1));

export function rgbDuPoint(c: string): Rgb {
  return estBlanc(c) ? kelvinRgb(kelvinDe(c)) : hexRgb(c);
}

// L'aperçu de la courbe entière : chaque point à sa position, dans sa
// couleur, assombri selon son intensité — un point à 1 % est presque noir,
// comme la pièce au moment où il s'allume.
export function degradeCourbe(points: Point[]): string {
  const arrets = points.map((pt) => {
    const k = 0.12 + 0.88 * (pt.b / 100);
    const [r, g, b] = rgbDuPoint(pt.c);
    return `${css([octet(r * k), octet(g * k), octet(b * k)])} ${Math.round(pt.p)}%`;
  });
  return `linear-gradient(90deg, ${arrets.join(", ")})`;
}
