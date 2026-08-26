import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  reorderMediaRequestSchema,
  requestMediaUploadRequestSchema,
  updateMediaRequestSchema,
} from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MediaService } from './media.service';

@ApiTags('media')
@Controller({ path: 'console/media', version: '1' })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get('products/:productId')
  @Permissions('media:read')
  @ApiOperation({ summary: 'List media for a product' })
  async list(@Param('productId') productId: string) {
    const rows = await this.media.listForProduct(productId);
    return rows.map((row) => this.media.toResponse(row, productId));
  }

  @Post('upload-url')
  @Permissions('media:create')
  @Validate(requestMediaUploadRequestSchema)
  @ApiOperation({ summary: 'Get a presigned URL to upload a product image/video directly to storage' })
  async requestUpload(@Body() body: ReturnType<typeof requestMediaUploadRequestSchema.parse>) {
    return this.media.requestUpload(body);
  }

  @Post(':mediaId/confirm')
  @Permissions('media:create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm a direct upload finished and queue thumbnail processing' })
  async confirm(@Param('mediaId') mediaId: string) {
    const media = await this.media.confirmUpload(mediaId);
    return { id: String(media.id), status: media.status };
  }

  @Put(':mediaId')
  @Permissions('media:create')
  @ApiOperation({ summary: 'Update alt text or set as primary image' })
  async update(
    @Param('mediaId') mediaId: string,
    @Body(new ZodValidationPipe(updateMediaRequestSchema))
    body: ReturnType<typeof updateMediaRequestSchema.parse>,
  ) {
    const media = await this.media.update(mediaId, body);
    return { id: String(media.id), altText: media.altText, isPrimary: media.isPrimary };
  }

  @Post('products/:productId/reorder')
  @Permissions('media:create')
  @ApiOperation({ summary: 'Reorder a product\'s media' })
  async reorder(
    @Param('productId') productId: string,
    @Body(new ZodValidationPipe(reorderMediaRequestSchema))
    body: ReturnType<typeof reorderMediaRequestSchema.parse>,
  ) {
    await this.media.reorder(productId, body.orderedIds);
    return { message: 'Reordered.' };
  }

  @Delete(':mediaId')
  @Permissions('media:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a media asset' })
  async remove(@Param('mediaId') mediaId: string): Promise<void> {
    await this.media.remove(mediaId);
  }
}
