// Central QA configuration. Override with env vars; nothing secret is hard-coded
// beyond the documented local-only demo password.
export const API = process.env.QA_API ?? 'http://localhost:4000/api/v1';
export const API_ROOT = API.replace(/\/api\/v1$/, '');
export const CONSOLE = process.env.QA_CONSOLE ?? 'http://localhost:3000';
export const STOREFRONT_PORT = process.env.QA_STOREFRONT_PORT ?? '3001';
export const MARKETING = process.env.QA_MARKETING ?? 'http://localhost:3003';
export const DEMO_PASSWORD = process.env.QA_DEMO_PASSWORD ?? 'DemoPassword123!';
export const CHROME = process.env.QA_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export const USERS = {
  superAdmin: 'admin@ems.test',
  nwOwner: 'owner@northwind.test',
  nwOps: 'ops@northwind.test',
  lsOwner: 'owner@lakeside.test',
  lsOps: 'ops@lakeside.test',
};

export const HOSTS = {
  northwind: 'northwind.ems.localhost',
  lakeside: 'lakeside.ems.localhost',
};
