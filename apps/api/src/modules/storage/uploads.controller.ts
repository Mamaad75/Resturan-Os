import {
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  StorageService,
  UPLOAD_FOLDERS,
  type UploadedImage,
  type UploadFolder,
} from './storage.service';

/**
 * Image upload for logos, cover images, product photos and payment receipts.
 *
 * Authenticated (no `@Public`), so any signed-in staff member can upload; the
 * folder is an allowlisted path segment. This endpoint was missing entirely —
 * the frontend posted to `/uploads/image` and got a 404 — so every image
 * upload in the admin failed.
 */
@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload an image and receive its public URL' })
  async uploadImage(
    @UploadedFile() file: UploadedImage,
    @Query('folder') folder?: string,
  ) {
    const resolved: UploadFolder = (UPLOAD_FOLDERS as readonly string[]).includes(
      folder ?? '',
    )
      ? (folder as UploadFolder)
      : 'misc';
    return this.storage.saveImage(file, resolved);
  }
}
