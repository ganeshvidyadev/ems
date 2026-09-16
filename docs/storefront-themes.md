# Company storefront themes

The platform super admin manages designs at **Console → Company themes** (`/themes`).

- **Northwind Traders:** Organic, using the supplied Organic images and layout.
- **Lakeside Supply Co:** Famms, using the supplied Famms images and layout.
- **Default:** the general-purpose EMS storefront. Always allowed, and used for new companies or when an assignment cannot be resolved.

For each company, tick the permitted designs, select **Live theme**, and save. Removing the current design from the allowed list selects Default in the form. Saving applies both settings together. Changes are read on the next storefront request; already-open pages should be refreshed.

Only `PLATFORM_SUPER_ADMIN` can list or change these settings. The API also checks platform identity and permissions; hiding the console link is not the authorization boundary. A selected theme must be one of the allowed designs. The public read resolves the company from the tenant context, not a supplied company ID.

The shared catalogue, search, product detail, cart and checkout remain connected to the company's real data. Template sample prices, discount promises, customer counts and inert signup forms are not used as live commerce data. Template imagery lives under `apps/storefront/public/themes`; original design credits are retained in the footer. Headers, footers, homepage sections and catalogue styling vary by design.

## Database and deployment

Migration `1789516800000-StorefrontThemeAccess` adds `tenants.storefront_theme` and `tenants.allowed_storefront_themes`. It assigns Organic/Famms to existing Northwind/Lakeside records. New demo records receive the same assignments from the seed; rerunning seeds does not overwrite an admin's later selections. Other new companies receive Default.

Run the standard database migrations before deploying the API. Deploy the API, console and storefront together. The storefront uses the platform assignment independently of the older per-store draft/publish configuration API; that API does not change these company-level designs.

Endpoints:

- `GET /api/v1/platform/themes`: super-admin theme catalogue and company assignments.
- `PUT /api/v1/platform/themes/:companyId`: save `{ "selectedTheme": "organic", "allowedThemes": ["default", "organic"] }` using the company's public ID.
- `GET /api/v1/storefront/theme-assignment`: the current host's permitted assignment.

Local pages:

- `http://northwind.ems.localhost:3001`
- `http://lakeside.ems.localhost:3001`
- `http://localhost:3000/themes` (super-admin sign-in required)
