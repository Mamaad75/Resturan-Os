import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
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
  ): Promise<{ url: string }> {
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

    const fileName = `${randomUUID()}${ext}`;
    const dir = resolve(process.cwd(), this.config.storage.localDir, folder);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, fileName), file.buffer);

    const base = this.config.storage.publicUrl.replace(/\/+$/, '');
    const url = `${base}/${folder}/${fileName}`;
    this.logger.log(`stored image ${folder}/${fileName} (${file.size} bytes)`);
    return { url };
  }
}
