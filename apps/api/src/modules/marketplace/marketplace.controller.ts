import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { requestProductShareSchema } from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { ProductShareService } from './product-share.service';

@ApiTags('marketplace')
@Controller({ version: '1' })
export class MarketplaceController {
  constructor(private readonly shares: ProductShareService) {}

  @Post('console/marketplace/shares')
  @Permissions('marketplace:share')
  @Validate(requestProductShareSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Supplier: offer one of your shareable products to a reseller' })
  async requestShare(@Body() body: ReturnType<typeof requestProductShareSchema.parse>) {
    const share = await this.shares.requestShare(body);
    return this.shares.getRow(share.publicId);
  }

  @Get('console/marketplace/shares')
  @Permissions('marketplace:read')
  @ApiOperation({ summary: 'List shares from the current tenant\'s side, as supplier and as reseller' })
  async list() {
    const [asSupplier, asReseller] = await Promise.all([this.shares.listForSupplier(), this.shares.listForReseller()]);
    return { asSupplier, asReseller };
  }

  @Get('console/marketplace/catalog')
  @Permissions('marketplace:read')
  @ApiOperation({ summary: 'Reseller: the browsable catalog of everything currently sourceable from a supplier' })
  async catalog() {
    return this.shares.browsableCatalog();
  }

  @Get('console/marketplace/resellers')
  @Permissions('marketplace:share')
  @ApiOperation({ summary: 'Supplier: every tenant opted in as a marketplace reseller, to choose who to share with' })
  async resellerDirectory() {
    return this.shares.resellerDirectory();
  }

  @Get('console/marketplace/shares/:id')
  @Permissions('marketplace:read')
  @ApiOperation({ summary: 'Get one share' })
  async get(@Param('id') id: string) {
    return this.shares.getRow(id);
  }

  @Post('console/marketplace/shares/:id/accept')
  @Permissions('marketplace:accept')
  @ApiOperation({ summary: 'Reseller: accept a pending share request' })
  async accept(@Param('id') id: string) {
    const share = await this.shares.accept(id);
    return this.shares.getRow(share.publicId);
  }

  @Post('console/marketplace/shares/:id/reject')
  @Permissions('marketplace:reject')
  @ApiOperation({ summary: 'Reseller: reject a pending share request' })
  async reject(@Param('id') id: string) {
    const share = await this.shares.reject(id);
    return this.shares.getRow(share.publicId);
  }

  @Post('console/marketplace/shares/:id/pause')
  @Permissions('marketplace:unshare')
  @ApiOperation({ summary: 'Supplier: temporarily stop a reseller from sourcing this product' })
  async pause(@Param('id') id: string) {
    const share = await this.shares.pause(id);
    return this.shares.getRow(share.publicId);
  }

  @Post('console/marketplace/shares/:id/resume')
  @Permissions('marketplace:unshare')
  @ApiOperation({ summary: 'Supplier: resume a paused share' })
  async resume(@Param('id') id: string) {
    const share = await this.shares.resume(id);
    return this.shares.getRow(share.publicId);
  }

  @Post('console/marketplace/shares/:id/revoke')
  @Permissions('marketplace:unshare')
  @ApiOperation({ summary: 'Supplier: permanently stop sharing this product with this reseller' })
  async revoke(@Param('id') id: string) {
    const share = await this.shares.revoke(id);
    return this.shares.getRow(share.publicId);
  }
}
