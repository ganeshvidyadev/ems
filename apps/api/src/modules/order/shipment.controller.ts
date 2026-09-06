import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { checkServiceabilityRequestSchema, initiateRtoRequestSchema } from '@ems/contracts';
import { Money } from '@ems/kernel';
import { Permissions, Public, Validate } from '../../common/decorators';
import { ShippingCarrierFactory } from '../../integrations/shipping/shipping-carrier.factory';
import type { ShipmentEntity, ShipmentEventEntity } from '../../database/entities';
import { ShipmentRepository } from './shipment.repository';
import { ShipmentTrackingService } from './shipment-tracking.service';

@ApiTags('shipments')
@Controller({ version: '1' })
export class ShipmentController {
  constructor(
    private readonly shipments: ShipmentRepository,
    private readonly tracking: ShipmentTrackingService,
    private readonly shippingCarriers: ShippingCarrierFactory,
  ) {}

  @Get('console/orders/:orderId/shipments')
  @Permissions('shipment:read')
  @ApiOperation({ summary: 'List shipments for an order' })
  async listForOrder(@Param('orderId') orderId: string) {
    const rows = await this.shipments.findByOrder(orderId);
    return rows.map((s) => this.toResponse(s));
  }

  @Get('console/shipments/:id')
  @Permissions('shipment:read')
  @ApiOperation({ summary: 'Get a shipment with its tracking timeline' })
  async get(@Param('id') id: string) {
    const shipment = await this.shipments.findByPublicIdOrFail(id);
    const events = await this.tracking.getEvents(id);
    return this.toResponse(shipment, events);
  }

  @Post('console/shipments/:id/sync')
  @Permissions('shipment:track')
  @ApiOperation({ summary: "Force a tracking sync against the shipment's carrier" })
  async syncOne(@Param('id') id: string) {
    return this.toResponse(await this.tracking.syncSingle(id));
  }

  @Post('console/shipments/sync-tracking')
  @Permissions('shipment:track')
  @ApiOperation({ summary: 'Sync tracking for every shipment still in flight' })
  async syncAll(@Query('limit') limit = '100') {
    const synced = await this.tracking.syncActive(Number(limit));
    return { synced };
  }

  @Post('console/shipments/:id/rto')
  @Permissions('shipment:cancel')
  @Validate(initiateRtoRequestSchema)
  @ApiOperation({ summary: 'Initiate return-to-origin for a shipment' })
  async initiateRto(@Param('id') id: string, @Body() body: ReturnType<typeof initiateRtoRequestSchema.parse>) {
    return this.toResponse(await this.tracking.initiateRto(id, body.reason));
  }

  @Post('storefront/shipping/serviceability')
  @Public()
  @Validate(checkServiceabilityRequestSchema)
  @ApiOperation({ summary: 'Check whether a destination pincode can be served before checkout' })
  async checkServiceability(@Body() body: ReturnType<typeof checkServiceabilityRequestSchema.parse>) {
    const carrier = this.shippingCarriers.resolve();
    return carrier.checkServiceability({
      originPincode: body.originPincode,
      destinationPincode: body.destinationPincode,
      weightGrams: body.weightGrams,
      isCod: body.isCod,
    });
  }

  private toResponse(shipment: ShipmentEntity, events?: ShipmentEventEntity[]) {
    return {
      id: shipment.publicId,
      orderId: shipment.orderId,
      shipmentNumber: shipment.shipmentNumber,
      carrier: shipment.carrier,
      awbNumber: shipment.awbNumber,
      trackingUrl: shipment.trackingUrl,
      status: shipment.status,
      isCod: shipment.isCod,
      codAmount: Money.fromMinor(shipment.codAmountMinor, 'INR').toJSON(),
      events: events?.map((e) => ({
        status: e.status,
        description: e.description ?? '',
        location: e.location,
        eventAt: e.eventAt.toISOString(),
      })),
      createdAt: shipment.createdAt.toISOString(),
      updatedAt: shipment.updatedAt.toISOString(),
    };
  }
}
