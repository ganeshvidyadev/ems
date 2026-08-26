import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { JobService } from './job.service';

@ApiTags('jobs')
@Controller({ path: 'console/jobs', version: '1' })
export class JobController {
  constructor(private readonly jobs: JobService) {}

  @Get(':id')
  @Permissions('job:read')
  @ApiOperation({ summary: 'Status of a bulk import/export job' })
  async get(@Param('id') id: string) {
    return this.jobs.toResponse(await this.jobs.get(id));
  }
}
