import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  inspectReturnRequestSchema,
  rejectReturnRequestSchema,
  requestReturnRequestSchema,
} from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { ReturnService } from './return.service';

@ApiTags('returns')
@Controller({ version: '1' })
export class ReturnController {
  constructor(private readonly returns: ReturnService) {}

  @Get('console/returns')
  @Permissions('return:read')
  @ApiOperation({ summary: 'List returns, optionally for one order' })
  async list(@Query('orderId') orderId?: string) {
    const rows = await this.returns.list(orderId);
    return Promise.all(rows.map((r) => this.returns.toResponse(r)));
  }

  @Get('console/returns/:id')
  @Permissions('return:read')
  @ApiOperation({ summary: 'Get a return' })
  async get(@Param('id') id: string) {
    return this.returns.toResponse(await this.returns.getByPublicId(id));
  }

  @Post('console/orders/:orderId/returns')
  @Permissions('order:update')
  @Validate(requestReturnRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Open a return/RMA against an order' })
  async request(
    @Param('orderId') orderId: string,
    @Body() body: ReturnType<typeof requestReturnRequestSchema.parse>,
  ) {
    return this.returns.toResponse(await this.returns.request(orderId, body));
  }

  @Post('console/returns/:id/approve')
  @Permissions('return:approve')
  @ApiOperation({ summary: 'Approve a requested return' })
  async approve(@Param('id') id: string) {
    return this.returns.toResponse(await this.returns.approve(id));
  }

  @Post('console/returns/:id/reject')
  @Permissions('return:reject')
  @Validate(rejectReturnRequestSchema)
  @ApiOperation({ summary: 'Reject a requested return' })
  async reject(@Param('id') id: string, @Body() body: ReturnType<typeof rejectReturnRequestSchema.parse>) {
    return this.returns.toResponse(await this.returns.reject(id, body.reason));
  }

  @Post('console/returns/:id/receive')
  @Permissions('return:receive')
  @ApiOperation({ summary: 'Mark a return as received back at the warehouse' })
  async receive(@Param('id') id: string) {
    return this.returns.toResponse(await this.returns.markReceived(id));
  }

  @Post('console/returns/:id/inspect')
  @Permissions('return:receive')
  @Validate(inspectReturnRequestSchema)
  @ApiOperation({ summary: 'Record inspection results and restock decision' })
  async inspect(@Param('id') id: string, @Body() body: ReturnType<typeof inspectReturnRequestSchema.parse>) {
    return this.returns.toResponse(await this.returns.inspect(id, body));
  }

  @Post('console/returns/:id/complete')
  @Permissions('return:receive')
  @ApiOperation({ summary: 'Close out a return after inspection' })
  async complete(@Param('id') id: string) {
    return this.returns.toResponse(await this.returns.complete(id));
  }
}
