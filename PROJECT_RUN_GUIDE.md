# EMS (E-Commerce Management SaaS) — URLs, Credentials & Run Guide

Iss document me EMS platform ke **sare URLs, login IDs & Passwords, aur project ko run karne ke step-by-step instructions** diye gaye hain.

---

## 1. 🌐 All Application & Service URLs

### A. Admin & Merchant Console (Frontend)
> **Port:** `3000` | **Base URL:** `http://localhost:3000`

| Page / Module | URL | Description |
|---|---|---|
| **Login Page** | [http://localhost:3000/login](http://localhost:3000/login) | Super Admin & Tenant / Store Admin Login |
| **Dashboard** | [http://localhost:3000/dashboard](http://localhost:3000/dashboard) | Main Analytics & Operations Dashboard |
| **Tenants / Companies** | [http://localhost:3000/tenants](http://localhost:3000/tenants) | Super Admin: Company Creation & Management |
| **Domains Management** | [http://localhost:3000/domains](http://localhost:3000/domains) | Subdomains & Custom SSL Domains |
| **Users & Permissions** | [http://localhost:3000/users](http://localhost:3000/users) | Staff Users, RBAC & Role Assignments |
| **Roles & Privileges** | [http://localhost:3000/roles](http://localhost:3000/roles) | Role Definitions & Permission Matrix |
| **Products Catalog** | [http://localhost:3000/products](http://localhost:3000/products) | Product Management, Variants & Matrix Generator |
| **Categories** | [http://localhost:3000/categories](http://localhost:3000/categories) | Multi-level Category Tree Management |
| **Inventory & Stock** | [http://localhost:3000/inventory](http://localhost:3000/inventory) | Stock Tracking & Warehouse Inventory |
| **Orders** | [http://localhost:3000/orders](http://localhost:3000/orders) | Order Processing, Status Updates & Invoices |
| **Returns / RMA** | [http://localhost:3000/returns](http://localhost:3000/returns) | Return Requests, Approvals & Refunds |
| **Customers** | [http://localhost:3000/customers](http://localhost:3000/customers) | Customer CRM & Address History |
| **Settings** | [http://localhost:3000/settings](http://localhost:3000/settings) | Store Branding, Themes & Configuration |

---

### B. Customer Storefront & Customer Portal
> **Port:** `3001` | **Base URL:** `http://localhost:3001`

| Page / Module | URL | Description |
|---|---|---|
| **Storefront Homepage** | [http://localhost:3001](http://localhost:3001) | Main Customer Shopping Storefront |
| **Customer Login** | [http://localhost:3001/account/login](http://localhost:3001/account/login) | Customer Sign-In (Store Isolated) |
| **Customer Registration** | [http://localhost:3001/account/register](http://localhost:3001/account/register) | New Customer Account Creation |
| **Forgot Password** | [http://localhost:3001/account/forgot-password](http://localhost:3001/account/forgot-password) | Password Reset Request |
| **Customer Profile / Account** | [http://localhost:3001/account](http://localhost:3001/account) | Profile, Name, Email, Mobile, Change Password |
| **Saved Addresses** | [http://localhost:3001/account?tab=addresses](http://localhost:3001/account?tab=addresses) | Delivery Address Book (Add/Edit/Delete/Set Default) |
| **Order History & Returns** | [http://localhost:3001/account?tab=orders](http://localhost:3001/account?tab=orders) | My Orders, Tracking & RMA Return Requests |
| **Customer Wishlist** | [http://localhost:3001/account?tab=wishlist](http://localhost:3001/account?tab=wishlist) | Saved Items & One-Click Add-to-Cart |
| **Products Catalog** | [http://localhost:3001/products](http://localhost:3001/products) | Browse Products, Faceted Filters & Price Range |
| **Shopping Cart** | [http://localhost:3001/cart](http://localhost:3001/cart) | Cart Management & Quantity Updates |
| **Checkout** | [http://localhost:3001/checkout](http://localhost:3001/checkout) | Checkout with Coupon Code & Order Placement |

---

### C. Backend API & Developer Tools
> **Port:** `4000` | **Base URL:** `http://localhost:4000`

| Service | URL | Description |
|---|---|---|
| **API Base URL** | [http://localhost:4000/api/v1](http://localhost:4000/api/v1) | Core REST API Endpoints |
| **Swagger Documentation** | [http://localhost:4000/api/docs](http://localhost:4000/api/docs) | Interactive OpenAPI / Swagger Documentation |
| **Health Check (Readiness)** | [http://localhost:4000/health/ready](http://localhost:4000/health/ready) | Checks MySQL, Redis & Mongo connection status |
| **Startup Check** | [http://localhost:4000/health/startup](http://localhost:4000/health/startup) | Checks database migration status |
| **Prometheus Metrics** | [http://localhost:4000/metrics](http://localhost:4000/metrics) | Real-time performance & queue metrics |
| **MailHog (Dev Email UI)** | [http://localhost:8025](http://localhost:8025) | View test emails sent by the system (if running) |

---

## 2. 🔑 All IDs & Passwords (Credentials)

### A. Platform Super Admin (Full Control)
Use this account to create companies/tenants, configure platform domains, manage subscriptions, and view all system logs.

* **Login URL:** `http://localhost:3000/login`
* **Email / Username:** `admin@ems.test`
* **Password:** `DemoPassword123!`
* **Role:** `PLATFORM_SUPER_ADMIN`
* **Access Scope:** Global Platform (Cross-Tenant Admin)

---

### B. Seeded Company / Tenant Accounts

#### 1. Tenant: Northwind Traders (`northwind`)
* **Store Owner:**
  * **Email:** `owner@northwind.test`
  * **Password:** `DemoPassword123!`
  * **Role:** `STORE_OWNER`
* **Order & Operations Manager:**
  * **Email:** `ops@northwind.test`
  * **Password:** `DemoPassword123!`
  * **Role:** `ORDER_MANAGER`

#### 2. Tenant: Lakeside Supply Co (`lakeside`)
* **Store Owner:**
  * **Email:** `owner@lakeside.test`
  * **Password:** `DemoPassword123!`
  * **Role:** `STORE_OWNER`
* **Product Manager:**
  * **Email:** `ops@lakeside.test`
  * **Password:** `DemoPassword123!`
  * **Role:** `PRODUCT_MANAGER`

---

### C. Customer Portal Accounts (Storefront)
Use these credentials or self-register on `http://localhost:3001/account/register`.

* **Customer 1:**
  * **Email:** `customer@example.com` (or `customer1@example.com`)
  * **Password:** `Password123!`
* **New Customer Self-Registration:**
  * Open `http://localhost:3001/account/register`
  * Fill Name, Email, Mobile and any Password
  * Login immediately at `http://localhost:3001/account/login`

---

### D. Databases & System Infrastructure Credentials

| Service | Host | Port | Database / Schema | Username | Password |
|---|---|---|---|---|---|
| **MySQL 8.4** | `127.0.0.1` | `3307` | `ems` | `ems` | `emspassword` |
| **MySQL Root** | `127.0.0.1` | `3307` | `ems` | `root` | `rootpassword` |
| **MongoDB** | `127.0.0.1` | `27017` | `ems_logs` | *(No Auth locally)* | *(No Auth locally)* |
| **Redis (BullMQ)** | `127.0.0.1` | `6380` | DB `0` | *(default)* | *(None)* |
| **Redis (Cache)** | Remote Cloud | `19455` | DB `0` | `default` | Configured in `.env` |
| **MinIO (S3)** | `127.0.0.1` | `9000` | Bucket: `ems-media` | `minioadmin` | `minioadmin` |
| **MailHog (SMTP)** | `127.0.0.1` | `1025` | *(Email capture)* | *(None)* | *(None)* |

---

## 3. 🚀 How to Run the Project (Step-by-Step)

### Pre-requisites
- **Node.js:** `v20.9.0+` or `v22.x`
- **pnpm:** `v9.15.9` (`npm install -g pnpm`)
- **Windows PowerShell**

---

### Step 1: Start Background Databases
Before starting the API and Web apps, start the three required database services:

Open a PowerShell terminal and run:

#### 1. Start MySQL 8.4 (Port 3307)
```powershell
& 'C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe' --datadir='C:\mysql-data-ems' --port=3307 --console
```

#### 2. Start Redis Queue (Port 6380)
```powershell
& 'C:\Users\DELL 10THGEN\AppData\Local\Microsoft\WinGet\Packages\taizod1024.redis-windows-fork_Microsoft.Winget.Source_8wekyb3d8bbwe\Redis-8.10.1-Windows-x64-msys2\redis-server.exe' --port 6380
```

#### 3. Start MongoDB (Port 27017)
```powershell
net start MongoDB
# (Ya manual command agar service stopped ho):
# & 'C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe' --dbpath 'C:\mongo-data' --port 27017 --bind_ip 127.0.0.1
```

---

### Step 2: Database Setup & Seed (One-time or when resetting)
Agar database pehle se setup nahi hai to run karein:

```powershell
# 1. Run migrations
pnpm run db:migrate

# 2. Seed default Super Admin & Demo Tenants
pnpm run db:seed
```

---

### Step 3: Run All Applications Together
Root folder (`d:\office-data\Project\Romanchal\VGY\ems`) me run karein:

```powershell
pnpm dev
```

Yeh command Turborepo ke through teeno applications ko simultaneously start karegi:
1. `@ems/api` on `http://localhost:4000`
2. `@ems/console` on `http://localhost:3000`
3. `@ems/storefront` on `http://localhost:3001`

---

### Step 4: Run Applications Individually (Optional)
Agar aap alag-alag terminals me run karna chahte hain:

* **Terminal 1 — Backend API:**
  ```powershell
  pnpm dev:api
  ```
* **Terminal 2 — Admin Console:**
  ```powershell
  pnpm dev:console
  ```
* **Terminal 3 — Customer Storefront:**
  ```powershell
  pnpm dev:storefront
  ```

---

## 4. 🛠️ Useful Commands Quick Reference

| Action | Command |
|---|---|
| **Start All Dev Servers** | `pnpm dev` |
| **Check Code Quality & Types** | `pnpm typecheck` |
| **Run Unit Tests** | `pnpm test` |
| **Run Integration Tests** | `pnpm test:integration` |
| **Run Tenant Isolation Suite** | `pnpm test:isolation` |
| **Re-generate Crypto/JWT Keys**| `pnpm keys:generate` |
| **Build for Production** | `pnpm build` |

---

## 5. ⚠️ Common Issues & Troubleshooting

1. **`Port 3000 already in use`:**
   Agar port 3000 pe koi aur app chal rahi hai, to us process ko band karein ya console ko dusre port par run karein:
   ```powershell
   # Port 3000 check:
   Get-NetTCPConnection -LocalPort 3000 -State Listen
   ```
2. **`ECONNREFUSED 127.0.0.1:3307`:**
   MySQL server port 3307 par start nahi hai. Step 1 me di gayi MySQL command run karein.
3. **`ECONNREFUSED 127.0.0.1:27017`:**
   MongoDB service start nahi hai. `net start MongoDB` run karein.
4. **`ECONNREFUSED 127.0.0.1:6380`:**
   Redis BullMQ instance start nahi hai. Step 1 me di gayi Redis command run karein.
