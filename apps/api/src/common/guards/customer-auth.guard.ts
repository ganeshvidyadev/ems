import { Injectable, type CanActivate, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { RequestContextService } from '../services/request-context.service';

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly context: RequestContextService) {}

  canActivate(executionContext: ExecutionContext): boolean {
    if (executionContext.getType() !== 'http') return true;

    const ctx = this.context.get();
    if (!ctx?.customerId) {
      throw new UnauthorizedException('Customer authentication required');
    }
    return true;
  }
}
