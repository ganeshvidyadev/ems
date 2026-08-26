import { Module } from '@nestjs/common';
import { JobController } from './job.controller';
import { JobRepository } from './job.repository';
import { JobService } from './job.service';

@Module({
  controllers: [JobController],
  providers: [JobRepository, JobService],
  exports: [JobRepository, JobService],
})
export class JobModule {}
