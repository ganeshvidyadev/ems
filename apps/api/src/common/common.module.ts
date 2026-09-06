import { Global, Module } from '@nestjs/common';
import { CacheService } from './services/cache.service';
import { CryptoService } from './services/crypto.service';
import { HashService } from './services/hash.service';
import { HtmlSanitizerService } from './services/html-sanitizer.service';
import { OutboxService } from './services/outbox.service';
import { RequestContextService } from './services/request-context.service';
import { RedisModule } from './redis/redis.module';

/**
 * Cross-cutting services.
 *
 * Global because these are needed almost everywhere and threading `imports:
 * [CommonModule]` through thirty feature modules is noise that adds no
 * information. `RequestContextService` in particular must be a single instance —
 * the `AsyncLocalStorage` is static, but a second provider instance would be a
 * confusing thing to have in the graph.
 */
@Global()
@Module({
  imports: [RedisModule],
  providers: [
    RequestContextService,
    CacheService,
    CryptoService,
    HashService,
    HtmlSanitizerService,
    OutboxService,
  ],
  exports: [
    RedisModule,
    RequestContextService,
    CacheService,
    CryptoService,
    HashService,
    HtmlSanitizerService,
    OutboxService,
  ],
})
export class CommonModule {}
