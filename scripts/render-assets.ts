/* Renders the app icon, Android adaptive-icon layers, iOS dark/tinted icons, splash and favicon from the
   mascot SVG source (src/onboarding/mascot.ts). Run after changing the mascot:
     npm run assets
*/
import sharp from 'sharp';
import { iconSvg, mascotSvg } from '../src/onboarding/mascot.ts';

const out = new URL('../assets/', import.meta.url).pathname;

async function png(svg: string, file: string, size: number, opts: { opaque?: string } = {}) {
  let img = sharp(Buffer.from(svg), { density: 300 }).resize(size, size);
  // App Store icons must not have an alpha channel.
  if (opts.opaque) img = img.flatten({ background: opts.opaque }).removeAlpha();
  await img.png({ compressionLevel: 9 }).toFile(out + file);
  console.log('wrote', file);
}

await png(iconSvg('light'), 'icon.png', 1024, { opaque: '#FFFFFF' });
await png(iconSvg('dark'), 'icon-dark.png', 1024, { opaque: '#000000' });
await png(iconSvg('tinted'), 'icon-tinted.png', 1024, { opaque: '#000000' });
await png(iconSvg('foreground'), 'android-icon-foreground.png', 1024);
await png(iconSvg('monochrome'), 'android-icon-monochrome.png', 1024);
await png(mascotSvg('wave', false), 'splash-icon.png', 1024);
await png(iconSvg('light'), 'favicon.png', 196, { opaque: '#FFFFFF' });
