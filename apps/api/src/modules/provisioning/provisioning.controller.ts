import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowDuringOnboarding, Permissions } from '../../common/decorators';
import { RequestContextService } from '../../common/services/request-context.service';
import { ProvisioningService } from './provisioning.service';

/**
 * Onboarding status.
 *
 * The wizard polls this. It is deliberately readable by any authenticated member of the
 * tenant — a store owner watching their own store being created should not need a special
 * permission to see why it stalled.
 */
@ApiTags('provisioning')
@Controller({ path: 'console/provisioning', version: '1' })
export class ProvisioningController {
  constructor(
    private readonly provisioning: ProvisioningService,
    private readonly context: RequestContextService,
  ) {}

  @Get('status')
  @AllowDuringOnboarding()
  @ApiOperation({ summary: 'Per-step provisioning status for the current tenant' })
  async status() {
    const tenantId = this.context.requireTenantId('read provisioning status');
    return this.provisioning.status(tenantId);
  }

  /**
   * Retries failed steps.
   *
   * Exposed to the merchant rather than being support-only: most provisioning failures are
   * transient, and a self-service retry resolves them without a ticket.
   */
  @Post('retry')
  // Retrying provisioning is only ever needed *while* the tenant is still provisioning.
  @AllowDuringOnboarding()
  @Permissions('store:update')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Retry failed provisioning steps' })
  async retry() {
    const tenantId = this.context.requireTenantId('retry provisioning');
    await this.provisioning.retry(tenantId);

    // Run inline rather than via the queue so the merchant sees the outcome on their next
    // poll instead of waiting for a worker to pick it up.
    const complete = await this.provisioning.run(tenantId);

    return {
      complete,
      message: complete
        ? 'Provisioning completed.'
        : 'Retry started. Watch this page for progress.',
    };
  }
}
