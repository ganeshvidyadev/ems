import { Module } from '@nestjs/common';
import { PlatformPlanController } from './platform-plan.controller';
import { PlatformPlanService } from './platform-plan.service';

@Module({
  controllers: [PlatformPlanController],
  providers: [PlatformPlanService],
})
export class PlatformPlanModule {}
