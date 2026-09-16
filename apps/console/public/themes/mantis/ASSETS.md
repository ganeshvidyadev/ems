# Mantis assets used by EMS Console

Source: the user-provided Mantis-Bootstrap-1.0.0 folder.

Copied file: `dist/assets/fonts/inter/Inter-roman.var.woff2` (227,688 bytes).
The source `inter.css` identifies version 3.18. It is registered as
`EMS Mantis Inter`, rather than `Inter var`, to avoid affecting tenant/auth screens.
Inter is by Rasmus Andersson and distributed under the SIL Open Font License 1.1.

Mantis is by CodedThemes; the provided package declares MIT licensing.
The adaptation in `src/app/mantis-admin.css` references its SCSS variables,
sidebar/header, card, table, form, and modal design. No demo branding, imagery,
Bootstrap scripts, third-party widgets, or remotely hosted fonts are included.
The existing Lucide SVG icon library provides the outline icons.
