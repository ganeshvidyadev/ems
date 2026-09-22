import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Put,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response, CookieOptions } from 'express';
import {
  customerChangePasswordRequestSchema,
  customerForgotPasswordRequestSchema,
  customerLoginRequestSchema,
  customerRegisterRequestSchema,
  customerResetPasswordRequestSchema,
  customerUpdateProfileRequestSchema,
  type CustomerChangePasswordRequest,
  type CustomerForgotPasswordRequest,
  type CustomerLoginRequest,
  type CustomerRegisterRequest,
  type CustomerResetPasswordRequest,
  type CustomerUpdateProfileRequest,
} from '@ems/contracts';
import { UserEntity } from '../../database/entities';
import { CustomerAuth, Public, Validate } from '../../common/decorators';
import { HashService } from '../../common/services/hash.service';
import { RequestContextService } from '../../common/services/request-context.service';
import { MailService } from '../notification/mail.service';
import { AuthTokenService } from '../auth/services/auth-token.service';
import { TokenService } from '../auth/services/token.service';
import { CustomerRepository } from './customer.repository';
import { CustomerService } from './customer.service';

export const CUSTOMER_COOKIE_NAME = 'customer_token';
const isProduction = process.env.NODE_ENV === 'production';

function buildCustomerCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  };
}

function clearCustomerCookie(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
}

@ApiTags('storefront-auth')
@Controller({ path: 'storefront/auth', version: '1' })
export class CustomerStorefrontAuthController {
  constructor(
    private readonly customers: CustomerService,
    private readonly customerRepository: CustomerRepository,
    private readonly tokens: TokenService,
    private readonly authTokens: AuthTokenService,
    private readonly hash: HashService,
    private readonly mail: MailService,
    private readonly context: RequestContextService,
  ) {}

  @Public()
  @Post('register')
  @Validate(customerRegisterRequestSchema)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new customer account' })
  async register(
    @Body() body: CustomerRegisterRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const storeId = this.context.storeId ?? (await this.customerRepository.defaultStoreId());
    if (!storeId) {
      throw new BadRequestException('Store context not resolved');
    }

    const storePublicId = (await this.customerRepository.storePublicId(storeId)) ?? storeId;
    const customer = await this.customers.create({
      ...body,
      storeId: storePublicId,
    });

    const token = this.tokens.signStorefrontToken({
      sub: customer.publicId,
      uid: customer.id,
      tid: customer.tenantId,
      sid: customer.storeId,
    });

    response.cookie(CUSTOMER_COOKIE_NAME, token.token, buildCustomerCookieOptions(token.expiresAt));

    return {
      accessToken: token.token,
      customer: this.customers.toResponse(customer, storePublicId),
    };
  }

  @Public()
  @Post('login')
  @Validate(customerLoginRequestSchema)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in as a customer' })
  async login(
    @Body() body: CustomerLoginRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const storeId = this.context.storeId ?? (await this.customerRepository.defaultStoreId());
    if (!storeId) {
      throw new BadRequestException('Store context not resolved');
    }

    const emailNormalized = UserEntity.normalizeEmail(body.email);
    const customer = await this.customerRepository.findByEmail(storeId, emailNormalized);

    if (!customer || !customer.passwordHash) {
      await this.hash.dummyCompare();
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await this.hash.verify(body.password, customer.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (customer.status !== 'ACTIVE') {
      throw new ForbiddenException(`Account is ${customer.status.toLowerCase()}`);
    }

    const storePublicId = (await this.customerRepository.storePublicId(storeId)) ?? storeId;
    const token = this.tokens.signStorefrontToken({
      sub: customer.publicId,
      uid: customer.id,
      tid: customer.tenantId,
      sid: customer.storeId,
    });

    response.cookie(CUSTOMER_COOKIE_NAME, token.token, buildCustomerCookieOptions(token.expiresAt));

    return {
      accessToken: token.token,
      customer: this.customers.toResponse(customer, storePublicId),
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out current customer session' })
  async logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(CUSTOMER_COOKIE_NAME, clearCustomerCookie());
    return { success: true, message: 'Logged out successfully' };
  }

  @CustomerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get current customer profile' })
  async me() {
    const customerId = this.context.customerId;
    if (!customerId) throw new UnauthorizedException('Customer authentication required');

    const customer = await this.customerRepository.findOne({ where: { id: customerId } as never });
    if (!customer) throw new NotFoundException('Customer profile not found');

    const storePublicId = (await this.customerRepository.storePublicId(customer.storeId)) ?? customer.storeId;
    return this.customers.toResponse(customer, storePublicId);
  }

  @CustomerAuth()
  @Put('profile')
  @Validate(customerUpdateProfileRequestSchema)
  @ApiOperation({ summary: 'Update customer personal profile' })
  async updateProfile(@Body() body: CustomerUpdateProfileRequest) {
    const customerId = this.context.customerId;
    if (!customerId) throw new UnauthorizedException('Customer authentication required');

    const customer = await this.customerRepository.findOne({ where: { id: customerId } as never });
    if (!customer) throw new NotFoundException('Customer not found');

    if (body.firstName !== undefined) customer.firstName = body.firstName;
    if (body.lastName !== undefined) customer.lastName = body.lastName;
    if (body.phone !== undefined) customer.phoneE164 = body.phone;
    if (body.acceptsMarketing !== undefined) customer.acceptsMarketing = body.acceptsMarketing;

    await this.customerRepository.save(customer);

    const storePublicId = (await this.customerRepository.storePublicId(customer.storeId)) ?? customer.storeId;
    return this.customers.toResponse(customer, storePublicId);
  }

  @CustomerAuth()
  @Put('change-password')
  @Validate(customerChangePasswordRequestSchema)
  @ApiOperation({ summary: 'Change customer password' })
  async changePassword(@Body() body: CustomerChangePasswordRequest) {
    const customerId = this.context.customerId;
    if (!customerId) throw new UnauthorizedException('Customer authentication required');

    const customer = await this.customerRepository.findOne({ where: { id: customerId } as never });
    if (!customer) throw new NotFoundException('Customer not found');

    if (!customer.passwordHash) {
      throw new BadRequestException('Account does not have a password configured');
    }

    const valid = await this.hash.verify(body.currentPassword, customer.passwordHash);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }

    customer.passwordHash = await this.hash.hash(body.newPassword);
    await this.customerRepository.save(customer);

    return { message: 'Password changed successfully' };
  }

  @Public()
  @Post('forgot-password')
  @Validate(customerForgotPasswordRequestSchema)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request customer password reset' })
  async forgotPassword(@Body() body: CustomerForgotPasswordRequest) {
    const storeId = this.context.storeId ?? (await this.customerRepository.defaultStoreId());
    if (!storeId) {
      return { message: 'If an account exists for that address, a reset link is on its way.' };
    }

    const emailNormalized = UserEntity.normalizeEmail(body.email);
    const customer = await this.customerRepository.findByEmail(storeId, emailNormalized);

    if (customer && customer.email) {
      const reset = await this.authTokens.issue(
        customer.id,
        customer.tenantId,
        'PASSWORD_RESET',
        customer.email,
        { customerPublicId: customer.publicId },
      );
      await this.mail.sendPasswordReset(customer.email, customer.firstName ?? 'Customer', reset.token);
    }

    return { message: 'If an account exists for that address, a reset link is on its way.' };
  }

  @Public()
  @Post('reset-password')
  @Validate(customerResetPasswordRequestSchema)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset customer password using token' })
  async resetPassword(@Body() body: CustomerResetPasswordRequest) {
    const consumed = await this.authTokens.consume(body.token, 'PASSWORD_RESET');
    if (!consumed) {
      throw new BadRequestException('This reset link is invalid or expired');
    }

    const customer = await this.customerRepository.findOne({ where: { id: consumed.userId } as never });
    if (!customer) {
      throw new BadRequestException('Customer account not found');
    }

    customer.passwordHash = await this.hash.hash(body.password);
    await this.customerRepository.save(customer);

    return { message: 'Password updated successfully. You may now sign in.' };
  }
}
