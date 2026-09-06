import { Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators';
import { ALL_QUEUES, type QueueName } from '../../queues/queue-names.enum';
import { QueueRegistry } from '../../queues/queue.registry';

/** Directly satisfies the Phase 11 exit criterion: "failed jobs are replayable from the admin UI" (API-level; the UI itself is out of scope). */
@ApiTags('platform-ops')
@Controller({ version: '1' })
export class QueueAdminController {
  constructor(private readonly queues: QueueRegistry) {}

  @Get('platform/queues')
  @Permissions('platform.queue:read')
  @ApiOperation({ summary: 'Depth (waiting/active/failed/delayed) for every registered queue' })
  async depths() {
    return this.queues.depths();
  }

  @Get('platform/queues/:name/failed')
  @Permissions('platform.queue:read')
  @ApiOperation({ summary: 'List failed jobs for one queue' })
  async listFailed(@Param('name') name: string, @Query('limit') limitRaw?: string) {
    const queueName = this.requireQueue(name);
    const limit = Math.min(Math.max(Number(limitRaw) || 25, 1), 100);
    const jobs = await this.queues.get(queueName).getFailed(0, limit - 1);

    return jobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data as unknown,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: new Date(job.timestamp).toISOString(),
    }));
  }

  @Post('platform/queues/:name/jobs/:id/retry')
  @Permissions('platform.queue:retry')
  @ApiOperation({ summary: 'Re-enqueue one failed job' })
  async retry(@Param('name') name: string, @Param('id') id: string) {
    const queueName = this.requireQueue(name);
    const job = await this.queues.get(queueName).getJob(id);
    if (!job) throw new NotFoundException(`Job '${id}' not found in queue '${name}'`);

    await job.retry();
    return { id: job.id, status: 'retrying' };
  }

  private requireQueue(name: string): QueueName {
    const match = ALL_QUEUES.find((q) => q === name);
    if (!match) throw new NotFoundException(`Unknown queue '${name}'`);
    return match;
  }
}
