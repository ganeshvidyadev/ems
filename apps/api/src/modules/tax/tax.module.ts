import { Module } from '@nestjs/common';
import { TaxController } from './tax.controller';
import { TaxClassRepository, TaxRateRepository } from './tax.repository';
import { TaxService } from './tax.service';

@Module({
  controllers: [TaxController],
  providers: [TaxClassRepository, TaxRateRepository, TaxService],
  exports: [TaxService],
})
export class TaxModule {}
