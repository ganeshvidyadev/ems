import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalServiceError } from '@ems/kernel';
import { createHash, generateKeyPairSync, createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import type { DomainsConfig } from '../../config/configuration';
import { CryptoService } from '../../common/services/crypto.service';
import { AcmeAccountRepository } from './acme-account.repository';
import { base64url, jwkThumbprint, publicJwk, signJws } from './jose.util';
import { assertAsciiHostname, buildCertificateSigningRequestDer } from './csr.util';

interface AcmeDirectory {
  newNonce: string;
  newAccount: string;
  newOrder: string;
  revokeCert: string;
  keyChange: string;
}

export interface AcmeOrder {
  orderUrl: string;
  status: string;
  authorizations: string[];
  finalizeUrl: string;
  certificateUrl: string | null;
}

export interface AcmeDns01Challenge {
  challengeUrl: string;
  challengeStatus: string;
  authorizationStatus: string;
  token: string;
  /** `token + '.' + thumbprint` — the value the TXT record must hash. */
  keyAuthorization: string;
  /** `base64url(sha256(keyAuthorization))` — publish this exact string as the TXT record content. */
  dnsTxtValue: string;
}

export interface IssuedCertificate {
  certificatePem: string;
  privateKeyPem: string;
}

/**
 * A hand-rolled ACME v2 client (RFC 8555), scoped to exactly what
 * certificate issuance for a custom domain needs: account bootstrap,
 * order creation, DNS-01 challenge material, and finalize/download.
 *
 * No npm ACME library is available in this environment, so this speaks the
 * protocol directly over `fetch` — JWS signing and PKCS#10 CSR encoding are
 * hand-built in `jose.util.ts`/`csr.util.ts`/`der.util.ts`.
 *
 * Deliberately knows nothing about `tenant_domains`, `DnsProviderPort`, or
 * storage — this is a pure protocol client. Orchestrating "verify ownership,
 * publish the challenge, wait, issue, store" is `DomainCertificateService`'s
 * job, the same layering as `PaymentGatewayPort` vs. the checkout service
 * that calls it.
 */
@Injectable()
export class AcmeClientService {
  private readonly logger = new Logger(AcmeClientService.name);
  private readonly config: DomainsConfig;

  private directoryCache: AcmeDirectory | null = null;
  private nextNonce: string | null = null;
  private lock: Promise<unknown> = Promise.resolve();

  private accountKey: { privateKey: KeyObject; publicKey: KeyObject } | null = null;
  private accountUrl: string | null = null;
  private thumbprint: string | null = null;

  constructor(
    configService: ConfigService,
    private readonly crypto: CryptoService,
    private readonly accounts: AcmeAccountRepository,
  ) {
    this.config = configService.getOrThrow<DomainsConfig>('domains');
  }

  /** Ensures an account exists against the configured directory, loading or registering it. */
  async ensureAccount(): Promise<{ accountUrl: string; thumbprint: string }> {
    if (this.accountUrl && this.thumbprint) {
      return { accountUrl: this.accountUrl, thumbprint: this.thumbprint };
    }

    const existing = await this.accounts.findByDirectory(this.config.acmeDirectoryUrl);
    if (existing) {
      const pem = this.crypto.decrypt(existing.privateKeyEncrypted);
      const privateKey = createPrivateKey(pem);
      this.accountKey = { privateKey, publicKey: createPublicKey(privateKey) };
      this.accountUrl = existing.accountUrl;
      this.thumbprint = existing.jwkThumbprint;
      return { accountUrl: this.accountUrl, thumbprint: this.thumbprint };
    }

    return this.registerAccount();
  }

  private async registerAccount(): Promise<{ accountUrl: string; thumbprint: string }> {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    this.accountKey = { privateKey, publicKey };
    const jwk = publicJwk(publicKey);
    const thumbprint = jwkThumbprint(jwk);

    const contact = this.config.acmeAccountEmail ? [`mailto:${this.config.acmeAccountEmail}`] : undefined;
    const response = await this.signedRequest<{ status: string }>(
      (await this.directory()).newAccount,
      { termsOfServiceAgreed: true, ...(contact ? { contact } : {}) },
      { useJwk: true },
    );

    const accountUrl = response.headers.get('location');
    if (!accountUrl) {
      throw new ExternalServiceError('acme', 'ACME newAccount response carried no Location header');
    }

    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    await this.accounts.create({
      directoryUrl: this.config.acmeDirectoryUrl,
      accountUrl,
      privateKeyEncrypted: this.crypto.encrypt(privateKeyPem),
      jwkThumbprint: thumbprint,
    });

    this.accountUrl = accountUrl;
    this.thumbprint = thumbprint;
    this.logger.log(`Registered a new ACME account at ${this.config.acmeDirectoryUrl}`);
    return { accountUrl, thumbprint };
  }

  async createOrder(hostnames: string[]): Promise<AcmeOrder> {
    hostnames.forEach(assertAsciiHostname);
    await this.ensureAccount();

    const response = await this.signedRequest<{
      status: string;
      authorizations: string[];
      finalize: string;
      certificate?: string;
    }>((await this.directory()).newOrder, {
      identifiers: hostnames.map((value) => ({ type: 'dns', value })),
    });

    const orderUrl = response.headers.get('location');
    if (!orderUrl) throw new ExternalServiceError('acme', 'ACME newOrder response carried no Location header');

    return {
      orderUrl,
      status: response.body.status,
      authorizations: response.body.authorizations,
      finalizeUrl: response.body.finalize,
      certificateUrl: response.body.certificate ?? null,
    };
  }

  /** Fetches an authorization and extracts its `dns-01` challenge, computing the exact TXT value to publish. */
  async getDns01Challenge(authorizationUrl: string): Promise<AcmeDns01Challenge | null> {
    await this.ensureAccount();

    const response = await this.signedRequest<{
      status: string;
      challenges: Array<{ type: string; url: string; token: string; status: string }>;
    }>(authorizationUrl, '');

    const challenge = response.body.challenges.find((c) => c.type === 'dns-01');
    if (!challenge) return null;

    const keyAuthorization = `${challenge.token}.${this.thumbprint}`;
    const dnsTxtValue = base64url(createHash('sha256').update(keyAuthorization, 'utf8').digest());

    return {
      challengeUrl: challenge.url,
      challengeStatus: challenge.status,
      authorizationStatus: response.body.status,
      token: challenge.token,
      keyAuthorization,
      dnsTxtValue,
    };
  }

  /** Tells the CA to attempt validation now — call only after the TXT record is confirmed live. */
  async triggerChallenge(challengeUrl: string): Promise<void> {
    await this.ensureAccount();
    // RFC 8555 §7.5.1: the trigger payload is `{}`, distinct from the empty-string
    // payload a POST-as-GET (like `getDns01Challenge`'s GET-via-POST) uses.
    await this.signedRequest(challengeUrl, {});
  }

  /**
   * Polls an authorization until it leaves `pending`, honouring `Retry-After`.
   * ACME's own validation is normally seconds once the record resolves — this
   * is not where the 72-hour ownership backoff lives (that's DNS propagation
   * of a merchant-controlled record, checked before this is ever called).
   */
  async waitForAuthorizationValid(authorizationUrl: string, timeoutMs = 120_000): Promise<void> {
    await this.ensureAccount();
    const deadline = Date.now() + timeoutMs;
    let delayMs = 2000;

    while (Date.now() < deadline) {
      const response = await this.signedRequest<{ status: string }>(authorizationUrl, '');
      if (response.body.status === 'valid') return;
      if (response.body.status === 'invalid') {
        throw new ExternalServiceError('acme', `Authorization ${authorizationUrl} became invalid`);
      }

      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
      await sleep(retryAfterMs && retryAfterMs > 0 ? retryAfterMs : delayMs);
      delayMs = Math.min(delayMs * 1.5, 10_000);
    }

    throw new ExternalServiceError('acme', `Authorization ${authorizationUrl} did not become valid within ${timeoutMs}ms`);
  }

  /** Generates a fresh certificate keypair, finalizes the order with its CSR, and downloads the issued chain. */
  async finalizeAndDownload(order: Pick<AcmeOrder, 'finalizeUrl' | 'orderUrl'>, hostnames: string[]): Promise<IssuedCertificate> {
    await this.ensureAccount();

    const certKeyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const csrDer = buildCertificateSigningRequestDer(hostnames, certKeyPair);

    await this.signedRequest(order.finalizeUrl, { csr: base64url(csrDer) });

    const certificateUrl = await this.waitForOrderValid(order.orderUrl);
    const certificatePem = await this.downloadCertificate(certificateUrl);
    const privateKeyPem = certKeyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

    return { certificatePem, privateKeyPem };
  }

  private async waitForOrderValid(orderUrl: string, timeoutMs = 120_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let delayMs = 2000;

    while (Date.now() < deadline) {
      const response = await this.signedRequest<{ status: string; certificate?: string }>(orderUrl, '');
      if (response.body.status === 'valid' && response.body.certificate) return response.body.certificate;
      if (response.body.status === 'invalid') {
        throw new ExternalServiceError('acme', `Order ${orderUrl} became invalid during finalization`);
      }
      await sleep(delayMs);
      delayMs = Math.min(delayMs * 1.5, 10_000);
    }

    throw new ExternalServiceError('acme', `Order ${orderUrl} did not finalize within ${timeoutMs}ms`);
  }

  private async downloadCertificate(certificateUrl: string): Promise<string> {
    const response = await this.signedRequest<string>(certificateUrl, '');
    return response.body;
  }

  // ---------------------------------------------------------------------
  // Protocol plumbing
  // ---------------------------------------------------------------------

  private async directory(): Promise<AcmeDirectory> {
    if (this.directoryCache) return this.directoryCache;

    const response = await fetch(this.config.acmeDirectoryUrl);
    if (!response.ok) {
      throw new ExternalServiceError('acme', `Failed to fetch ACME directory at ${this.config.acmeDirectoryUrl}`, {
        status: response.status,
      });
    }
    const body = (await response.json()) as AcmeDirectory;
    this.directoryCache = body;
    return body;
  }

  private async freshNonce(): Promise<string> {
    if (this.nextNonce) {
      const nonce = this.nextNonce;
      this.nextNonce = null;
      return nonce;
    }
    const response = await fetch((await this.directory()).newNonce, { method: 'HEAD' });
    const nonce = response.headers.get('replay-nonce');
    if (!nonce) throw new ExternalServiceError('acme', 'ACME newNonce response carried no Replay-Nonce header');
    return nonce;
  }

  /**
   * Signs and sends one ACME request, serialized against every other signed
   * request on this instance — two requests racing for the same nonce would
   * make the CA reject the second with `badNonce`.
   */
  private async signedRequest<T>(
    url: string,
    payload: Record<string, unknown> | '',
    opts: { useJwk?: boolean } = {},
  ): Promise<{ status: number; headers: Headers; body: T }> {
    const run = this.lock.then(() => this.doSignedRequest<T>(url, payload, opts));
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async doSignedRequest<T>(
    url: string,
    payload: Record<string, unknown> | '',
    opts: { useJwk?: boolean },
  ): Promise<{ status: number; headers: Headers; body: T }> {
    if (!this.accountKey) throw new ExternalServiceError('acme', 'signedRequest called before an account key exists');

    const nonce = await this.freshNonce();
    const protectedHeader: Record<string, unknown> = { alg: 'RS256', nonce, url };
    if (opts.useJwk) {
      protectedHeader.jwk = publicJwk(this.accountKey.publicKey);
    } else {
      if (!this.accountUrl) throw new ExternalServiceError('acme', 'signedRequest (kid mode) called before an account URL is known');
      protectedHeader.kid = this.accountUrl;
    }

    const jws = signJws({ protectedHeader, payload, privateKey: this.accountKey.privateKey });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/jose+json' },
      body: JSON.stringify(jws),
    });

    const newNonce = response.headers.get('replay-nonce');
    if (newNonce) this.nextNonce = newNonce;

    const contentType = response.headers.get('content-type') ?? '';
    const isJson = contentType.includes('json');
    const rawBody = response.status === 204 ? '' : await response.text();
    const body = (isJson && rawBody ? JSON.parse(rawBody) : rawBody) as T;

    if (!response.ok) {
      const problem = isJson && rawBody ? (JSON.parse(rawBody) as { type?: string; detail?: string }) : {};
      throw new ExternalServiceError('acme', `ACME request to ${url} failed: ${problem.detail ?? problem.type ?? response.status}`, {
        status: response.status,
        url,
      });
    }

    return { status: response.status, headers: response.headers, body };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
