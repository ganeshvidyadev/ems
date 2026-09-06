import { Injectable } from '@nestjs/common';

/**
 * Sanitizes merchant-authored HTML/CSS before it is ever persisted — CMS
 * pages, blog posts, and a tenant theme's custom CSS / head HTML all pass
 * through here first (docs/05 Phase 7: "Custom CSS/HTML cannot execute
 * injected script").
 *
 * **Honest limitation:** this is a hand-rolled allowlist sanitizer, not a
 * parser-based one (`DOMPurify`/`sanitize-html`) — this session has no way
 * to add a new pnpm dependency and keep `pnpm-lock.yaml` consistent. It
 * closes the well-known injection vectors (script tags, event-handler
 * attributes, `javascript:`/`data:` URIs, dangerous tags) that the test
 * suite exercises, but a real HTML parser handles malformed/obfuscated markup
 * more robustly than regexes ever can. Swap in a real library before this
 * accepts content from anyone less trusted than the merchant's own staff.
 */
@Injectable()
export class HtmlSanitizerService {
  private static readonly DANGEROUS_TAGS = [
    'script',
    'iframe',
    'object',
    'embed',
    'link',
    'meta',
    'base',
    'form',
    'style',
    'svg',
    'math',
    'applet',
  ];

  /** Tags allowed in `customHeadHtml` beyond what page content ever needs — analytics snippets live here. */
  private static readonly HEAD_ALLOWED_TAGS = ['script', 'meta', 'link', 'noscript', 'style'];

  /**
   * Strict profile — CMS page bodies, blog posts, product descriptions:
   * no script-capable or structural tags, no event-handler attributes, no
   * `javascript:`/`vbscript:`/`data:text/html` URIs.
   */
  sanitizeContentHtml(html: string): string {
    return this.stripDangerousUris(
      this.stripEventHandlerAttributes(this.stripComments(this.stripTags(html, HtmlSanitizerService.DANGEROUS_TAGS))),
    );
  }

  /**
   * Permissive profile for a tenant theme's `<head>` injection — script and
   * meta tags are the entire point (GA4, Search Console verification,
   * Facebook Pixel), so those stay. Event-handler attributes are still
   * stripped even from allowed tags: a legitimate analytics snippet never
   * needs `onload="…"` on its own `<script>` to work.
   */
  sanitizeHeadHtml(html: string): string {
    const dangerousMinusHeadAllowed = HtmlSanitizerService.DANGEROUS_TAGS.filter(
      (tag) => !HtmlSanitizerService.HEAD_ALLOWED_TAGS.includes(tag),
    );
    return this.stripDangerousUris(
      this.stripEventHandlerAttributes(this.stripComments(this.stripTags(html, dangerousMinusHeadAllowed))),
    );
  }

  /**
   * A tenant theme's custom CSS: strips `expression()` (legacy IE script
   * execution), `javascript:` URIs inside `url(...)`, `@import` (arbitrary
   * remote stylesheet loading), `behavior:`/`-moz-binding:` (script-binding
   * properties), and any `</style>` sequence that would let the value break
   * out of its own `<style>` tag once rendered.
   */
  sanitizeCss(css: string): string {
    return css
      .replace(/expression\s*\(/gi, '')
      .replace(/@import[^;]*;?/gi, '')
      .replace(/url\s*\(\s*['"]?\s*(?:javascript|vbscript|data:text\/html):[^)]*\)/gi, 'url()')
      .replace(/(-moz-binding|behavior)\s*:[^;]*;?/gi, '')
      .replace(/<\/?style/gi, '');
  }

  // -------------------------------------------------------------------------
  // Building blocks
  // -------------------------------------------------------------------------

  private stripComments(html: string): string {
    return html.replace(/<!--[\s\S]*?-->/g, '');
  }

  /** Removes a tag and everything between its open and close (script/style bodies must not survive as text either). */
  private stripTags(html: string, tags: string[]): string {
    let result = html;
    for (const tag of tags) {
      // Paired tag with content, e.g. <script>...</script> — content removed too, not just the tags.
      result = result.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
      // Self-closing or unpaired occurrences, e.g. a stray <base href="..."> or <meta ...>.
      result = result.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '');
    }
    return result;
  }

  /** Strips `on*="..."` / `on*='...'` / `on*=...` (unquoted) from every remaining tag. */
  private stripEventHandlerAttributes(html: string): string {
    return html.replace(/\s+on[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');
  }

  /**
   * Neutralizes `javascript:`/`vbscript:`/`data:text/html` in
   * `href`/`src`/`action`/`formaction`.
   *
   * Each scheme keeps its own natural terminator in the alternation —
   * `javascript:`/`vbscript:` end in a colon, but a `data:` URI's mime type
   * ends in a comma (or `;base64,`), never a second colon. Requiring one
   * uniform trailing `:` after the whole group would never match a real
   * `data:text/html,...` payload at all.
   */
  private stripDangerousUris(html: string): string {
    return html.replace(
      /(href|src|action|formaction)\s*=\s*(["'])\s*(?:javascript:|vbscript:|data:text\/html[,;])[^"']*\2/gi,
      '$1=$2#$2',
    );
  }
}
