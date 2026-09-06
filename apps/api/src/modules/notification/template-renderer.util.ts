/**
 * Hand-rolled `{{variable}}` interpolation — no Handlebars dependency is
 * installable in this environment, and the actual need (substitute a handful
 * of known scalars into merchant-authored copy) doesn't warrant one.
 *
 * Unresolved placeholders render as an empty string rather than throwing: a
 * merchant's custom template referencing a variable this event doesn't carry
 * should degrade to missing text, not fail the whole notification.
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => variables[key] ?? '');
}
