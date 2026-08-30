import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';

/**
 * Demo product artwork.
 *
 * The photo-led menu templates only read as themselves when products actually
 * have images, and a seed that ships none makes the café and fast-food styles
 * look broken on first launch. Rather than commit binary fixtures, each image
 * is generated: a deterministic two-tone gradient derived from the product
 * name, so the same product always gets the same picture and the menu looks
 * varied without anyone downloading anything.
 *
 * Real photographs are the restaurant's job. These exist so the demo tenant
 * demonstrates the templates.
 */

const PALETTES: Array<[string, string]> = [
  ['#7C2D12', '#C2410C'],
  ['#134E4A', '#0F766E'],
  ['#1E1B4B', '#4338CA'],
  ['#3F1D38', '#9D174D'],
  ['#14532D', '#15803D'],
  ['#422006', '#A16207'],
  ['#0C4A6E', '#0369A1'],
  ['#450A0A', '#B91C1C'],
];

function paletteFor(key: string): [string, string] {
  const digest = createHash('sha256').update(key).digest();
  return PALETTES[digest[0] % PALETTES.length];
}

/**
 * Writes a product image and its thumbnail, returning the public URL.
 *
 * Follows exactly the key convention the upload endpoint uses
 * (`<tenantId>/products/<name>.webp`) so seeded images and uploaded ones are
 * indistinguishable to the rest of the system.
 */
export async function writeSeedImage(args: {
  tenantId: string;
  key: string;
  localDir: string;
  publicUrl: string;
}): Promise<string> {
  const [from, to] = paletteFor(args.key);
  const slug = createHash('sha256').update(args.key).digest('hex').slice(0, 24);
  const objectKey = `${args.tenantId}/products/${slug}.webp`;

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0%" stop-color="${from}"/>
           <stop offset="100%" stop-color="${to}"/>
         </linearGradient>
         <radialGradient id="h" cx="0.3" cy="0.2" r="0.9">
           <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
           <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
         </radialGradient>
       </defs>
       <rect width="1200" height="1200" fill="url(#g)"/>
       <rect width="1200" height="1200" fill="url(#h)"/>
     </svg>`,
  );

  const root = resolve(process.cwd(), args.localDir);
  const target = join(root, objectKey);
  await mkdir(dirname(target), { recursive: true });

  const full = await sharp(svg).webp({ quality: 82 }).toBuffer();
  await writeFile(target, full);

  const thumb = await sharp(svg)
    .resize({ width: 400, height: 400, fit: 'cover' })
    .webp({ quality: 75 })
    .toBuffer();
  await writeFile(target.replace(/\.webp$/, '-thumb.webp'), thumb);

  return `${args.publicUrl.replace(/\/$/, '')}/${objectKey}`;
}
