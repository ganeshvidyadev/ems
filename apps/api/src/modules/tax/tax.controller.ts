import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createTaxClassRequestSchema,
  createTaxRateRequestSchema,
  updateTaxClassRequestSchema,
  updateTaxRateRequestSchema,
} from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TaxService } from './tax.service';

@ApiTags('tax')
@Controller({ path: 'console/tax', version: '1' })
export class TaxController {
  constructor(private readonly tax: TaxService) {}

  @Get('classes')
  @Permissions('tax:read')
  @ApiOperation({ summary: 'List tax classes' })
  async listClasses() {
    const classes = await this.tax.listClasses();
    return classes.map((c) => this.tax.toClassResponse(c));
  }

  @Post('classes')
  @Permissions('tax:update')
  @Validate(createTaxClassRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a tax class' })
  async createClass(@Body() body: ReturnType<typeof createTaxClassRequestSchema.parse>) {
    return this.tax.toClassResponse(await this.tax.createClass(body));
  }

  @Put('classes/:id')
  @Permissions('tax:update')
  @ApiOperation({ summary: 'Update a tax class' })
  async updateClass(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTaxClassRequestSchema))
    body: ReturnType<typeof updateTaxClassRequestSchema.parse>,
  ) {
    return this.tax.toClassResponse(await this.tax.updateClass(id, body));
  }

  @Delete('classes/:id')
  @Permissions('tax:update')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tax class' })
  async removeClass(@Param('id') id: string): Promise<void> {
    await this.tax.removeClass(id);
  }

  @Get('rates')
  @Permissions('tax:read')
  @ApiOperation({ summary: 'List tax rates, optionally for one class' })
  async listRates(@Query('taxClassId') taxClassId?: string) {
    const rates = await this.tax.listRates(taxClassId);
    return Promise.all(rates.map((r) => this.tax.toRateResponse(r)));
  }

  @Post('rates')
  @Permissions('tax:update')
  @Validate(createTaxRateRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a tax rate' })
  async createRate(@Body() body: ReturnType<typeof createTaxRateRequestSchema.parse>) {
    return this.tax.toRateResponse(await this.tax.createRate(body));
  }

  @Put('rates/:id')
  @Permissions('tax:update')
  @ApiOperation({ summary: 'Update a tax rate' })
  async updateRate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTaxRateRequestSchema))
    body: ReturnType<typeof updateTaxRateRequestSchema.parse>,
  ) {
    return this.tax.toRateResponse(await this.tax.updateRate(id, body));
  }

  @Delete('rates/:id')
  @Permissions('tax:update')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tax rate' })
  async removeRate(@Param('id') id: string): Promise<void> {
    await this.tax.removeRate(id);
  }
}
