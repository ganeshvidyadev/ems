import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { addDomainRequestSchema } from '@ems/contracts';
import { Permissions, Validate } from '../../common/decorators';
import { RawResponse } from '../../common/interceptors/response-envelope.interceptor';
import { DomainService } from './domain.service';
import { NginxConfigService } from './nginx-config.service';

@ApiTags('domains')
@Controller({ version: '1' })
export class DomainController {
  constructor(
    private readonly domains: DomainService,
    private readonly nginxConfig: NginxConfigService,
  ) {}

  @Post('console/domains')
  @Permissions('domain:create')
  @Validate(addDomainRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a custom domain — starts ownership verification' })
  async add(@Body() body: ReturnType<typeof addDomainRequestSchema.parse>) {
    const domain = await this.domains.addCustomDomain(body.hostname, body.storeId);
    return this.domains.toResponse(domain);
  }

  @Get('console/domains')
  @Permissions('domain:read')
  @ApiOperation({ summary: 'List this tenant\'s domains (platform subdomain plus any custom domains)' })
  async list() {
    const domains = await this.domains.list();
    return domains.map((d) => this.domains.toResponse(d));
  }

  @Get('console/domains/nginx-config')
  @Permissions('platform.domain:read')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Nginx server blocks for wildcard + every live custom domain (platform admin)' })
  async nginx(): Promise<RawResponse<string>> {
    return new RawResponse(await this.nginxConfig.generate());
  }

  @Get('console/domains/:id')
  @Permissions('domain:read')
  @ApiOperation({ summary: 'Get one domain' })
  async get(@Param('id') id: string) {
    return this.domains.toResponse(await this.domains.getOrFail(id));
  }

  @Get('console/domains/:id/instructions')
  @Permissions('domain:read')
  @ApiOperation({ summary: 'Copy-paste DNS records the merchant must add' })
  async instructions(@Param('id') id: string) {
    const domain = await this.domains.getOrFail(id);
    return { domain: this.domains.toResponse(domain), records: this.domains.getInstructions(domain) };
  }

  @Get('console/domains/:id/diagnostics')
  @Permissions('domain:read')
  @ApiOperation({ summary: 'Per-step verification/SSL status for support diagnosis' })
  async diagnostics(@Param('id') id: string) {
    const domain = await this.domains.getOrFail(id);
    return { domain: this.domains.toResponse(domain), steps: await this.domains.diagnostics(id) };
  }

  @Post('console/domains/:id/verify')
  @Permissions('domain:verify')
  @ApiOperation({ summary: 'Check DNS records right now instead of waiting for the next scheduled attempt' })
  async verifyNow(@Param('id') id: string) {
    const domain = await this.domains.performOwnershipCheck(id);
    return this.domains.toResponse(domain);
  }

  @Delete('console/domains/:id')
  @Permissions('domain:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a custom domain' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.domains.remove(id);
  }
}
