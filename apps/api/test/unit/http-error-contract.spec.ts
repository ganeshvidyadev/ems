import 'reflect-metadata';
import type { ArgumentsHost } from '@nestjs/common';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { RequestContextService } from '../../src/common/services/request-context.service';

describe('Errors before request-context middleware', () => {
  it('returns a specific 413 code and the same generated correlation ID in body and header', () => {
    const response = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = { switchToHttp: () => ({ getResponse: () => response,
      getRequest: () => ({ method: 'POST', originalUrl: '/api/v1/auth/login' }) }) } as unknown as ArgumentsHost;
    const error = Object.assign(new Error('internal parser details'), { status: 413, type: 'entity.too.large' });
    new GlobalExceptionFilter(new RequestContextService(), true).catch(error, host);
    const body = response.json.mock.calls[0]![0];
    expect(response.status).toHaveBeenCalledWith(413);
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(body.error.message).toBe('The request body is too large');
    expect(body.meta.correlationId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(response.setHeader).toHaveBeenCalledWith('X-Correlation-Id', body.meta.correlationId);
  });
});
