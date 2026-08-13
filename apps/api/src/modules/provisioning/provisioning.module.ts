import { Global, Module } from '@nestjs/common';
import { ProvisioningController } from './provisioning.controller';
import { ProvisioningService } from './provisioning.service';

/**
 * Store provisioning.
 *
 * Global because the BullMQ processor in `queues/` resolves it from the root injector, and
 * the subscription flow triggers provisioning the moment a plan is chosen.
 */
@Global()
@Module({
  controllers: [ProvisioningController],
  providers: [ProvisioningService],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}
