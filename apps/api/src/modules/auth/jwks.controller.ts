import { Controller, Get, Header, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { RawResponse } from '../../common/interceptors/response-envelope.interceptor';
import { TokenService } from './services/token.service';

/**
 * JWKS discovery.
 *
 * Publishing the public key is what lets the storefront, queue workers and any future
 * service verify tokens **without holding signing power** — the entire reason for
 * choosing RS256 over a shared secret.
 *
 * It is also what makes key rotation possible without downtime: a new `kid` can start
 * signing while verifiers still resolve the previous key for tokens already in flight.
 *
 * Unversioned and outside the response envelope because JWKS is a standardised format
 * (RFC 7517) that third-party libraries parse; wrapping it in `{ success, data }` would
 * make it unreadable to every off-the-shelf verifier.
 */
@Controller({ path: '.well-known', version: VERSION_NEUTRAL })
@ApiExcludeController()
export class JwksController {
  constructor(private readonly tokens: TokenService) {}

  @Public()
  @Get('jwks.json')
  // Cacheable: the key changes only on rotation, and verifiers refetch on an unknown kid.
  @Header('Cache-Control', 'public, max-age=3600')
  getJwks(): RawResponse<{ keys: Record<string, string>[] }> {
    return new RawResponse(this.tokens.getJwks());
  }
}
