export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface-alt">
      <div className="mx-auto max-w-content px-6 py-8 text-sm text-ink-muted">
        <p>&copy; {new Date().getFullYear()} EMS. All rights reserved.</p>
      </div>
    </footer>
  );
}
