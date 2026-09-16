// Isolated browser fixture verification. No real API requests or database writes.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const output = __dirname;
const delay = ms => new Promise(r => setTimeout(r, ms));
const stamp = '2026-09-15T10:00:00.000Z';
const id = '01JTEST00000000000000000001';
const money = amountMinor => ({ amountMinor: String(amountMinor), currency: 'INR' });
const product = { id, name: 'Everyday cotton tote', sku: 'TOTE-001', priceMinor: '129900', currency: 'INR', status: 'DRAFT', visibility: 'VISIBLE', type: 'SIMPLE', createdAt: stamp, updatedAt: stamp, trackInventory: true, categoryIds: [], description: 'Durable everyday carry with reinforced handles.', tags: [] };
const order = { id, orderNumber: 'EMS-2026-1042', email: 'buyer@example.test', status: 'CONFIRMED', paymentStatus: 'PAID', fulfilmentStatus: 'UNFULFILLED', total: money(259800), subtotal: money(259800), discount: money(0), shipping: money(0), tax: money(0), codFee: money(0), amountPaid: money(259800), amountRefunded: money(0), placedAt: stamp, createdAt: stamp, items: [{ id, name: product.name, sku: product.sku, quantity: 2, quantityFulfilled: 0, quantityCancelled: 0, lineTotal: money(259800) }], timeline: [] };
const customer = { id, displayName: 'Aditi Sharma', firstName: 'Aditi', lastName: 'Sharma', email: 'aditi@example.test', status: 'ACTIVE', totalOrders: 12, totalSpentMinor: '2845000', averageOrderMinor: '237083', loyaltyPoints: 120, currency: 'INR', createdAt: stamp, tags: [], acceptsMarketing: false, taxExempt: false };
const coupon = { id, code: 'WELCOME10', name: 'Welcome discount', discountType: 'PERCENTAGE', discountValue: '10.0000', status: 'ACTIVE', usageCount: 18, usedCount: 18, usageLimitTotal: 100, startsAt: null, endsAt: null, combinable: false, autoApply: false };
const stock = { productId: id, productName: product.name, sku: product.sku, warehouseId: id, warehouseName: 'Main warehouse', quantityOnHand: 4, quantityReserved: 1, quantityAvailable: 3, quantityIncoming: 0, reorderPoint: 5, reorderQuantity: 20, binLocation: 'A-12' };
let role = 'super', signedIn = true, empty = false;
const requests = [], errors = [], results = [];
function response(url, method) {
  const p = new URL(url).pathname.replace('/api/v1', '');
  let data = [];
  if (p === '/auth/logout') signedIn = false;
  if (p === '/auth/login') signedIn = true;
  if (p === '/auth/refresh' || p === '/auth/login') {
    if (!signedIn) return { code: 401, body: { success: false, error: { code: 'AUTH_UNAUTHORIZED', message: 'Signed out' } } };
    data = { outcome: 'AUTHENTICATED', accessToken: 'fixture-only-token', expiresIn: 3600, user: { id, firstName: 'Alex', lastName: 'Admin', email: 'admin@example.test', userType: role === 'tenant' ? 'TENANT' : 'PLATFORM', roles: role === 'tenant' ? ['TENANT_ADMIN'] : ['PLATFORM_SUPER_ADMIN'], permissions: role === 'restricted' ? [] : ['*'], tenant: null } };
  } else if (p === '/console/stores') data = [{ id, name: 'EMS Demo Store', currency: 'INR' }];
  else if (p === '/console/reports/sales-summary') data = { netMinor: '2845000', currency: 'INR', ordersCount: 42, itemsCount: 68, newCustomers: 8, returningCustomers: 16, byDay: [12, 18, 14, 25, 19, 32, 36].map((n, i) => ({ date: `2026-09-${10+i}`, netMinor: String(n * 10000), ordersCount: n })) };
  else if (p === '/console/products') data = method === 'POST' ? product : empty ? [] : [product, { ...product, id: id.slice(0,-1)+'2', name: 'Ceramic coffee mug', sku: 'MUG-002', status: 'ACTIVE' }];
  else if (p.startsWith('/console/products/')) data = product;
  else if (p === '/console/orders') data = empty ? [] : [order];
  else if (p.startsWith('/console/orders/')) data = order;
  else if (p === '/console/customers') data = method === 'POST' ? customer : [customer];
  else if (p.endsWith('/addresses') || p.endsWith('/wishlist')) data = [];
  else if (p.startsWith('/console/customers/')) data = customer;
  else if (p === '/console/coupons') data = method === 'POST' ? coupon : [coupon];
  else if (p.startsWith('/console/coupons/')) data = coupon;
  else if (p === '/console/inventory/low-stock' || p === '/console/inventory/levels') data = [stock];
  else if (p === '/console/warehouses') data = [{ id, name: 'Main warehouse' }, { id: id.slice(0,-1)+'2', name: 'East warehouse' }];
  else if (p === '/auth/sessions') data = [{ id, deviceLabel: 'Chrome on Windows', isCurrent: true, ipAddress: '127.0.0.1', createdAt: stamp, lastUsedAt: stamp }, { id: id.slice(0,-1)+'2', deviceLabel: 'Safari on iPhone', isCurrent: false, ipAddress: '127.0.0.2', createdAt: stamp, lastUsedAt: stamp }];
  else if (p === '/platform/themes') data = { themes: [{ code: 'default', name: 'Default', description: 'A clean and flexible storefront.' }, { code: 'organic', name: 'Organic', description: 'Fresh color and a natural shopping experience.' }, { code: 'famms', name: 'Famms', description: 'Bold merchandising for fashion collections.' }], companies: [{ id, name: 'Northwind Commerce', slug: 'northwind', allowedThemes: ['default', 'organic'], selectedTheme: 'organic' }] };
  else if (p.startsWith('/health/')) return { code: 200, body: { status: 'ok', migrations: 'up-to-date', dependencies: { mysql: { status: 'up', latencyMs: 2 }, redis: { status: 'up', latencyMs: 1 }, mongodb: { status: 'up', latencyMs: 3 } } } };
  const page = Number(new URL(url).searchParams.get('page') || 1);
  return { code: 200, body: { success: true, data, meta: { pagination: { page, limit: 20, total: empty ? 0 : 42, totalPages: empty ? 0 : 3, hasNext: page < 3, hasPrev: page > 1 } } } };
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${path.join(output, 'chrome-profile')}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let log = ''; const timer = setTimeout(() => reject(new Error('Chrome startup timeout')), 15000);
      chrome.stderr.on('data', b => { log += b; const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
      chrome.on('error', reject);
    });
    const port = new URL(endpoint).port;
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => socket.addEventListener('open', r, { once: true }));
    let seq = 0; const pending = new Map();
    const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++seq; const timer = setTimeout(() => { pending.delete(n); reject(new Error(method+' timeout')); }, 15000); pending.set(n, { resolve, reject, timer }); socket.send(JSON.stringify({ id: n, method, params })); });
    socket.addEventListener('message', async event => {
      const m = JSON.parse(event.data);
      if (m.id && pending.has(m.id)) { const q = pending.get(m.id); clearTimeout(q.timer); pending.delete(m.id); m.error ? q.reject(new Error(JSON.stringify(m.error))) : q.resolve(m.result); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Fetch.requestPaused') {
        const { requestId, request } = m.params;
        requests.push({ method: request.method, url: request.url, body: request.postData });
        const r = response(request.url, request.method);
        await send('Fetch.fulfillRequest', { requestId, responseCode: request.method === 'OPTIONS' ? 204 : r.code, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: 'http://localhost:3100' }, { name: 'Access-Control-Allow-Credentials', value: 'true' }, { name: 'Access-Control-Allow-Headers', value: 'content-type,authorization' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,PATCH,DELETE,OPTIONS' }], body: Buffer.from(request.method === 'OPTIONS' ? '' : JSON.stringify(r.body)).toString('base64') });
      }
    });
    const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
    const waitFor = async expression => { for (let i=0; i<60; i++) { if (await evaluate(expression)) return; await delay(100); } fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({expression,results,errors,requests,dom:await evaluate('document.body.innerText')},null,2)); throw new Error('Wait failed: '+expression); };
    const navigate = async route => { await send('Page.navigate', { url: 'http://localhost:3100'+route }); await waitFor("document.readyState === 'complete' && !!document.querySelector('.mantis-page h1, .mantis-page .admin-card, form')"); await delay(450); };
    const click = async expression => { const rect = await evaluate(`(()=>{const e=${expression}; if(!e) throw Error('Missing control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...rect }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...rect }); await delay(150); };
    const button = text => `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
    const screenshot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(output, name+'.png'), Buffer.from(r.data, 'base64')); };
    const fill = async (selector, text) => {
      await click(`document.querySelector(${JSON.stringify(selector)})`);
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});
      await send('Input.insertText',{text});
    };
    console.log('Browser connected');
    await send('Runtime.enable'); console.log('Runtime ready');
    await send('Page.enable');
    await send('Fetch.enable', { patterns: [{ urlPattern: 'http://localhost:4000/*' }] });
    const dashboardOnly=process.argv.includes('--dashboard-only');
    const routes = dashboardOnly ? ['/'] : ['/', '/themes', '/products', '/products/new', '/products/'+id, '/orders', '/orders/'+id, '/inventory', '/inventory/'+id, '/customers', '/customers/new', '/customers/'+id, '/coupons', '/coupons/new', '/coupons/'+id, '/sessions', '/system'];
    for (const width of process.argv.includes('--interactions-only') ? [] : [1440, 1280, 768, 375]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      for (const route of routes) {
        await navigate(route);
        const check = await evaluate(`({route:location.pathname,width:innerWidth,documentWidth:document.documentElement.scrollWidth,heading:document.querySelector('.mantis-page h1')?.textContent,theme:!!document.querySelector('.mantis-shell'),overflow:document.documentElement.scrollWidth>innerWidth,body:document.body.innerText.slice(-100)})`);
        results.push(check);
        if (['/', '/themes', '/products', '/products/new'].includes(route)) await screenshot((route==='/'?'dashboard':route.slice(1).replaceAll('/','-'))+'-'+width);
      }
      if(dashboardOnly) continue;
      await navigate('/inventory/'+id);
      if (width===375) {
        await evaluate("document.querySelector('.admin-table').focus()");
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
        await delay(250);
        results.push({test:'keyboard-table-scroll',passed:await evaluate("document.querySelector('.admin-table').scrollLeft>0")});
      }
      await click(button('Transfer stock'));
      await waitFor("!!document.querySelector('.mantis-dialog')");
      results.push(await evaluate(`(()=>{const e=document.querySelector('.mantis-dialog'),r=e.getBoundingClientRect();return {test:'dialog',width:innerWidth,fits:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,theme:e.classList.contains('mantis-admin'),scrollable:e.scrollHeight>=e.clientHeight}})()`));
      if(width===375) await screenshot('inventory-dialog-375');
      for(let n=0;n<10;n++) await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
      results.push({test:'dialog-focus-trap',width,passed:await evaluate("document.querySelector('.mantis-dialog').contains(document.activeElement)")});
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await delay(150);
      results.push({test:'dialog-escape',width,passed:await evaluate("!document.querySelector('.mantis-dialog')")});
      if (width <= 768) {
        await click("document.querySelector('[aria-label=\"Open navigation\"]')");
        await waitFor("!!document.querySelector('.mantis-drawer')");
        await screenshot('navigation-'+width);
        await click("document.querySelector('.mantis-drawer a[href=\"/products\"]')");
        await waitFor("location.pathname==='/products' && !document.querySelector('.mantis-drawer')");
        results.push({test:'drawer-navigation',width,passed:true});
      }
    }
    if(dashboardOnly){fs.writeFileSync(path.join(output,'dashboard-results.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));await send('Browser.close');return;}
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await navigate('/products');
    await click("document.querySelector('[aria-label=\"Collapse sidebar\"]')");
    results.push({test:'desktop-collapse',passed:await evaluate("document.querySelector('.mantis-shell').dataset.collapsed==='true'")});
    await fill('input[placeholder]', 'cotton');
    await click(button('Search'));
    await click(button('Next'));
    await waitFor("location.search.includes('page=2')");
    results.push({test:'search-pagination',passed:requests.some(r=>r.method==='GET'&&r.url.includes('/console/products?')&&new URL(r.url).searchParams.get('q')==='cotton')});
    await evaluate("(()=>{const e=document.querySelector('.mantis-page select');e.value='DRAFT';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await waitFor("location.search.includes('page=1')");
    await delay(200);
    results.push({test:'status-filter',passed:requests.some(r=>r.method==='GET'&&new URL(r.url).searchParams.get('status')==='DRAFT')});
    await click(button('Publish')); await delay(250);
    results.push({test:'publish',passed:requests.some(r=>r.method==='POST'&&r.url.endsWith('/publish'))});
    await click(button('Delete')); await waitFor("!!document.querySelector('.mantis-dialog')");
    await click("[...document.querySelectorAll('.mantis-dialog button')].find(e=>e.textContent.trim()==='Delete')");
    await waitFor("!document.querySelector('.mantis-dialog')");
    results.push({test:'delete-confirmation',passed:requests.some(r=>r.method==='DELETE'&&r.url.includes('/console/products/'))});
    await navigate('/products/new');
    const beforeValidation=requests.filter(r=>r.method==='POST').length;
    await click("document.querySelector('button[type=submit]')");
    results.push({test:'form-validation',passed:await evaluate("!!document.querySelector('[role=alert]')") && requests.filter(r=>r.method==='POST').length===beforeValidation});
    await fill('#name','Fixture product'); await fill('#sku','FIX-001'); await fill('#price','19.99');
    await click("document.querySelector('button[type=submit]')");
    await waitFor(`location.pathname==='/products/${id}'`);
    results.push({test:'create-product-contract',passed:requests.some(r=>r.method==='POST'&&r.url.endsWith('/console/products')&&JSON.parse(r.body).priceMinor==='1999'&&JSON.parse(r.body).storeId===id)});
    await fill('#name','Updated fixture product');
    await click(button('Save changes')); await delay(250);
    results.push({test:'edit-product',passed:requests.some(r=>r.method==='PUT'&&r.url.endsWith('/console/products/'+id))});
    await navigate('/customers/new'); await fill('#email','fixture@example.test'); await fill('#phone','+919876543210');
    await click(button('Create customer')); await waitFor(`location.pathname==='/customers/${id}'`);
    results.push({test:'create-customer',passed:requests.some(r=>r.method==='POST'&&r.url.endsWith('/console/customers'))});
    await navigate('/coupons/new'); await fill('#code','FIXTURE10'); await fill('#discountValue','10');
    await click(button('Create coupon')); await waitFor(`location.pathname==='/coupons/${id}'`);
    results.push({test:'create-coupon',passed:requests.some(r=>r.method==='POST'&&r.url.endsWith('/console/coupons'))});
    await navigate('/themes');
    await click("[...document.querySelectorAll('label')].find(e=>e.textContent.trim()==='Famms').querySelector('input')");
    await click(button('Save theme settings')); await delay(250);
    results.push({test:'theme-settings-save',passed:requests.some(r=>r.method==='PUT'&&r.url.endsWith('/platform/themes/'+id)&&JSON.parse(r.body).allowedThemes.includes('famms'))});
    await click("document.querySelector('[aria-label=\"Open account menu\"]')");
    await waitFor("!!document.querySelector('[role=menuitem]')");
    await click("document.querySelector('[role=menuitem]')");
    await waitFor("location.pathname==='/login' && !!document.querySelector('form')");
    results.push({test:'logout-callback-and-route',passed:true});
    await fill('#email','admin@example.test'); await fill('#password','FixturePass123!');
    await click(button('Sign in')); await waitFor("!!document.querySelector('.mantis-shell')");
    results.push({test:'login-form-callback',passed:requests.some(r=>r.method==='POST'&&r.url.endsWith('/auth/login'))});
    signedIn=true; role='restricted'; await navigate('/products');
    results.push({test:'permission-controlled-actions',passed:await evaluate("![...document.querySelectorAll('.mantis-page button')].some(e=>['Edit','Delete','Publish'].includes(e.textContent.trim()))")});
    role='tenant'; await send('Page.navigate',{url:'http://localhost:3100/themes'}); await delay(800);
    results.push({test:'tenant-theme-isolation',passed:await evaluate("!document.querySelector('.mantis-shell') && !document.querySelector('nav a[href=\"/themes\"]')")});
    role='super'; empty=true; await navigate('/products'); await screenshot('products-empty-1440');
    results.push({test:'empty-state',passed:await evaluate("document.body.innerText.includes('No products match')")});
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({results,errors,requests},null,2));
    console.log(JSON.stringify({checks:results.length,failures:results.filter(r=>r.overflow||r.passed===false||r.fits===false||r.theme===false),errors},null,2));
    await send('Browser.close');
  } finally { socket?.close(); chrome.kill(); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
