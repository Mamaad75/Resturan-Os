import {
  Controller,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@restaurant-os/types';
import { Ctx, RequirePermissions } from '../../common/decorators/auth.decorators';
import type { RequestContext } from '../../common/types/request-context';
import {
  StorageService,
  UPLOAD_FOLDERS,
  type UploadedImage,
  type UploadFolder,
} from './storage.service';

/**
 * Image upload for logos, cover images, product photos and payment receipts.
 *
 * Uploading is a privileged action: it writes to disk and publishes a URL, so
 * it needs a permission that implies managing content rather than merely being
 * signed in. The folder is an allowlisted path segment and the key is
 * namespaced per tenant, so one restaurant can never address another's assets.
 */
@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post('image')
  @RequirePermissions(
    Permission.PRODUCT_MANAGE,
    Permission.BRANDING_MANAGE,
    Permission.ACCOUNTING_MANAGE,
  )
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload an image and receive its public URL' })
  async uploadImage(
    @Ctx() ctx: RequestContext,
    @UploadedFile() file: UploadedImage,
    @Query('folder') folder?: string,
  ) {
    const resolved: UploadFolder = (UPLOAD_FOLDERS as readonly string[]).includes(
      folder ?? '',
    )
      ? (folder as UploadFolder)
      // Anything unrecognised - including a traversal attempt like
      // `../../etc` - falls back to the common case rather than being obeyed.
      : 'products';
    return this.storage.saveImage(file, resolved, ctx.tenantId);
  }
}
