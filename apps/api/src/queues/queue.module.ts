import { Global, Module } from '@nestjs/common';
import { OutboxRelayService } from './outbox-relay.service';
import { QueueRegistry } from './queue.registry';
import { ProvisioningProcessor } from './processors/provisioning.processor';

/**
 * Queue infrastructure.
 *
 * `OutboxRelayService` is registered here but only *starts* when
 * `OUTBOX_RELAY_ENABLED` is true — which is set for the worker process and left off
 * for the API. Registering it in both means the API can still read relay lag for
 * `/metrics` and health, while only the worker actually polls. N API replicas all
 * polling the outbox would multiply database load without dispatching anything
 * faster.
 */
@Global()
@Module({
  providers: [QueueRegistry, OutboxRelayService, ProvisioningProcessor],
  exports: [QueueRegistry, OutboxRelayService],
})
export class QueueModule {}
