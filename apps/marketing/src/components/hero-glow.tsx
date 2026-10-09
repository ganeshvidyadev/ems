/**
 * The decorative radial-blur + three-streak backdrop Automark repeats behind every
 * page's hero/header (home banner, `PageHeader.astro`, `about.astro`, `careers/index.astro`)
 * — factored into one component instead of duplicating the ~60-line inline SVG per page.
 */
export function HeroGlow() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-20 size-160 -translate-x-1/2 -translate-y-1/2 blur-2xl xl:size-300"
        style={{
          background:
            'radial-gradient(circle, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 78%, transparent) 20%, transparent 70%)',
        }}
      />
      <svg
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 -z-10 opacity-50"
        width="567"
        height="558"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g style={{ mixBlendMode: 'plus-lighter' }}>
          <path
            fill="var(--color-primary)"
            opacity="0.5"
            d="M-20.527-7.51 10.182-43l259.774 233.148-13.283 15.352-277.2-213.01Z"
          />
          <path
            fill="var(--color-primary)"
            opacity="0.4"
            d="M-52 13.659-20.788-25l267.328 224.459-13.502 16.722-285.04-202.522Z"
          />
          <path
            fill="var(--color-primary)"
            opacity="0.3"
            d="M-108.079-4.9-66.125-46l290.011 307.352-18.147 17.779-313.818-284.03Z"
          />
        </g>
      </svg>
    </>
  );
}
