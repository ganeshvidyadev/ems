import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { JobService } from './job.service';

@ApiTags('jobs')
@Controller({ path: 'console/jobs', version: '1' })
export class JobController {
  constructor(private readonly jobs: JobService) {}

  @Get(':id')
  // OR semantics (see the `@Permissions` decorator's own comment): a tenant caller
  // needs `job:read` for their own bulk import/export jobs, and platform staff need
  // this to poll the tenant-export job `platform/tenants/:id/export` just queued —
  // `PLATFORM_SUPER_ADMIN` only ever holds `platform.*`-scoped permissions (see
  // `resolvePermissions`'s scope guard in roles.seed.ts), so `job:read` alone would
  // never be satisfiable by a platform role no matter what the role spec listed.
  @Permissions('job:read', 'platform.tenant:export')
  @ApiOperation({ summary: 'Status of a bulk import/export job' })
  async get(@Param('id') id: string) {
    return this.jobs.toResponse(await this.jobs.get(id));
  }
}
