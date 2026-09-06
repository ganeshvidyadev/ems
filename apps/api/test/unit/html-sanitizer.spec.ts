import { HtmlSanitizerService } from '../../src/common/services/html-sanitizer.service';

/**
 * Phase 7 exit criterion: "Custom CSS/HTML cannot execute injected script."
 * Each case here is a real XSS payload shape — the test fails if any of them
 * would still run in a browser after sanitization.
 */
describe('HtmlSanitizerService.sanitizeContentHtml', () => {
  const sanitizer = new HtmlSanitizerService();

  it('removes a <script> tag and its body entirely', () => {
    const result = sanitizer.sanitizeContentHtml('<p>Hello</p><script>alert(document.cookie)</script>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert(document.cookie)');
    expect(result).toContain('<p>Hello</p>');
  });

  it('strips an inline event-handler attribute', () => {
    const result = sanitizer.sanitizeContentHtml('<img src="x.png" onerror="alert(1)">');
    expect(result).not.toMatch(/onerror/i);
  });

  it('strips onclick from an anchor while keeping the link text', () => {
    const result = sanitizer.sanitizeContentHtml('<a href="/page" onclick="stealCookies()">Click me</a>');
    expect(result).not.toMatch(/onclick/i);
    expect(result).toContain('Click me');
  });

  it('neutralizes a javascript: URI in an href', () => {
    const result = sanitizer.sanitizeContentHtml('<a href="javascript:alert(1)">link</a>');
    expect(result).not.toMatch(/javascript:/i);
  });

  it('neutralizes a data:text/html URI', () => {
    const result = sanitizer.sanitizeContentHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    expect(result).not.toMatch(/data:text\/html/i);
  });

  it('removes an injected <iframe>', () => {
    const result = sanitizer.sanitizeContentHtml('<p>Body</p><iframe src="https://evil.example"></iframe>');
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('evil.example');
  });

  it('removes <object>/<embed> tags', () => {
    const result = sanitizer.sanitizeContentHtml(
      '<object data="evil.swf"></object><embed src="evil.swf">',
    );
    expect(result).not.toContain('<object');
    expect(result).not.toContain('<embed');
  });

  it('removes an injected <svg> that carries a script', () => {
    const result = sanitizer.sanitizeContentHtml('<svg onload="alert(1)"><script>alert(2)</script></svg>');
    expect(result).not.toContain('<svg');
    expect(result).not.toContain('<script');
  });

  it('removes HTML comments (a common conditional-comment injection vector)', () => {
    const result = sanitizer.sanitizeContentHtml('<!--[if IE]><script>alert(1)</script><![endif]-->text');
    expect(result).not.toContain('<script');
    expect(result).toContain('text');
  });

  it('strips a <form>/<base> pair that could hijack relative links or submissions', () => {
    const result = sanitizer.sanitizeContentHtml(
      '<base href="https://evil.example/"><form action="https://evil.example/steal"><input></form>',
    );
    expect(result).not.toContain('<base');
    expect(result).not.toContain('<form');
  });

  it('preserves ordinary safe markup unchanged', () => {
    const safe = '<p>Hello <strong>world</strong></p><a href="https://example.com">link</a>';
    expect(sanitizer.sanitizeContentHtml(safe)).toBe(safe);
  });
});

describe('HtmlSanitizerService.sanitizeHeadHtml', () => {
  const sanitizer = new HtmlSanitizerService();

  it('keeps a legitimate analytics <script> tag (the whole point of head injection)', () => {
    const snippet = "<script>gtag('config', 'G-XXXX')</script>";
    expect(sanitizer.sanitizeHeadHtml(snippet)).toContain('gtag');
  });

  it('still strips an event-handler attribute even on an allowed tag', () => {
    const result = sanitizer.sanitizeHeadHtml('<script onload="alert(1)">gtag()</script>');
    expect(result).not.toMatch(/onload/i);
  });

  it('still removes a disallowed dangerous tag like <iframe>', () => {
    const result = sanitizer.sanitizeHeadHtml('<script>ok()</script><iframe src="https://evil.example"></iframe>');
    expect(result).not.toContain('<iframe');
    expect(result).toContain('ok()');
  });
});

describe('HtmlSanitizerService.sanitizeCss', () => {
  const sanitizer = new HtmlSanitizerService();

  it('removes a legacy expression() script-execution payload', () => {
    const result = sanitizer.sanitizeCss('body { width: expression(alert(1)); }');
    expect(result).not.toMatch(/expression\s*\(/i);
  });

  it('removes an @import that could load an arbitrary remote stylesheet', () => {
    const result = sanitizer.sanitizeCss("@import url('https://evil.example/steal.css'); body { color: red; }");
    expect(result).not.toMatch(/@import/i);
    expect(result).toContain('color: red');
  });

  it('neutralizes a javascript: URI inside url()', () => {
    const result = sanitizer.sanitizeCss("body { background: url('javascript:alert(1)'); }");
    expect(result).not.toMatch(/javascript:/i);
  });

  it('removes a behavior: script-binding property', () => {
    const result = sanitizer.sanitizeCss('body { behavior: url(evil.htc); }');
    expect(result).not.toMatch(/behavior\s*:/i);
  });

  it('strips a </style> breakout attempt', () => {
    const result = sanitizer.sanitizeCss('body{}</style><script>alert(1)</script><style>');
    expect(result).not.toMatch(/<\/?style/i);
  });

  it('preserves ordinary safe CSS unchanged', () => {
    const safe = 'body { color: #333; font-family: sans-serif; }';
    expect(sanitizer.sanitizeCss(safe)).toBe(safe);
  });
});
