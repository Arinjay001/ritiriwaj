const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

async function readBody(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 2_000_000) throw new Error('Payload too large');
  try { return await request.json(); } catch { throw new Error('Invalid JSON'); }
}

function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function bytesToBase64Url(bytes) {
  let binary = '';
  const array = new Uint8Array(bytes);
  for (let i = 0; i < array.length; i += 0x8000) binary += String.fromCharCode(...array.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function stringToBase64Url(value) { return bytesToBase64Url(encoder.encode(value)); }
function base64UrlToString(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return decoder.decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}
function randomHex(bytes = 16) {
  const array = new Uint8Array(bytes); crypto.getRandomValues(array); return bytesToHex(array);
}
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 210000 }, key, 256);
  return bytesToHex(bits);
}
async function sign(value, secret) {
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function tokenFrom(request, url) {
  const custom = request.headers.get('x-ritiriwaj-session');
  if (custom) return custom;
  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  const queryToken = url.searchParams.get('_rr_session');
  if (queryToken) return queryToken;
  const cookies = Object.fromEntries((request.headers.get('cookie') || '').split(';').map(part => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }).filter(([key]) => key));
  return cookies.rr_session || '';
}

async function getAdminAccount(env) {
  const row = await env.DB.prepare('SELECT email, salt, password_hash, version, updated_at FROM admin_credentials WHERE id = 1').first();
  if (row) return { email: row.email.toLowerCase(), salt: row.salt, passwordHash: row.password_hash, version: row.version, usingDefault: false };
  return { email: String(env.ADMIN_EMAIL || 'admin@ritiriwaj.in').toLowerCase(), plainPassword: env.ADMIN_PASSWORD || '', version: 'initial-secret-v1', usingDefault: true };
}
async function adminPasswordMatches(account, password) {
  if (account.passwordHash) return safeEqual(await hashPassword(password, account.salt), account.passwordHash);
  return Boolean(account.plainPassword) && safeEqual(password, account.plainPassword);
}
async function makeSession(env, user) {
  const role = user.role || 'customer';
  const session = {
    id: user.id || 'admin', email: String(user.email).toLowerCase(), name: user.name || 'RitiRiwaj Admin',
    role, provider: user.provider || 'email', nonce: randomHex(8), expires: Date.now() + 8 * 60 * 60 * 1000
  };
  if (role === 'admin') session.authVersion = user.authVersion || (await getAdminAccount(env)).version;
  const payload = stringToBase64Url(JSON.stringify(session));
  const signature = await sign(payload, env.SESSION_SECRET);
  return { token: `${payload}.${signature}`, ...session };
}
async function sendSession(env, user, status = 200) {
  const result = await makeSession(env, user);
  return json(result, status, { 'Set-Cookie': `rr_session=${encodeURIComponent(result.token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800` });
}
async function getSession(request, env, url) {
  const token = tokenFrom(request, url);
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = await sign(payload, env.SESSION_SECRET);
  if (!safeEqual(signature, expected)) return null;
  try {
    const session = JSON.parse(base64UrlToString(payload));
    if (!session.email || !session.role || session.expires < Date.now()) return null;
    if (session.role === 'admin' && session.authVersion !== (await getAdminAccount(env)).version) return null;
    return session;
  } catch { return null; }
}
async function requireAdmin(request, env, url) {
  const session = await getSession(request, env, url);
  return session?.role === 'admin' ? session : null;
}

async function getSettings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('googleClientId', 'adminGoogleEmails')").all();
  const map = Object.fromEntries(results.map(row => [row.key, row.value]));
  let adminGoogleEmails = [];
  try { adminGoogleEmails = JSON.parse(map.adminGoogleEmails || '[]'); } catch {}
  return {
    googleClientId: env.GOOGLE_CLIENT_ID || map.googleClientId || '',
    adminGoogleEmails: [...new Set([...(env.ADMIN_GOOGLE_EMAILS || '').split(','), ...adminGoogleEmails].map(email => String(email).trim().toLowerCase()).filter(Boolean))]
  };
}
async function verifyGoogleCredential(env, credential) {
  const settings = await getSettings(env);
  if (!settings.googleClientId) throw new Error('Google login is not configured yet');
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!response.ok) throw new Error('Google sign-in could not be verified');
  const profile = await response.json();
  if (profile.aud !== settings.googleClientId || profile.email_verified !== 'true' || Number(profile.exp) * 1000 < Date.now()) {
    throw new Error('This Google sign-in token is not valid for RitiRiwaj');
  }
  return profile;
}

function mapProduct(row) {
  return {
    id: row.id, name: row.name, category: row.category, description: row.description,
    price: Number(row.price), comparePrice: Number(row.compare_price), stock: Number(row.stock),
    image: row.image, badge: row.badge, featured: Boolean(row.featured)
  };
}
function cleanProduct(input, existing = {}) {
  const product = {
    name: String(input.name ?? existing.name ?? '').trim().slice(0, 100),
    category: String(input.category ?? existing.category ?? 'Rakhi').trim().slice(0, 40),
    description: String(input.description ?? existing.description ?? '').trim().slice(0, 500),
    price: Math.max(0, Number(input.price ?? existing.price ?? 0)),
    comparePrice: Math.max(0, Number(input.comparePrice ?? existing.comparePrice ?? 0)),
    stock: Math.max(0, Math.floor(Number(input.stock ?? existing.stock ?? 0))),
    image: String(input.image ?? existing.image ?? '/assets/rakhi-kundan.jpg').trim().slice(0, 1000),
    badge: String(input.badge ?? existing.badge ?? '').trim().slice(0, 30),
    featured: Boolean(input.featured ?? existing.featured ?? false)
  };
  if (!product.name || !Number.isFinite(product.price)) throw new Error('Name and a valid price are required');
  return product;
}

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  const method = request.method.toUpperCase();

  if (path === 'health' && method === 'GET') return json({ ok: true, platform: 'Cloudflare Pages + D1' });

  if (path === 'products' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM products ORDER BY featured DESC, created_at ASC').all();
    return json(results.map(mapProduct));
  }

  if (path === 'config' && method === 'GET') {
    const settings = await getSettings(env);
    return json({ googleClientId: settings.googleClientId, googleEnabled: Boolean(settings.googleClientId) });
  }

  if (path === 'login' && method === 'POST') {
    const body = await readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) return json({ error: 'Email and password are required' }, 400);
    const admin = await getAdminAccount(env);
    if (safeEqual(email, admin.email)) {
      if (!admin.plainPassword && !admin.passwordHash) return json({ error: 'Admin password is not configured in Cloudflare yet' }, 503);
      if (await adminPasswordMatches(admin, password)) return sendSession(env, { id: 'admin', email: admin.email, name: 'RitiRiwaj Admin', role: 'admin', provider: 'email', authVersion: admin.version });
    }
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!user || !user.password_hash || !safeEqual(await hashPassword(password, user.salt), user.password_hash)) {
      return json({ error: user?.provider === 'google' ? 'Please continue with Google for this account' : 'Incorrect email or password' }, 401);
    }
    return sendSession(env, { id: user.id, email: user.email, name: user.name, role: 'customer', provider: 'email' });
  }

  if (path === 'register' && method === 'POST') {
    const body = await readBody(request);
    const name = String(body.name || '').trim().slice(0, 80);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (name.length < 2) return json({ error: 'Please enter your full name' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Please enter a valid email address' }, 400);
    if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
    if (email === (await getAdminAccount(env)).email) return json({ error: 'This email is reserved for the store admin' }, 409);
    if (await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()) return json({ error: 'An account with this email already exists' }, 409);
    const id = `user-${Date.now().toString(36)}-${randomHex(2)}`;
    const salt = randomHex(16);
    await env.DB.prepare('INSERT INTO users (id, name, email, salt, password_hash, provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, name, email, salt, await hashPassword(password, salt), 'email', new Date().toISOString()).run();
    return sendSession(env, { id, name, email, role: 'customer', provider: 'email' }, 201);
  }

  if (path === 'google' && method === 'POST') {
    const body = await readBody(request);
    if (!body.credential) return json({ error: 'Google credential is required' }, 400);
    const profile = await verifyGoogleCredential(env, body.credential);
    const email = String(profile.email).toLowerCase();
    const settings = await getSettings(env);
    const admin = await getAdminAccount(env);
    if (email === admin.email || settings.adminGoogleEmails.includes(email)) {
      return sendSession(env, { id: 'admin-google', email, name: profile.name || 'RitiRiwaj Admin', role: 'admin', provider: 'google', authVersion: admin.version });
    }
    let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!user) {
      user = { id: `user-${Date.now().toString(36)}-${randomHex(2)}`, name: String(profile.name || email.split('@')[0]).slice(0, 80), email, provider: 'google', picture: String(profile.picture || '') };
      await env.DB.prepare('INSERT INTO users (id, name, email, provider, picture, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(user.id, user.name, user.email, user.provider, user.picture, new Date().toISOString()).run();
    }
    return sendSession(env, { id: user.id, email: user.email, name: user.name, role: 'customer', provider: 'google' });
  }

  if (path === 'logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': 'rr_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0' });

  if (path === 'session' && method === 'GET') {
    const session = await getSession(request, env, url);
    return session ? json({ authenticated: true, id: session.id, email: session.email, name: session.name, role: session.role, provider: session.provider }) : json({ authenticated: false }, 401);
  }

  if (path === 'settings' && method === 'GET') {
    if (!await requireAdmin(request, env, url)) return json({ error: 'Admin sign-in required' }, 401);
    const admin = await getAdminAccount(env);
    return json({ ...await getSettings(env), adminEmail: admin.email, usingDefaultAdmin: admin.usingDefault });
  }

  if (path === 'settings' && method === 'PATCH') {
    if (!await requireAdmin(request, env, url)) return json({ error: 'Admin sign-in required' }, 401);
    const body = await readBody(request);
    const googleClientId = String(body.googleClientId || '').trim();
    if (googleClientId && !googleClientId.endsWith('.apps.googleusercontent.com')) return json({ error: 'Please enter a valid Google Web Client ID' }, 400);
    const emails = (Array.isArray(body.adminGoogleEmails) ? body.adminGoogleEmails : String(body.adminGoogleEmails || '').split(',')).map(email => String(email).trim().toLowerCase()).filter(Boolean);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO settings (key, value) VALUES ('googleClientId', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(googleClientId),
      env.DB.prepare("INSERT INTO settings (key, value) VALUES ('adminGoogleEmails', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(emails))
    ]);
    return json({ googleClientId, adminGoogleEmails: emails });
  }

  if (path === 'admin/credentials' && method === 'PATCH') {
    if (!await requireAdmin(request, env, url)) return json({ error: 'Admin sign-in required' }, 401);
    const body = await readBody(request);
    const current = await getAdminAccount(env);
    const email = String(body.email || '').trim().toLowerCase();
    const newPassword = String(body.newPassword || '');
    if (!await adminPasswordMatches(current, String(body.currentPassword || ''))) return json({ error: 'Current admin password is incorrect' }, 401);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Please enter a valid admin email' }, 400);
    if (await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()) return json({ error: 'That email already belongs to a customer account' }, 409);
    if (newPassword.length < 10 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) return json({ error: 'New password needs 10+ characters with uppercase, lowercase, number and symbol' }, 400);
    const salt = randomHex(16); const updatedAt = new Date().toISOString(); const version = randomHex(12);
    await env.DB.prepare("INSERT INTO admin_credentials (id, email, salt, password_hash, version, updated_at) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email = excluded.email, salt = excluded.salt, password_hash = excluded.password_hash, version = excluded.version, updated_at = excluded.updated_at")
      .bind(email, salt, await hashPassword(newPassword, salt), version, updatedAt).run();
    return json({ ok: true, email, requiresLogin: true }, 200, { 'Set-Cookie': 'rr_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0' });
  }

  if (path === 'products' && method === 'POST') {
    if (!await requireAdmin(request, env, url)) return json({ error: 'Admin sign-in required' }, 401);
    const product = cleanProduct(await readBody(request)); product.id = `rr-${Date.now().toString(36)}-${randomHex(2)}`;
    await env.DB.prepare('INSERT INTO products (id, name, category, description, price, compare_price, stock, image, badge, featured, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(product.id, product.name, product.category, product.description, product.price, product.comparePrice, product.stock, product.image, product.badge, product.featured ? 1 : 0, new Date().toISOString()).run();
    return json(product, 201);
  }

  const productMatch = path.match(/^products\/([^/]+)$/);
  if (productMatch && method === 'PATCH') {
    if (!await requireAdmin(request, env, url)) return json({ error: 'Admin sign-in required' }, 401);
    const id = decodeURIComponent(productMatch[1]);
    const row = await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first();
    if (!row) return json({ error: 'Product not found' }, 404);
    const product = cleanProduct(await readBody(request), mapProduct(row)); product.id = id;
    await env.DB.prepare('UPDATE products SET name=?, category=?, description=?, price=?, compare_price=?, stock=?, image=?, badge=?, featured=? WHERE id=?')
      .bind(product.name, product.category, product.description, product.price, product.comparePrice, product.stock, product.image, product.badge, product.featured ? 1 : 0, id).run();
    return json(product);
  }
  if (productMatch && method === 'DELETE') {
    if (!await requireAdmin(request, env, url)) return json({ error: 'Admin sign-in required' }, 401);
    const id = decodeURIComponent(productMatch[1]);
    const result = await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
    return result.meta.changes ? json({ ok: true }) : json({ error: 'Product not found' }, 404);
  }

  if (path === 'orders' && method === 'POST') {
    const body = await readBody(request);
    if (!body.customer?.name || !body.customer?.phone || !Array.isArray(body.items) || !body.items.length) return json({ error: 'Please include your name, phone number and cart items' }, 400);
    const requested = new Map();
    for (const item of body.items) requested.set(item.id, Math.min(10, (requested.get(item.id) || 0) + Math.max(1, Math.min(10, Math.floor(Number(item.quantity) || 1)))));
    const items = [];
    for (const [id, quantity] of requested) {
      const row = await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first();
      if (!row) return json({ error: 'A product in your cart is no longer available' }, 400);
      const product = mapProduct(row);
      if (product.stock < quantity) return json({ error: `Only ${product.stock} of “${product.name}” are currently available` }, 400);
      items.push({ id, name: product.name, price: product.price, quantity, image: product.image });
    }
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0); const shipping = subtotal >= 999 ? 0 : 99;
    const order = {
      id: `RR${Date.now().toString().slice(-8)}`, createdAt: new Date().toISOString(), status: 'New',
      customer: { name: String(body.customer.name).trim().slice(0, 100), phone: String(body.customer.phone).trim().slice(0, 20), email: String(body.customer.email || '').trim().slice(0, 100), address: String(body.customer.address || '').trim().slice(0, 500), city: String(body.customer.city || '').trim().slice(0, 100), pincode: String(body.customer.pincode || '').trim().slice(0, 10) },
      items, subtotal, shipping, total: subtotal + shipping
    };
    await env.DB.batch([
      env.DB.prepare('INSERT INTO orders (id, created_at, status, customer_json, items_json, subtotal, shipping, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(order.id, order.createdAt, order.status, JSON.stringify(order.customer), JSON.stringify(items), subtotal, shipping, order.total),
      ...items.map(item => env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?').bind(item.quantity, item.id, item.quantity))
    ]);
    return json({ orderId: order.id, total: order.total }, 201);
  }

  if (path === 'orders' && method === 'GET') {
    if (!await requireAdmin(request, env, url)) return json({ error: 'Admin sign-in required' }, 401);
    const { results } = await env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
    return json(results.map(row => ({ id: row.id, createdAt: row.created_at, status: row.status, customer: JSON.parse(row.customer_json), items: JSON.parse(row.items_json), subtotal: Number(row.subtotal), shipping: Number(row.shipping), total: Number(row.total) })));
  }

  const trackMatch = path.match(/^track\/([^/]+)$/);
  if (trackMatch && method === 'GET') {
    const id = decodeURIComponent(trackMatch[1]).toUpperCase();
    const order = await env.DB.prepare('SELECT id, status, created_at FROM orders WHERE id = ?').bind(id).first();
    return order ? json({ id: order.id, status: order.status, createdAt: order.created_at }) : json({ error: 'We could not find that order number' }, 404);
  }

  const orderMatch = path.match(/^orders\/([^/]+)$/);
  if (orderMatch && method === 'PATCH') {
    if (!await requireAdmin(request, env, url)) return json({ error: 'Admin sign-in required' }, 401);
    const body = await readBody(request); const allowed = ['New', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];
    if (!allowed.includes(body.status)) return json({ error: 'Invalid order status' }, 400);
    const id = decodeURIComponent(orderMatch[1]);
    const result = await env.DB.prepare('UPDATE orders SET status = ? WHERE id = ?').bind(body.status, id).run();
    if (!result.meta.changes) return json({ error: 'Order not found' }, 404);
    const row = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
    return json({ id: row.id, createdAt: row.created_at, status: row.status, customer: JSON.parse(row.customer_json), items: JSON.parse(row.items_json), subtotal: Number(row.subtotal), shipping: Number(row.shipping), total: Number(row.total) });
  }

  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await handle(request, env); }
      catch (error) {
        console.error(error);
        return json({ error: error.message || 'Something went wrong' }, error.message === 'Payload too large' ? 413 : 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
