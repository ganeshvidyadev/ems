import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  acceptInvitationRequestSchema,
  createInvitationRequestSchema,
  type AcceptInvitationRequest,
  type CreateInvitationRequest,
} from '@ems/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Permissions, Public } from '../../common/decorators';
import { InvitationService } from './invitation.service';

/**
 * Staff invitations.
 *
 * Management routes require `user:invite`; the accept and preview routes are `@Public()`
 * because the invitee has no account yet — they authenticate by holding a single-use
 * emailed token.
 */
@ApiTags('users')
@Controller({ path: 'console/invitations', version: '1' })
export class InvitationController {
  constructor(private readonly invitations: InvitationService) {}

  @Get()
  @Permissions('user:read')
  @ApiOperation({ summary: 'List invitations for the current tenant' })
  async list(@Query('status') status?: string) {
    return this.invitations.list(status);
  }

  @Post()
  @Permissions('user:invite')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite a staff member' })
  async invite(
    @Body(new ZodValidationPipe(createInvitationRequestSchema)) body: CreateInvitationRequest,
  ) {
    return this.invitations.invite(body);
  }

  @Post(':id/resend')
  @Permissions('user:invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend an invitation with a fresh token' })
  async resend(@Param('id') id: string) {
    await this.invitations.resend(id);
    return { message: 'Invitation resent.' };
  }

  @Delete(':id')
  @Permissions('user:invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  async revoke(@Param('id') id: string) {
    await this.invitations.revoke(id);
    return { message: 'Invitation revoked.' };
  }
}

/**
 * Public acceptance surface.
 *
 * A separate controller under a different path so the permission-guarded management
 * routes and these unauthenticated ones cannot be confused for one another — and so a
 * class-level decorator on either can never accidentally cover the other.
 */
@ApiTags('users')
@Controller({ path: 'invitations', version: '1' })
export class InvitationAcceptController {
  constructor(private readonly invitations: InvitationService) {}

  @Public()
  @Get('preview')
  @ApiOperation({ summary: 'Preview an invitation before accepting' })
  async preview(@Query('token') token: string) {
    return this.invitations.preview(token ?? '');
  }

  @Public()
  @Post('accept')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Accept an invitation and create the account' })
  async accept(
    @Body(new ZodValidationPipe(acceptInvitationRequestSchema)) body: AcceptInvitationRequest,
  ) {
    const result = await this.invitations.accept(body);
    return {
      userId: result.userPublicId,
      tenantSlug: result.tenantSlug,
      message: 'Account created. You can now sign in.',
    };
  }
}
