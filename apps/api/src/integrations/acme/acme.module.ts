import { Global, Module } from '@nestjs/common';
import { AcmeAccountRepository } from './acme-account.repository';
import { AcmeClientService } from './acme-client.service';

/** Exposes `AcmeClientService` platform-wide — `DomainModule` is its only consumer today. */
@Global()
@Module({
  providers: [AcmeAccountRepository, AcmeClientService],
  exports: [AcmeClientService],
})
export class AcmeModule {}
