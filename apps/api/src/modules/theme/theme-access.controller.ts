import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { z } from 'zod';
import { Permissions, PlatformOnly, Public, Validate } from '../../common/decorators';
import { ThemeAccessService } from './theme-access.service';

const code = z.enum(['default', 'organic', 'famms']);
export const themeAccessSchema = z
  .object({
    selectedTheme: code,
    allowedThemes: z.array(code).max(3),
  })
  .strict();

@Controller({ version: '1' })
export class ThemeAccessController {
  constructor(private readonly access: ThemeAccessService) {}

  @Get('platform/themes')
  @PlatformOnly()
  @Permissions('platform.tenant:read')
  list() {
    return this.access.list();
  }

  @Put('platform/themes/:companyId')
  @PlatformOnly()
  @Permissions('platform.tenant:update')
  @Validate(themeAccessSchema)
  update(@Param('companyId') id: string, @Body() body: z.infer<typeof themeAccessSchema>) {
    return this.access.update(id, body);
  }

  @Get('storefront/theme-assignment')
  @Public()
  current() {
    return this.access.current();
  }
}
