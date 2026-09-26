import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { AppException } from '../../common/exceptions/app.exception';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';

/** The minimal shape of a multer file — declared locally so the module does
 *  not depend on @types/multer being installed. */
export interface UploadedImage {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/** Folders an image may be filed under. Keeps uploads tidy and predictable. */
export const UPLOAD_FOLDERS = [
  'products',
  'branding',
  'receipts',
  'events',
  'misc',
] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Re-encoding targets.
 *
 * A menu is opened on a phone, usually on mobile data, and the photo that
 * arrives is whatever the owner's camera produced - often several megabytes.
 * Serving that untouched is the single most expensive thing the guest menu
 * can do, so every raster upload is re-encoded once on the way in.
 */
const MAX_EDGE = 1600;
const THUMB_EDGE = 400;
const WEBP_QUALITY = 82;

/**
 * Formats that are stored as they arrive.
 *
 * SVG is already small and rasterising a logo would ruin it; GIF would lose
 * its animation. Everything else becomes WebP.
 */
const PASSTHROUGH_MIME = new Set(['image/svg+xml', 'image/gif']);
const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

/**
 * Where uploaded images live.
 *
 * Only the local driver is implemented: it writes under STORAGE_LOCAL_DIR and
 * serves from STORAGE_PUBLIC_URL (the API already mounts that directory as
 * static in bootstrap). An S3 driver can be added here behind the same method
 * without touching callers.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async saveImage(
    file: UploadedImage,
    folder: UploadFolder,
    /**
     * Namespaces the key. Every asset lives under the tenant that uploaded
     * it, so a guessed key can never reach another restaurant's files.
     */
    tenantId: string,
  ): Promise<{
    key: string;
    url: string;
    thumbnailUrl: string;
    size: number;
    contentType: string;
  }> {
    if (!file || !file.buffer?.length) {
      throw AppException.validation('فایلی دریافت نشد.', {
        file: ['فایلی ارسال نشده است.'],
      });
    }
    if (file.size > MAX_BYTES) {
      throw AppException.validation('حجم تصویر بیش از حد مجاز است.', {
        file: ['حداکثر حجم مجاز ۵ مگابایت است.'],
      });
    }
    const ext = ALLOWED_MIME[file.mimetype] ?? extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME[file.mimetype]) {
      throw AppException.validation('نوع فایل مجاز نیست.', {
        file: ['فقط تصویر (JPG, PNG, WebP, GIF, SVG) مجاز است.'],
      });
    }

    if (this.config.storage.driver !== 'local') {
      // Not yet wired for S3; the deployed default is local.
      throw AppException.validation('درایور ذخیره‌سازی فعلی از آپلود پشتیبانی نمی‌کند.');
    }

    const scope = `${tenantId}/${folder}`;
    const dir = resolve(process.cwd(), this.config.storage.localDir, tenantId, folder);
    await mkdir(dir, { recursive: true });
    const base = this.config.storage.publicUrl.replace(/\/+$/, '');
    const id = randomUUID();

    if (PASSTHROUGH_MIME.has(file.mimetype)) {
      const fileName = `${id}${ext}`;
      await writeFile(join(dir, fileName), file.buffer);
      const key = `${scope}/${fileName}`;
      const url = `${base}/${key}`;
      this.logger.log(`stored ${file.mimetype} ${key} (${file.size} bytes)`);
      return {
        key,
        url,
        thumbnailUrl: url,
        size: file.size,
        contentType: file.mimetype,
      };
    }

    /*
     * `rotate()` with no argument applies the EXIF orientation and then drops
     * the tag. Without it a photo taken in portrait arrives sideways, because
     * the tag that said "turn me" is stripped by the re-encode.
     */
    const pipeline = sharp(file.buffer, { failOn: 'none' }).rotate();

    let full: Buffer;
    let thumb: Buffer;
    try {
      [full, thumb] = await Promise.all([
        pipeline
          .clone()
          .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer(),
        pipeline
          .clone()
          .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'cover' })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer(),
      ]);
    } catch (error) {
      // A file that passed the MIME check but is not decodable is a bad
      // upload, not a server fault.
      this.logger.warn(`could not decode upload: ${(error as Error).message}`);
      throw AppException.validation('تصویر قابل پردازش نیست.', {
        file: ['فایل تصویر معتبر نیست.'],
      });
    }

    const fileName = `${id}.webp`;
    const thumbName = `${id}-thumb.webp`;
    await Promise.all([
      writeFile(join(dir, fileName), full),
      writeFile(join(dir, thumbName), thumb),
    ]);

    const key = `${scope}/${fileName}`;
    const url = `${base}/${key}`;
    this.logger.log(
      `stored image ${key} (${file.size} -> ${full.length} bytes, ${Math.round((1 - full.length / file.size) * 100)}% smaller)`,
    );
    return {
      key,
      url,
      thumbnailUrl: `${base}/${scope}/${thumbName}`,
      size: full.length,
      contentType: 'image/webp',
    };
  }
}
