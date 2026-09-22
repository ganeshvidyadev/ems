export function SiteFooter() {
  return (
    <footer className="bg-surface-alt">
      <div className="h-1 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500" />
      <div className="mx-auto max-w-content px-6 py-8 text-sm text-ink-muted">
        <p>&copy; {new Date().getFullYear()} EMS. All rights reserved.</p>
      </div>
    </footer>
  );
}
