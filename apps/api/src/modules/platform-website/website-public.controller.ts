import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { PlatformWebsiteService } from './platform-website.service';

/**
 * Public marketing content.
 *
 * `@Public()` because `apps/marketing` is pre-signup and unauthenticated — same
 * reasoning as `PlanController.list`. Kept in its own controller/file, separate from
 * the authenticated admin CRUD surface, so the public route set stays easy to audit
 * (see `test/unit/route-exposure.spec.ts`).
 */
@ApiTags('website')
@Controller({ path: 'website', version: '1' })
export class WebsitePublicController {
  constructor(private readonly website: PlatformWebsiteService) {}

  @Public()
  @Get('content')
  @ApiOperation({ summary: 'Public marketing website content' })
  getContent() {
    return this.website.getAll();
  }
}
