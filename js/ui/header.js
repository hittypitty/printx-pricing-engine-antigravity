/**
 * Header — PrintX reference: LOGO | PRICING ENGINE ... WhatsApp + phone
 * Also renders the page navigation tabs (Pricing Engine / BV Catalog / Manage Products).
 * Active tab comes from the container's data-page attribute.
 */

import { getConfig, subscribeConfig } from '../state/configStore.js';

const NAV_ITEMS = [
  { page: 'pricing', label: 'Pricing Engine', href: 'index.html' },
  { page: 'dropship', label: 'Dropship Calculator', href: 'dropship.html' },
  { page: 'catalog', label: 'BV Catalog', href: 'catalog.html' },
  { page: 'manage', label: 'Inventory', href: 'catalog-admin.html' },
];

const SUBTITLES = {
  pricing: 'PRICING ENGINE',
  dropship: 'DROPSHIP CALCULATOR',
  catalog: 'BV CATALOG',
  manage: 'INVENTORY',
};

export function init(container) {
  render(container);
  subscribeConfig(() => {
    updateLogo(container);
  });
}

function render(container) {
  const { branding } = getConfig();
  const page = container.dataset.page || 'pricing';
  const subtitle = SUBTITLES[page] || SUBTITLES.pricing;
  const logoSrc = branding.logoUrl || 'assets/images/logo.png';
  const logoHTML = `<img src="${logoSrc}" alt="Company Logo" class="header-logo" id="header-logo" />`;

  const whatsappLink = `https://wa.me/${branding.whatsappNumber || '917869581020'}`;

  const navHTML = NAV_ITEMS.map(item => `
    <a href="${item.href}" class="app-nav-link ${item.page === page ? 'active' : ''}" ${item.page === page ? 'aria-current="page"' : ''}>${item.label}</a>
  `).join('');

  container.innerHTML = `
    <div class="header-inner">
      <div class="header-brand">
        ${logoHTML}
        <div class="header-text">
          <div class="header-separator"></div>
          <span class="header-subtitle" style="display: flex; align-items: baseline; gap: 8px;">
            ${subtitle}
            <span style="font-size: 11px; text-transform: none; letter-spacing: normal; color: var(--text-muted); font-weight: 500; background: var(--bg-input); padding: 2px 6px; border-radius: 4px;">by Bazarville</span>
          </span>
        </div>
      </div>
      <div class="header-actions">
        <div style="display: flex; align-items: center; gap: 8px;">
          <a href="${whatsappLink}" target="_blank" rel="noopener" class="btn btn-whatsapp" id="btn-whatsapp">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
            WhatsApp Support
          </a>
        </div>
      </div>
    </div>
    <nav class="app-nav" aria-label="Main">${navHTML}</nav>
  `;
}

function updateLogo(container) {
  const { branding } = getConfig();
  const logoEl = container.querySelector('#header-logo');
  if (!logoEl) return;

  const logoSrc = branding.logoUrl || 'assets/images/logo.png';
  if (logoEl.tagName === 'IMG') {
    logoEl.src = logoSrc;
  } else {
    const img = document.createElement('img');
    img.src = logoSrc;
    img.alt = 'Company Logo';
    img.className = 'header-logo';
    img.id = 'header-logo';
    logoEl.replaceWith(img);
  }
}
