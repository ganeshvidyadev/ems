import { Global, Module } from '@nestjs/common';
import { DomainCertificateService } from './domain-certificate.service';
import { DomainController } from './domain.controller';
import { DomainRepository } from './domain.repository';
import { DomainService } from './domain.service';
import { DomainVerificationService } from './domain-verification.service';
import { NginxConfigService } from './nginx-config.service';

/**
 * Global so `DomainVerificationProcessor` (registered in `QueueModule`, which
 * loads before this module in `AppModule`'s import list) can inject
 * `DomainService`/`DomainRepository` without an import edge back — the same
 * pattern `ProvisioningModule` already establishes for its own processor.
 */
@Global()
@Module({
  controllers: [DomainController],
  providers: [DomainRepository, DomainVerificationService, DomainCertificateService, NginxConfigService, DomainService],
  exports: [DomainService, DomainRepository, DomainVerificationService],
})
export class DomainModule {}
