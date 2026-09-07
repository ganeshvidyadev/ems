# EMS Project — Kya Hai, Kyun Bana Rahe Hain, Aur Ab Tak Kya Bana

Ye file simple bhasha mein bata rahi hai ki ye project (**EMS**) hai kya, kis maqsad se
bana rahe hain, aur abhi tak kaun-kaun se features ready hain. Technical/detailed
documentation `docs/` folder mein hai (`01-architecture.md` se `05-roadmap.md` tak) —
ye file uska ek aasan, up-to-date summary hai.

---

## 1. Project kya hai

**EMS = Multi-Tenant E-Commerce Management SaaS.**

Simple shabdon mein — ye **Shopify jaisa ek platform** hai. Iska matlab:

- Isme **ek nahi, bahut saare merchants (dukaandaar)** apna-apna online store bana
  sakte hain — jaise ek hi building mein alag-alag dukanein, lekin har dukaan ka
  data poori tarah alag aur private rehta hai (isko **multi-tenancy** kehte hain).
- Har merchant (tenant) apna **plan** leta hai, apna **store** provision hota hai, aur
  usse products daalna, orders manage karna, payments lena, shipping karna, apni
  website ka look customize karna — sab kuch mil jaata hai.
- Do tarah ke log is system ko use karte hain:
  1. **Merchant (dukaandaar)** — apna business chalane ke liye "**Console**" (admin
     dashboard) use karta hai.
  2. **Shopper (customer)** — merchant ki dukaan se cheez khareedne ke liye
     "**Storefront**" (asli website jahan se log shopping karte hain) use karta hai.

Poora system teen hisson mein bata hai:

| Hissa | Kaam |
|---|---|
| **API (Backend)** — NestJS | Saara business logic, database, payments, orders, sab kuch yahin hota hai |
| **Console (Frontend)** — Next.js | Merchant ka admin dashboard — products/orders/customers manage karne ke liye |
| **Storefront (Frontend)** — Next.js | Customer-facing shop — jahan se shopper kharidta hai |

Data teen jagah rehta hai: **MySQL** (asli data — orders, products, paise ka hisaab),
**MongoDB** (logs/analytics), **Redis** (cache, cart, background job queues).

---

## 2. Kyun bana rahe hain

- Maqsad hai ek **real, production-grade SaaS** banana — waise hi jaise asli
  companies (Shopify, WooCommerce) apna platform banati hain. Sirf ek demo/toy app
  nahi, balki **real-world engineering practices** follow karte hue:
  - Har tenant ka data 100% isolated rahe (koi bhi galti se doosre tenant ka data na
    dikhe) — isko **3 alag layers** se enforce kiya gaya hai.
  - Paisa/money kabhi bhi galat round-off na ho (float kabhi use nahi hota, hamesha
    paise ko chhote-se-chhote unit — paisa/cents — mein bigint se store karte hain).
  - Har payment/order action **idempotent** ho (ek hi request do baar chal jaye to
    bhi customer se double paisa na kate).
  - System bade scale par bhi chal sake (queues, caching, background workers).
- Ye ek **12-phase roadmap** follow karke banaya ja raha hai — pehle foundation
  (tenancy, auth), fir catalog/orders, fir payments/shipping, fir website-builder,
  fir marketplace, fir reports/analytics, aur end mein production-hardening
  (Docker, Kubernetes, monitoring, backups) — taaki system sirf "kaam kare" nahi,
  balki **launch karne layak** ho.

---

## 3. Abhi tak kya-kya bana hai

### 3.1 Backend (API) — poori tarah ban chuka hai in sab modules ke liye

**Foundation & Security**
- Multi-tenancy (ek hi database mein sab tenants ka data, lekin 100% isolated)
- Login/Signup, Email verification, OTP, MFA (TOTP), password reset
- Roles & Permissions (staff ko alag-alag access dena — 197 permissions, 12 roles)
- Staff invites, session management, JWT tokens (auto-refresh)

**Billing & Store Setup**
- Subscription plans, tenant provisioning (naya merchant sign-up hote hi uska store
  apne aap ban jaata hai)

**Catalog (Products)**
- Products (simple + variants wale), Brands, Categories, Tax classes, Media/images

**Commerce (Orders/Shopping)**
- Cart, Checkout, Orders (place/fulfil/cancel/hold/resume/close/return)
- Inventory (multi-warehouse stock, low-stock alerts, stock adjust/transfer)
- Customers (profile, addresses, wishlist)
- Coupons (percentage/fixed/free-shipping discount codes)
- Gift cards, Loyalty points
- **Reviews** (customers product review de sakte hain, merchant approve/reject/reply
  kar sakta hai) — *abhi-abhi is session mein banaya gaya*

**Payments & Shipping**
- Payment gateways: Razorpay, Stripe, Cashfree, PhonePe + Cash-on-Delivery
- Shipping providers, rate calculation, shipment tracking

**Website Builder / Marketing**
- Themes, CMS pages, Blog, Banners, Menus, SEO settings, Custom domains

**Multi-channel & Marketplace**
- Doosre marketplaces (jaise Amazon/eBay-type) se connect karke bechna
- Supplier-Reseller internal marketplace

**Reports & Support**
- Sales reports, Analytics/funnel tracking, Notifications (email), Support tickets

**Production/DevOps (Hardening)**
- Docker, Kubernetes configs, Terraform, CI/CD pipeline, Monitoring
  (Prometheus/Grafana), Error tracking (Sentry), Distributed tracing (OpenTelemetry)
- Backup/restore scripts, Load testing setup

### 3.2 Frontend — Console (Merchant Dashboard)

Ye wo dashboard hai jahan se dukaandaar apna business chalata hai. Abhi tak **poori
tarah bana aur test kiya hua** hai:

- **Login/Auth** (pehle se tha)
- **Products** — list, naya banao, edit karo, publish karo, delete karo
- **Orders** — list, detail dekho, fulfil/cancel/hold/resume/close karo
- **Inventory** — kam stock wale items dekho, stock adjust/transfer karo, reorder
  settings set karo
- **Coupons** — discount codes banao/edit/delete karo
- **Customers** — customer list, naya customer banao, profile edit, address
  add/edit/delete, wishlist dekho

**Baaki hai:** Reviews ka frontend page (backend ban chuka hai, UI abhi banana hai).

### 3.3 Frontend — Storefront (Customer-facing Shop)

Abhi sirf **backend APIs** ready hain (products dikhana, cart, checkout, reviews,
sab kuch). Asli shopping-website ka **UI abhi nahi bana** — sirf ek baar real order
place karke API test kiya gaya tha.

---

## 4. Quality ka dhyaan kaise rakha ja raha hai

Har feature banane ke baad, sirf code likh ke chhoda nahi jaata — **real browser mein
chala ke test kiya jaata hai** (asli login, asli data ke saath). Isi tareeke se is
session mein kai **real bugs** milein aur turant fix kiye gaye, jaise:

- Product/Coupon/Customer delete karne par server crash ho jaata tha (database
  column ki galat setting — fix ho gaya)
- Ek internal ID cheez galti se customer/frontend ko dikh jaata tha jahan usko
  chhupa hona chahiye tha (security/design issue — fix ho gaya)
- Form submit karne par kabhi-kabhi button kuch nahi karta tha, bina koi error
  dikhaye (validation ka gap — fix ho gaya)

Kuch chhote bugs abhi milke background mein fix hone ke liye note kiye gaye hain
(jaise product ka store-ID sahi se na dikhna) — ye active kaam mein nahi hain, alag
se pending list mein hain.

---

## 5. Abhi kya baaki hai (aage ka kaam)

- Reviews ka Console frontend page
- Storefront ki asli website (UI)
- Tenant management (naye tenant banane/delete karne ka admin panel)
- Kuch aur entities mein wahi "delete crash" bug fix karna (list bani hui hai)
- Docker/Kubernetes/Terraform ko is dev machine par kabhi live test nahi kiya gaya
- Email (SMTP) aur file-storage (MinIO) local mein kabhi chalu nahi kiye gaye

---

*Ye file hamesha up-to-date nahi rahegi — jaise-jaise naye features banenge, isko
dobara update karna padega. Poora technical detail `docs/` folder mein hai.*
