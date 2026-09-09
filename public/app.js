const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
let authToken = sessionStorage.getItem('rr_admin_token') || '';
const api = async (url, options = {}) => {
  const token = authToken;
  const requestUrl = token ? `${url}${url.includes('?') ? '&' : '?'}_rr_session=${encodeURIComponent(token)}` : url;
  const response = await fetch(requestUrl, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-RitiRiwaj-Session': token } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
};

const state = {
  products: [],
  cart: JSON.parse(localStorage.getItem('rr_cart') || '[]'),
  wishlist: JSON.parse(localStorage.getItem('rr_wishlist') || '[]'),
  category: 'All',
  search: '',
  sort: 'featured',
  orders: [],
  admin: false,
  session: null,
  authMode: 'login',
  authConfig: { googleClientId: '', googleEnabled: false }
};

async function loadProducts() {
  try {
    state.products = await api('/api/products');
    reconcileCart();
    renderProducts();
    renderCart();
    if (state.admin) renderAdminProducts();
  } catch (error) {
    $('#productGrid').innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>We couldn’t load the collection</h3><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function reconcileCart() {
  state.cart = state.cart.filter(item => state.products.some(p => p.id === item.id)).map(item => ({ ...item, quantity: Math.max(1, Math.min(10, item.quantity || 1)) }));
  saveCart();
}

function saveCart() {
  localStorage.setItem('rr_cart', JSON.stringify(state.cart));
}

function getVisibleProducts() {
  let items = [...state.products];
  if (state.category !== 'All') items = items.filter(p => p.category === state.category);
  const query = state.search.trim().toLowerCase();
  if (query) items = items.filter(p => `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(query));
  if (state.sort === 'low') items.sort((a, b) => a.price - b.price);
  if (state.sort === 'high') items.sort((a, b) => b.price - a.price);
  if (state.sort === 'name') items.sort((a, b) => a.name.localeCompare(b.name));
  if (state.sort === 'featured') items.sort((a, b) => Number(b.featured) - Number(a.featured));
  return items;
}

function productCard(product) {
  const wished = state.wishlist.includes(product.id);
  const soldOut = product.stock <= 0;
  return `
    <article class="product-card" data-id="${escapeHtml(product.id)}">
      <div class="product-image" data-quick-view="${escapeHtml(product.id)}" tabindex="0" role="button" aria-label="View ${escapeHtml(product.name)}">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" onerror="this.src='/assets/rakhi-kundan.jpg'" />
        ${product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : ''}
        <button class="wishlist ${wished ? 'active' : ''}" data-wishlist="${escapeHtml(product.id)}" aria-label="${wished ? 'Remove from' : 'Add to'} wishlist">${wished ? '♥' : '♡'}</button>
        <button class="quick-add" data-add="${escapeHtml(product.id)}" ${soldOut ? 'disabled' : ''}>${soldOut ? 'Sold out' : 'Add to bag'}</button>
      </div>
      <div class="product-info">
        <span class="product-category">${escapeHtml(product.category)}</span>
        <div class="product-title-row">
          <h3 data-quick-view="${escapeHtml(product.id)}">${escapeHtml(product.name)}</h3>
          <div class="price">${money(product.price)} ${product.comparePrice > product.price ? `<s>${money(product.comparePrice)}</s>` : ''}</div>
        </div>
        <span class="stock-note ${product.stock <= 10 ? 'low' : ''}">${soldOut ? 'Currently unavailable' : product.stock <= 10 ? `Only ${product.stock} left` : 'Ready to gift'}</span>
      </div>
    </article>`;
}

function renderProducts() {
  const items = getVisibleProducts();
  $('#productGrid').innerHTML = items.map(productCard).join('');
  $('#emptyState').classList.toggle('hidden', items.length > 0);
}

function setCategory(category) {
  state.category = category;
  $$('.filter').forEach(btn => btn.classList.toggle('active', btn.dataset.category === category));
  renderProducts();
}

function addToCart(id, quantity = 1) {
  const product = state.products.find(p => p.id === id);
  if (!product || product.stock <= 0) return toast('Unavailable', 'This rakhi is currently sold out.', '!');
  const existing = state.cart.find(item => item.id === id);
  if (existing) existing.quantity = Math.min(10, existing.quantity + quantity);
  else state.cart.push({ id, quantity });
  saveCart();
  renderCart();
  toast('Added to your bag', product.name);
}

function cartDetails() {
  return state.cart.map(item => ({ ...item, product: state.products.find(p => p.id === item.id) })).filter(item => item.product);
}

function renderCart() {
  const details = cartDetails();
  const count = details.reduce((sum, item) => sum + item.quantity, 0);
  $('#cartCount').textContent = count;
  $('#cartItems').innerHTML = details.map(({ product, quantity }) => `
    <div class="cart-item" data-cart-id="${escapeHtml(product.id)}">
      <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" onerror="this.src='/assets/rakhi-kundan.jpg'" />
      <div><small>${escapeHtml(product.category)}</small><h4>${escapeHtml(product.name)}</h4><div class="qty"><button data-qty="-1" aria-label="Decrease quantity">−</button><span>${quantity}</span><button data-qty="1" aria-label="Increase quantity">＋</button></div></div>
      <div class="cart-item-price"><b>${money(product.price * quantity)}</b><button class="remove-item" data-remove-cart>Remove</button></div>
    </div>`).join('');
  const subtotal = details.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const shipping = subtotal >= 999 ? 0 : 99;
  $('#cartEmpty').classList.toggle('hidden', details.length > 0);
  $('#cartSummary').classList.toggle('hidden', details.length === 0);
  $('#cartSubtotal').textContent = money(subtotal);
  $('#cartShipping').textContent = shipping ? money(shipping) : 'Complimentary';
  $('#cartTotal').textContent = money(subtotal + shipping);
  $('#checkoutTotal').textContent = money(subtotal + shipping);
  const left = Math.max(0, 999 - subtotal);
  $('#shippingText').textContent = left ? 'Add more for free delivery' : 'You’ve unlocked free delivery';
  $('#shippingAmount').textContent = left ? money(left) : 'Shagun!';
  $('#shippingBar').style.width = `${Math.min(100, subtotal / 999 * 100)}%`;
}

function openCart() {
  closeAllModals();
  $('#cartDrawer').classList.add('open');
  $('#cartDrawer').setAttribute('aria-hidden', 'false');
  $('#drawerBackdrop').classList.add('open');
  document.body.classList.add('locked');
}
function closeCart() {
  $('#cartDrawer').classList.remove('open');
  $('#cartDrawer').setAttribute('aria-hidden', 'true');
  $('#drawerBackdrop').classList.remove('open');
  if (!$('.modal.open')) document.body.classList.remove('locked');
}
function openModal(id) {
  closeCart();
  closeAllModals();
  $(id).classList.add('open');
  $('#modalBackdrop').classList.add('open');
  document.body.classList.add('locked');
  setTimeout(() => $(id).querySelector('input, button, select')?.focus(), 80);
}
function closeAllModals() {
  $$('.modal.open').forEach(modal => modal.classList.remove('open'));
  $('#modalBackdrop').classList.remove('open');
  if (!$('#cartDrawer').classList.contains('open')) document.body.classList.remove('locked');
}

let toastTimer;
function toast(title, message = '', icon = '✓') {
  $('#toastTitle').textContent = title;
  $('#toastMessage').textContent = message;
  $('#toastIcon').textContent = icon;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2800);
}

function openQuickView(id) {
  const p = state.products.find(product => product.id === id);
  if (!p) return;
  $('#quickViewContent').innerHTML = `
    <div class="quick-grid">
      <div class="quick-image"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" onerror="this.src='/assets/rakhi-kundan.jpg'" /></div>
      <div class="quick-copy">
        <div class="eyebrow">${escapeHtml(p.category)}</div><h2 id="quickName">${escapeHtml(p.name)}</h2>
        <div class="quick-price">${money(p.price)} ${p.comparePrice > p.price ? `<s>${money(p.comparePrice)}</s>` : ''}</div>
        <p>${escapeHtml(p.description)}</p>
        <div class="quick-details"><span>Craft <b>Hand-finished in India</b></span><span>Includes <b>Roli–chawal & message card</b></span><span>Packaging <b>RitiRiwaj gift box</b></span></div>
        <span class="stock-note ${p.stock <= 10 ? 'low' : ''}">${p.stock > 0 ? `${p.stock} pieces available` : 'Currently unavailable'}</span>
        <button class="btn btn-maroon full" data-modal-add="${escapeHtml(p.id)}" ${p.stock <= 0 ? 'disabled' : ''}>${p.stock <= 0 ? 'Sold out' : 'Add to bag — ' + money(p.price)}</button>
      </div>
    </div>`;
  openModal('#productModal');
}

// Storefront events
$('#productGrid').addEventListener('click', event => {
  const add = event.target.closest('[data-add]');
  const wish = event.target.closest('[data-wishlist]');
  const quick = event.target.closest('[data-quick-view]');
  if (add) { event.stopPropagation(); addToCart(add.dataset.add); }
  else if (wish) {
    event.stopPropagation();
    const id = wish.dataset.wishlist;
    state.wishlist = state.wishlist.includes(id) ? state.wishlist.filter(item => item !== id) : [...state.wishlist, id];
    localStorage.setItem('rr_wishlist', JSON.stringify(state.wishlist));
    renderProducts();
    toast(state.wishlist.includes(id) ? 'Saved for later' : 'Removed from favourites', 'Your festive shortlist has been updated.', '♡');
  } else if (quick) openQuickView(quick.dataset.quickView);
});
$('#productGrid').addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.dataset.quickView) openQuickView(event.target.dataset.quickView);
});
$('#quickViewContent').addEventListener('click', event => {
  const button = event.target.closest('[data-modal-add]');
  if (button) { addToCart(button.dataset.modalAdd); closeAllModals(); openCart(); }
});
$$('.filter').forEach(button => button.addEventListener('click', () => setCategory(button.dataset.category)));
$$('.category-tile').forEach(button => button.addEventListener('click', () => {
  setCategory(button.dataset.category);
  $('#collection').scrollIntoView({ behavior: 'smooth' });
}));
$$('[data-filter-link]').forEach(link => link.addEventListener('click', () => setCategory(link.dataset.filterLink)));
$('#sortProducts').addEventListener('change', event => { state.sort = event.target.value; renderProducts(); });
$('#resetFilters').addEventListener('click', () => { state.search = ''; $('#searchInput').value = ''; setCategory('All'); });

$('#searchBtn').addEventListener('click', () => { $('#searchPanel').classList.toggle('open'); setTimeout(() => $('#searchInput').focus(), 80); });
$('#closeSearch').addEventListener('click', () => $('#searchPanel').classList.remove('open'));
$('#searchInput').addEventListener('input', event => { state.search = event.target.value; renderProducts(); if (state.search) $('#collection').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('#menuBtn').addEventListener('click', () => $('#mobileMenu').classList.toggle('open'));
$$('#mobileMenu a').forEach(link => link.addEventListener('click', () => $('#mobileMenu').classList.remove('open')));
window.addEventListener('scroll', () => $('#siteHeader').classList.toggle('scrolled', window.scrollY > 10), { passive: true });

$('#cartBtn').addEventListener('click', openCart);
$('#closeCart').addEventListener('click', closeCart);
$('#drawerBackdrop').addEventListener('click', closeCart);
$('#emptyShopBtn').addEventListener('click', () => { closeCart(); $('#collection').scrollIntoView({ behavior: 'smooth' }); });
$('#cartItems').addEventListener('click', event => {
  const itemEl = event.target.closest('[data-cart-id]');
  if (!itemEl) return;
  const item = state.cart.find(entry => entry.id === itemEl.dataset.cartId);
  if (event.target.closest('[data-qty]')) {
    item.quantity += Number(event.target.closest('[data-qty]').dataset.qty);
    if (item.quantity <= 0) state.cart = state.cart.filter(entry => entry.id !== item.id);
    item.quantity = Math.min(10, item.quantity);
  }
  if (event.target.closest('[data-remove-cart]')) state.cart = state.cart.filter(entry => entry.id !== item.id);
  saveCart(); renderCart();
});
$('#checkoutBtn').addEventListener('click', () => {
  if (state.session) {
    const form = $('#checkoutForm');
    if (!form.elements.name.value) form.elements.name.value = state.session.name || '';
    if (!form.elements.email.value) form.elements.email.value = state.session.email || '';
  }
  openModal('#checkoutModal');
});

$$('[data-close-modal]').forEach(button => button.addEventListener('click', closeAllModals));
$('#modalBackdrop').addEventListener('click', closeAllModals);
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeAllModals(); closeCart(); $('#searchPanel').classList.remove('open'); } });

// Checkout and order tracking
$('#checkoutForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('button[type="submit"]', form);
  button.classList.add('loading'); button.disabled = true; $('#checkoutError').textContent = '';
  try {
    const customer = Object.fromEntries(new FormData(form).entries());
    const result = await api('/api/orders', { method: 'POST', body: JSON.stringify({ customer, items: state.cart }) });
    state.cart = []; saveCart(); renderCart(); closeAllModals(); form.reset();
    toast('Order placed with shagun!', `Order ${result.orderId} · ${money(result.total)}`, '✦');
    setTimeout(() => alert(`Thank you! Your RitiRiwaj order ${result.orderId} has been placed.\n\nWe will call you to confirm this cash-on-delivery order.`), 250);
  } catch (error) { $('#checkoutError').textContent = error.message; }
  finally { button.classList.remove('loading'); button.disabled = false; }
});
function openTrack() { $('#trackResult').textContent = ''; $('#trackResult').className = 'track-result'; openModal('#trackModal'); }
$('#trackOrderBtn').addEventListener('click', openTrack); $('#footerTrackBtn').addEventListener('click', openTrack);
$('#trackForm').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('input', event.currentTarget).value.trim().toUpperCase();
  try {
    const order = await api(`/api/track/${encodeURIComponent(id)}`);
    $('#trackResult').className = 'track-result found';
    $('#trackResult').innerHTML = `<b>${escapeHtml(order.id)}</b> · ${escapeHtml(order.status)}<br><small>Placed ${new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</small>`;
  } catch (error) { $('#trackResult').className = 'track-result found'; $('#trackResult').textContent = error.message; }
});
$('#newsletterForm').addEventListener('submit', event => { event.preventDefault(); event.currentTarget.reset(); toast('You’re on the festive list', 'Watch your inbox for stories and new arrivals.', '✦'); });

// Customer + admin authentication
function sessionFromResult(result) {
  if (result.token) {
    authToken = result.token;
    sessionStorage.setItem('rr_admin_token', result.token);
  }
  state.session = { id: result.id, email: result.email, name: result.name, role: result.role, provider: result.provider };
  state.admin = result.role === 'admin';
  updateAccountUi();
}
function updateAccountUi() {
  const session = state.session;
  $('#accountLabel').textContent = session ? (session.role === 'admin' ? 'Studio' : session.name.split(' ')[0]) : 'Sign in';
  $('#mobileAdminBtn').textContent = session ? (session.role === 'admin' ? 'Open admin studio' : `My account · ${session.name.split(' ')[0]}`) : 'Sign in / create account';
  if (!session) return;
  $('#accountName').textContent = session.name;
  $('#accountEmail').textContent = session.email;
  $('#accountRole').textContent = session.role === 'admin' ? 'Store administrator' : 'Customer account';
  $('#accountAvatar').textContent = session.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  $('#openAdminStudio').classList.toggle('hidden', session.role !== 'admin');
  $('#adminEmailLabel').textContent = session.email;
}
function setAuthMode(mode) {
  state.authMode = mode;
  $$('[data-auth-mode]').forEach(button => button.classList.toggle('active', button.dataset.authMode === mode));
  $('#registerNameField').classList.toggle('hidden', mode !== 'register');
  $('#registerName').required = mode === 'register';
  $('#loginPassword').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('#emailAuthButtonLabel').textContent = mode === 'register' ? 'Create account with email' : 'Sign in with email';
  $('#authSubtitle').textContent = mode === 'register' ? 'Create your customer account with Google or email.' : 'Sign in with Google or continue directly with email.';
  $('.admin-login-hint', $('#loginModal')).classList.toggle('hidden', mode === 'register');
  $('#loginError').textContent = '';
}
function openLogin() {
  $('#loginError').textContent = '';
  if (state.session) {
    $('#authGuestView').classList.add('hidden');
    $('#authAccountView').classList.remove('hidden');
  } else {
    $('#authGuestView').classList.remove('hidden');
    $('#authAccountView').classList.add('hidden');
    setAuthMode('login');
  }
  openModal('#loginModal');
}
$('#accountBtn').addEventListener('click', () => state.admin ? showAdmin() : openLogin());
$('#mobileAdminBtn').addEventListener('click', () => state.admin ? showAdmin() : openLogin());
$('#footerAdminBtn').addEventListener('click', () => state.admin ? showAdmin() : openLogin());
$$('[data-auth-mode]').forEach(button => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
$('#togglePassword').addEventListener('click', event => {
  const input = $('#loginPassword'); input.type = input.type === 'password' ? 'text' : 'password'; event.target.textContent = input.type === 'password' ? 'Show' : 'Hide';
});
$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('button[type="submit"]', form);
  button.classList.add('loading'); button.disabled = true; $('#loginError').textContent = '';
  try {
    const payload = { name: $('#registerName').value, email: $('#loginEmail').value, password: $('#loginPassword').value };
    const endpoint = state.authMode === 'register' ? '/api/register' : '/api/login';
    const result = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    sessionFromResult(result); form.reset();
    if (state.admin) { closeAllModals(); await showAdmin(); toast('Admin login successful', 'Welcome to your RitiRiwaj studio.', '✦'); }
    else { closeAllModals(); toast(state.authMode === 'register' ? 'Account created' : 'Welcome back', `Namaste, ${state.session.name.split(' ')[0]}!`, '✦'); }
  } catch (error) { $('#loginError').textContent = error.message; }
  finally { button.classList.remove('loading'); button.disabled = false; }
});

async function finishGoogleLogin(response) {
  $('#loginError').textContent = '';
  try {
    const result = await api('/api/google', { method: 'POST', body: JSON.stringify({ credential: response.credential }) });
    sessionFromResult(result);
    if (state.admin) { closeAllModals(); await showAdmin(); toast('Google admin login successful', `Signed in as ${state.session.email}`, '✦'); }
    else { closeAllModals(); toast('Signed in with Google', `Namaste, ${state.session.name.split(' ')[0]}!`, '✦'); }
  } catch (error) { openLogin(); $('#loginError').textContent = error.message; }
}
window.handleGoogleCredentialResponse = finishGoogleLogin;
function renderGoogleButton() {
  if (!state.authConfig.googleEnabled || !window.google?.accounts?.id) return;
  const mount = $('#googleButtonMount');
  mount.innerHTML = '';
  window.google.accounts.id.initialize({ client_id: state.authConfig.googleClientId, callback: finishGoogleLogin, ux_mode: 'popup', auto_select: false });
  window.google.accounts.id.renderButton(mount, { theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', width: Math.min(360, mount.parentElement.clientWidth) });
  $('#googleSetupBtn').classList.add('hidden');
  $('.google-auth-wrap').classList.add('connected');
  $('#googleLoginStatus').textContent = 'Secure Google sign-in is connected.';
}
async function loadAuthConfig(force = false) {
  try {
    state.authConfig = await api('/api/config');
    if (!state.authConfig.googleEnabled) {
      $('#googleSetupBtn').classList.remove('hidden'); $('#googleButtonMount').innerHTML = '';
      $('.google-auth-wrap').classList.remove('connected'); $('#googleLoginStatus').textContent = 'Google login needs one-time setup by the admin.';
      return;
    }
    if (window.google?.accounts?.id) return renderGoogleButton();
    if (!$('#googleIdentityScript')) {
      const script = document.createElement('script'); script.id = 'googleIdentityScript'; script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.defer = true; script.onload = renderGoogleButton; script.onerror = () => { $('#googleLoginStatus').textContent = 'Google sign-in could not load. Email login is still available.'; }; document.head.appendChild(script);
    } else if (force) setTimeout(renderGoogleButton, 200);
  } catch { $('#googleLoginStatus').textContent = 'Email login is available. Google configuration could not be checked.'; }
}
$('#googleSetupBtn').addEventListener('click', () => {
  if (state.admin) { closeAllModals(); showAdmin().then(() => setAdminTab('settings')); }
  else toast('Google setup required', 'Admin can connect it from Admin Studio → Login settings.', '!');
});

async function verifySession() {
  const checkingToken = authToken;
  if (!checkingToken) return;
  try { const session = await api('/api/session'); sessionFromResult(session); }
  catch {
    // Do not erase a fresh login token if an older page-load check finishes late.
    if (authToken === checkingToken) {
      authToken = '';
      sessionStorage.removeItem('rr_admin_token');
      state.session = null; state.admin = false; updateAccountUi();
    }
  }
}
async function signOut() {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  if (window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect();
  authToken = ''; sessionStorage.removeItem('rr_admin_token'); state.admin = false; state.session = null; closeAllModals(); showStore(); updateAccountUi(); toast('Signed out', 'See you again soon.');
}
async function showAdmin() {
  if (!state.admin) return openLogin();
  $('#storefront').classList.add('hidden'); $('#siteHeader').classList.add('hidden'); $('.announcement').classList.add('hidden'); $('#siteFooter').classList.add('hidden'); $('#adminScreen').classList.remove('hidden');
  window.scrollTo(0, 0); renderAdminProducts(); await Promise.all([loadOrders(), loadSettings()]);
}
function showStore() {
  $('#adminScreen').classList.add('hidden'); $('#storefront').classList.remove('hidden'); $('#siteHeader').classList.remove('hidden'); $('.announcement').classList.remove('hidden'); $('#siteFooter').classList.remove('hidden'); window.scrollTo(0, 0); renderProducts();
}
$('#viewStoreBtn').addEventListener('click', showStore); $('#adminMobileExit').addEventListener('click', showStore);
$('#logoutBtn').addEventListener('click', signOut); $('#accountSignOut').addEventListener('click', signOut);
$('#openAdminStudio').addEventListener('click', () => { closeAllModals(); showAdmin(); });
$('#accountTrackOrder').addEventListener('click', () => { closeAllModals(); openTrack(); });

$$('[data-admin-tab]').forEach(button => button.addEventListener('click', () => setAdminTab(button.dataset.adminTab)));
$('[data-go-products]').addEventListener('click', () => setAdminTab('products'));
function setAdminTab(tab) {
  $$('[data-admin-tab]').forEach(button => button.classList.toggle('active', button.dataset.adminTab === tab));
  $$('.admin-tab').forEach(section => section.classList.add('hidden'));
  $(`#admin${tab[0].toUpperCase() + tab.slice(1)}Tab`).classList.remove('hidden');
  if (tab === 'orders') loadOrders();
  if (tab === 'settings') loadSettings();
}

async function loadSettings() {
  if (!state.admin) return;
  $('#currentOrigin').textContent = window.location.origin;
  try {
    const settings = await api('/api/settings');
    $('#googleClientIdInput').value = settings.googleClientId || '';
    $('#adminGoogleEmailsInput').value = (settings.adminGoogleEmails || []).join(', ');
    $('#newAdminEmail').value = settings.adminEmail || state.session?.email || '';
    const connected = Boolean(settings.googleClientId);
    $('#googleSetupStatus').textContent = connected ? 'Connected' : 'Not connected';
    $('#googleSetupStatus').classList.toggle('connected', connected);
    $('#defaultPasswordWarning').classList.toggle('hidden', !settings.usingDefaultAdmin);
    $('#adminSecurityStatus').textContent = settings.usingDefaultAdmin ? 'Action needed' : 'Secured';
    $('#adminSecurityStatus').classList.toggle('connected', !settings.usingDefaultAdmin);
  } catch (error) { $('#settingsError').textContent = error.message; }
}
$('#authSettingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('button[type="submit"]', event.currentTarget); button.classList.add('loading'); button.disabled = true; $('#settingsError').textContent = '';
  try {
    const googleClientId = $('#googleClientIdInput').value.trim();
    const adminGoogleEmails = $('#adminGoogleEmailsInput').value.split(',').map(email => email.trim()).filter(Boolean);
    await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ googleClientId, adminGoogleEmails }) });
    await loadSettings(); await loadAuthConfig(true);
    toast(googleClientId ? 'Google login connected' : 'Google login disconnected', googleClientId ? 'Customers and approved admins can now use Google.' : 'Direct email login remains available.', '✦');
  } catch (error) { $('#settingsError').textContent = error.message; }
  finally { button.classList.remove('loading'); button.disabled = false; }
});

$('#adminCredentialForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('button[type="submit"]', form);
  const email = $('#newAdminEmail').value.trim();
  const currentPassword = $('#currentAdminPassword').value;
  const newPassword = $('#newAdminPassword').value;
  const confirmPassword = $('#confirmAdminPassword').value;
  $('#credentialError').textContent = '';
  if (newPassword !== confirmPassword) { $('#credentialError').textContent = 'New passwords do not match'; return; }
  button.classList.add('loading'); button.disabled = true;
  try {
    await api('/api/admin/credentials', { method: 'PATCH', body: JSON.stringify({ email, currentPassword, newPassword }) });
    authToken = ''; sessionStorage.removeItem('rr_admin_token'); state.admin = false; state.session = null;
    form.reset(); showStore(); updateAccountUi(); openLogin(); $('#loginEmail').value = email;
    toast('Admin login secured', 'Credentials updated. Please sign in with your new password.', '✓');
  } catch (error) { $('#credentialError').textContent = error.message; }
  finally { button.classList.remove('loading'); button.disabled = false; }
});

function productStatus(product) {
  if (product.stock <= 0) return ['Out of stock', 'out'];
  if (product.stock <= 10) return ['Low stock', 'low'];
  return ['In stock', ''];
}
function renderAdminProducts() {
  if (!state.admin) return;
  const query = ($('#adminSearch')?.value || '').toLowerCase();
  const category = $('#adminCategory')?.value || 'All';
  const products = state.products.filter(p => (category === 'All' || p.category === category) && `${p.name} ${p.category}`.toLowerCase().includes(query));
  $('#adminProductRows').innerHTML = products.map(p => {
    const [status, cls] = productStatus(p);
    return `<tr data-product-row="${escapeHtml(p.id)}"><td><div class="table-product"><img src="${escapeHtml(p.image)}" alt="" onerror="this.src='/assets/rakhi-kundan.jpg'"/><div><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.id)}</small></div></div></td><td>${escapeHtml(p.category)}</td><td><b>${money(p.price)}</b>${p.comparePrice > p.price ? `<br><small><s>${money(p.comparePrice)}</s></small>` : ''}</td><td>${p.stock}</td><td><span class="status-pill ${cls}">${status}</span></td><td><div class="row-actions"><button data-edit-product="${escapeHtml(p.id)}" title="Edit product">✎</button><button class="delete" data-delete-product="${escapeHtml(p.id)}" title="Delete product">×</button></div></td></tr>`;
  }).join('');
  $('#statProducts').textContent = state.products.length;
  $('#statLowStock').textContent = state.products.filter(p => p.stock <= 10).length;
  const value = state.products.reduce((sum, p) => sum + p.price * p.stock, 0);
  $('#statValue').textContent = money(value);
  $('#overviewValue').textContent = money(value);
  $('#overviewStock').textContent = state.products.reduce((sum, p) => sum + p.stock, 0);
}
$('#adminSearch').addEventListener('input', renderAdminProducts); $('#adminCategory').addEventListener('change', renderAdminProducts);
$('#adminProductRows').addEventListener('click', event => {
  const edit = event.target.closest('[data-edit-product]'); const del = event.target.closest('[data-delete-product]');
  if (edit) openProductForm(edit.dataset.editProduct);
  if (del) deleteProduct(del.dataset.deleteProduct);
});
$('#addProductBtn').addEventListener('click', () => openProductForm());
function openProductForm(id) {
  const form = $('#productForm'); form.reset(); $('#productFormError').textContent = '';
  const p = state.products.find(item => item.id === id);
  $('#productFormTitle').textContent = p ? 'Edit rakhi details' : 'Add a new rakhi';
  if (p) {
    for (const [key, value] of Object.entries(p)) {
      if (!form.elements[key]) continue;
      if (form.elements[key].type === 'checkbox') form.elements[key].checked = Boolean(value);
      else form.elements[key].value = value;
    }
  } else { form.elements.id.value = ''; form.elements.image.value = '/assets/rakhi-kundan.jpg'; form.elements.stock.value = 10; }
  openModal('#productFormModal');
}
$$('[data-image]').forEach(button => button.addEventListener('click', () => { $('#productForm').elements.image.value = button.dataset.image; }));
$('#productForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form).entries()); data.featured = form.elements.featured.checked;
  const id = data.id; delete data.id; const button = $('button[type="submit"]', form); button.classList.add('loading'); button.disabled = true; $('#productFormError').textContent = '';
  try {
    await api(id ? `/api/products/${encodeURIComponent(id)}` : '/api/products', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) });
    closeAllModals(); await loadProducts(); toast(id ? 'Rakhi updated' : 'Rakhi added', 'Your storefront is now up to date.', '✦');
  } catch (error) { $('#productFormError').textContent = error.message; }
  finally { button.classList.remove('loading'); button.disabled = false; }
});
async function deleteProduct(id) {
  const p = state.products.find(item => item.id === id); if (!p) return;
  if (!confirm(`Delete “${p.name}”? This cannot be undone.`)) return;
  try { await api(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' }); await loadProducts(); toast('Product removed', p.name); } catch (error) { toast('Could not delete', error.message, '!'); }
}

async function loadOrders() {
  if (!state.admin) return;
  try { state.orders = await api('/api/orders'); renderOrders(); }
  catch (error) { toast('Orders could not load', error.message, '!'); }
}
function renderOrders() {
  $('#newOrderCount').textContent = state.orders.filter(o => o.status === 'New').length;
  $('#overviewOrders').textContent = state.orders.length;
  $('#noOrders').classList.toggle('hidden', state.orders.length > 0);
  $('#adminOrderRows').innerHTML = state.orders.map(o => `<tr><td><b>${escapeHtml(o.id)}</b><br><small>${new Date(o.createdAt).toLocaleDateString('en-IN')}</small></td><td><b>${escapeHtml(o.customer.name)}</b><br><small>${escapeHtml(o.customer.phone)} · ${escapeHtml(o.customer.city)}</small></td><td>${o.items.reduce((s, i) => s + i.quantity, 0)}<br><small>${escapeHtml(o.items.map(i => i.name).join(', '))}</small></td><td><b>${money(o.total)}</b><br><small>COD</small></td><td><select class="order-status" data-order-status="${escapeHtml(o.id)}">${['New','Confirmed','Shipped','Delivered','Cancelled'].map(status => `<option ${o.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></td></tr>`).join('');
}
$('#adminOrderRows').addEventListener('change', async event => {
  if (!event.target.matches('[data-order-status]')) return;
  try { await api(`/api/orders/${encodeURIComponent(event.target.dataset.orderStatus)}`, { method: 'PATCH', body: JSON.stringify({ status: event.target.value }) }); await loadOrders(); toast('Order updated', `Status changed to ${event.target.value}.`); } catch (error) { toast('Update failed', error.message, '!'); }
});
$('#refreshOrders').addEventListener('click', loadOrders);

(async function init() {
  await Promise.all([verifySession(), loadAuthConfig()]);
  await loadProducts();
  if (location.hash === '#admin' && state.admin) showAdmin();
})();
