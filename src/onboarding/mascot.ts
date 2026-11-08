/* Pip, the Leave Calendar mascot: a round red "day" (the same circle as on the calendar) with two
   calendar-binding rings on top. One SVG source for the app (react-native-svg's SvgXml) and for the
   app icon / splash generator (scripts/render-assets.ts), so they always match.
   Pure TypeScript, no imports: runs in the app and in Node. */

export type MascotPose = 'wave' | 'point' | 'cloud' | 'relax' | 'plain';

type Palette = { body: string; shade: string; feet: string; face: string; rings: string; cheek: string; cloud: string; cloudLine: string; check: string; shadow: string };

const PALETTE = {
  light: { body: '#FF3B30', shade: '#E8261C', feet: '#C81E15', face: '#1C1C1E', rings: '#8E8E93', cheek: '#FF8E86', cloud: '#EAF3FF', cloudLine: '#BFD9FF', check: '#007AFF', shadow: 'rgba(0,0,0,0.08)' },
  dark: { body: '#FF453A', shade: '#EC3328', feet: '#C9271D', face: '#1C1C1E', rings: '#C7C7CC', cheek: '#FF9C95', cloud: '#16263D', cloudLine: '#2D4B75', check: '#0A84FF', shadow: 'rgba(255,255,255,0.10)' },
} satisfies Record<string, Palette>;

const CX = 120;
const CY = 124;
const R = 74;

function body(p: Palette): string {
  return [
    // binding loops, half above the head like a desk calendar
    `<rect x="${CX - 37}" y="${CY - R - 16}" width="16" height="30" rx="8" fill="none" stroke="${p.rings}" stroke-width="6"/>`,
    `<rect x="${CX + 21}" y="${CY - R - 16}" width="16" height="30" rx="8" fill="none" stroke="${p.rings}" stroke-width="6"/>`,
    `<circle cx="${CX}" cy="${CY}" r="${R}" fill="${p.body}"/>`,
    // soft highlight
    `<ellipse cx="${CX - 34}" cy="${CY - 38}" rx="24" ry="13" fill="#FFFFFF" opacity="0.2" transform="rotate(-32 ${CX - 34} ${CY - 38})"/>`,
    // the loops go back in through the page
    `<path d="M${CX - 37} ${CY - R + 6} v8 a8 8 0 0 0 16 0 v-8" fill="none" stroke="${p.rings}" stroke-width="6" stroke-linecap="round"/>`,
    `<path d="M${CX + 21} ${CY - R + 6} v8 a8 8 0 0 0 16 0 v-8" fill="none" stroke="${p.rings}" stroke-width="6" stroke-linecap="round"/>`,
  ].join('');
}

function face(p: Palette, mood: 'happy' | 'joy' | 'cool'): string {
  const eyeY = CY - 4;
  const eyes =
    mood === 'joy'
      ? // closed, smiling eyes
        `<path d="M${CX - 34} ${eyeY + 2} q10 -11 20 0" fill="none" stroke="${p.face}" stroke-width="6" stroke-linecap="round"/>` +
        `<path d="M${CX + 14} ${eyeY + 2} q10 -11 20 0" fill="none" stroke="${p.face}" stroke-width="6" stroke-linecap="round"/>`
      : mood === 'cool'
        ? // sunglasses
          `<rect x="${CX - 44}" y="${eyeY - 13}" width="36" height="24" rx="11" fill="${p.face}"/>` +
          `<rect x="${CX + 8}" y="${eyeY - 13}" width="36" height="24" rx="11" fill="${p.face}"/>` +
          `<path d="M${CX - 8} ${eyeY - 4} h16" stroke="${p.face}" stroke-width="5" stroke-linecap="round"/>` +
          `<path d="M${CX - 36} ${eyeY - 6} l8 -4" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" opacity="0.75"/>` +
          `<path d="M${CX + 16} ${eyeY - 6} l8 -4" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" opacity="0.75"/>`
        : `<ellipse cx="${CX - 24}" cy="${eyeY}" rx="9" ry="11.5" fill="${p.face}"/>` +
          `<ellipse cx="${CX + 24}" cy="${eyeY}" rx="9" ry="11.5" fill="${p.face}"/>` +
          `<circle cx="${CX - 21}" cy="${eyeY - 5}" r="3.4" fill="#FFFFFF"/>` +
          `<circle cx="${CX + 27}" cy="${eyeY - 5}" r="3.4" fill="#FFFFFF"/>`;
  const cheeks =
    `<ellipse cx="${CX - 42}" cy="${CY + 18}" rx="11" ry="7" fill="${p.cheek}"/>` +
    `<ellipse cx="${CX + 42}" cy="${CY + 18}" rx="11" ry="7" fill="${p.cheek}"/>`;
  const mouth =
    mood === 'joy'
      ? `<path d="M${CX - 15} ${CY + 16} q15 20 30 0 z" fill="${p.face}"/><path d="M${CX - 7} ${CY + 25} q7 6 14 0" fill="#FF8E86"/>`
      : `<path d="M${CX - 13} ${CY + 17} q13 14 26 0" fill="none" stroke="${p.face}" stroke-width="5.5" stroke-linecap="round"/>`;
  return eyes + cheeks + mouth;
}

const arm = (d: string, p: Palette) => `<path d="${d}" fill="none" stroke="${p.shade}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>`;
const feet = (p: Palette) =>
  `<ellipse cx="${CX - 26}" cy="${CY + R + 4}" rx="18" ry="9" fill="${p.feet}"/>` + `<ellipse cx="${CX + 26}" cy="${CY + R + 4}" rx="18" ry="9" fill="${p.feet}"/>`;
const shadow = (p: Palette) => `<ellipse cx="${CX}" cy="${CY + R + 14}" rx="62" ry="7" fill="${p.shadow}"/>`;

function cloud(p: Palette, x: number, y: number, s: number): string {
  const d = `M${x - 34 * s} ${y + 18 * s} h${68 * s} a${18 * s} ${18 * s} 0 0 0 ${2 * s} ${-35.5 * s} a${26 * s} ${26 * s} 0 0 0 ${-50 * s} ${-6 * s} a${19 * s} ${19 * s} 0 0 0 ${-20 * s} ${41.5 * s} z`;
  return (
    `<path d="${d}" fill="${p.cloud}" stroke="${p.cloudLine}" stroke-width="${3 * s}" stroke-linejoin="round"/>` +
    `<path d="M${x - 12 * s} ${y + 1 * s} l${8 * s} ${8 * s} l${16 * s} ${-16 * s}" fill="none" stroke="${p.check}" stroke-width="${6 * s}" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

/** SVG markup for Pip in a pose. viewBox 0 0 240 240. */
export function mascotSvg(pose: MascotPose = 'plain', dark = false): string {
  const p = dark ? PALETTE.dark : PALETTE.light;
  let back = '';
  let front = '';
  let mood: 'happy' | 'joy' | 'cool' = 'happy';
  switch (pose) {
    case 'wave':
      mood = 'joy';
      back = arm(`M${CX - 66} ${CY + 18} q-18 22 -12 44`, p);
      front = arm(`M${CX + 64} ${CY - 6} q24 -22 28 -56`, p) + `<path d="M${CX + 100} ${CY - 74} q8 4 10 14" fill="none" stroke="${p.shade}" stroke-width="4" stroke-linecap="round" opacity="0.6"/>`;
      break;
    case 'point':
      back = arm(`M${CX - 66} ${CY + 18} q-18 22 -12 44`, p);
      front = arm(`M${CX + 62} ${CY + 14} q26 -2 44 -18`, p);
      break;
    case 'cloud':
      mood = 'joy';
      back = arm(`M${CX - 66} ${CY + 18} q-18 22 -12 44`, p);
      front = arm(`M${CX + 64} ${CY - 4} q18 -14 20 -40`, p) + cloud(p, CX + 70, CY - 84, 0.95);
      break;
    case 'relax':
      mood = 'cool';
      back = arm(`M${CX - 70} ${CY - 2} q-18 -34 8 -58`, p) + arm(`M${CX + 70} ${CY - 2} q18 -34 -8 -58`, p);
      break;
    default:
      back = arm(`M${CX - 66} ${CY + 18} q-18 22 -12 44`, p) + arm(`M${CX + 66} ${CY + 18} q18 22 12 44`, p);
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">` +
    shadow(p) + back + feet(p) + body(p) + face(p, mood) + front +
    `</svg>`
  );
}

/** The app icon: a row of three "days" (purple sick, red Pip, brown WFH), like the calendar. 1024 canvas.
    'foreground' / 'monochrome' keep inside Android's adaptive-icon safe zone; 'tinted' is for iOS tinted icons. */
export function iconSvg(variant: 'light' | 'dark' | 'tinted' | 'foreground' | 'monochrome'): string {
  const mono = variant === 'tinted' || variant === 'monochrome';
  const dark = variant === 'dark';
  const p = dark ? PALETTE.dark : PALETTE.light;
  const s = variant === 'foreground' || variant === 'monochrome' ? 0.66 : 0.86;
  const at = (v: number) => 512 + (v - 512) * s; // scale around the centre
  const n = (v: number) => v * s;
  const bg = variant === 'light' ? '#FFFFFF' : variant === 'dark' || variant === 'tinted' ? '#000000' : '';
  const ringsCol = mono ? '#FFFFFF' : dark ? '#C7C7CC' : '#8E8E93';
  const side = (cx: number, cy: number, color: string) => `<circle cx="${at(cx)}" cy="${at(cy)}" r="${n(150)}" fill="${color}"/>`;
  const faceShapes = (fill: string) =>
    `<ellipse cx="${at(420)}" cy="${at(520)}" rx="${n(34)}" ry="${n(44)}" fill="${fill}"/>` +
    `<ellipse cx="${at(604)}" cy="${at(520)}" rx="${n(34)}" ry="${n(44)}" fill="${fill}"/>` +
    `<path d="M${at(462)} ${at(608)} q${n(50)} ${n(54)} ${n(100)} 0" fill="none" stroke="${fill}" stroke-width="${n(24)}" stroke-linecap="round"/>`;
  const loops =
    `<rect x="${at(400)}" y="${at(212)}" width="${n(60)}" height="${n(118)}" rx="${n(30)}" fill="none" stroke="${ringsCol}" stroke-width="${n(24)}"/>` +
    `<rect x="${at(564)}" y="${at(212)}" width="${n(60)}" height="${n(118)}" rx="${n(30)}" fill="none" stroke="${ringsCol}" stroke-width="${n(24)}"/>`;
  const parts: string[] = [];
  if (bg) parts.push(`<rect width="1024" height="1024" fill="${bg}"/>`);
  if (mono) {
    // One colour; the face is cut out so tinting keeps it readable.
    parts.push(
      `<defs><mask id="face"><rect width="1024" height="1024" fill="#fff"/>${faceShapes('#000')}</mask>` +
        `<mask id="sides"><rect width="1024" height="1024" fill="#fff"/><circle cx="512" cy="${at(560)}" r="${n(282) + n(22)}" fill="#000"/></mask></defs>`,
      `<g mask="url(#sides)" opacity="0.55">${side(236, 330, '#FFFFFF')}${side(790, 780, '#FFFFFF')}</g>`,
      loops,
      `<circle cx="512" cy="${at(560)}" r="${n(282)}" fill="#FFFFFF" mask="url(#face)"/>`,
    );
  } else {
    parts.push(
      side(236, 330, dark ? '#BF5AF2' : '#AF52DE'),
      side(790, 780, dark ? '#AC8E68' : '#A2845E'),
      // a gap ring between Pip and the side circles, in the background colour
      `<circle cx="512" cy="${at(560)}" r="${n(282) + n(22)}" fill="${bg || '#FFFFFF'}"/>`,
      loops,
      `<circle cx="512" cy="${at(560)}" r="${n(282)}" fill="${p.body}"/>`,
      `<ellipse cx="${at(380)}" cy="${at(408)}" rx="${n(92)}" ry="${n(50)}" fill="#FFFFFF" opacity="0.2" transform="rotate(-32 ${at(380)} ${at(408)})"/>`,
      `<circle cx="${at(432)}" cy="${at(500)}" r="${n(13)}" fill="#FFFFFF"/>`,
      faceShapes(p.face),
      `<circle cx="${at(432)}" cy="${at(502)}" r="${n(13)}" fill="#FFFFFF"/>`,
      `<circle cx="${at(616)}" cy="${at(502)}" r="${n(13)}" fill="#FFFFFF"/>`,
      `<ellipse cx="${at(352)}" cy="${at(606)}" rx="${n(40)}" ry="${n(26)}" fill="${p.cheek}"/>`,
      `<ellipse cx="${at(672)}" cy="${at(606)}" rx="${n(40)}" ry="${n(26)}" fill="${p.cheek}"/>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${parts.join('')}</svg>`;
}
