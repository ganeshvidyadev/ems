import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { platformSearchQuerySchema } from '@ems/contracts';
import { CurrentUser, PlatformOnly, type AuthenticatedUser } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformSearchService } from './platform-search.service';

@ApiTags('platform-search')
@Controller({ path: 'platform/search', version: '1' })
export class PlatformSearchController {
  constructor(private readonly search: PlatformSearchService) {}

  @Get()
  @PlatformOnly()
  @ApiOperation({ summary: 'Search tenants, support tickets, invoices and platform staff' })
  async run(
    @Query(new ZodValidationPipe(platformSearchQuerySchema)) query: ReturnType<typeof platformSearchQuerySchema.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return { results: await this.search.search(query.q, user.permissions) };
  }
}
