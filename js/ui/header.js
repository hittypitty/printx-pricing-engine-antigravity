/**
 * Header — PrintX reference: LOGO | PRICING ENGINE ... WhatsApp + phone
 */

import { getConfig, subscribeConfig } from '../state/configStore.js';

export function init(container) {
  render(container);
  subscribeConfig(() => {
    updateLogo(container);
    updateWhatsAppLink(container);
  });
}

function render(container) {
  const { branding } = getConfig();
  const logoSrc = branding.logoUrl || '';
  const logoHTML = logoSrc
    ? `<img src="${logoSrc}" alt="Company Logo" class="header-logo" id="header-logo" />`
    : `<div class="header-logo-placeholder" id="header-logo">📐</div>`;

  const whatsappLink = branding.whatsappLink || 'https://wa.me/919876543210';

  container.innerHTML = `
    <div class="header-inner">
      <div class="header-brand">
        ${logoHTML}
        <div class="header-text">
          <div class="header-separator"></div>
          <span class="header-subtitle" style="display: flex; align-items: baseline; gap: 8px;">
            PRICING ENGINE 
            <span style="font-size: 11px; text-transform: none; letter-spacing: normal; color: var(--text-muted); font-weight: 500; background: var(--bg-input); padding: 2px 6px; border-radius: 4px;">by Bazarville</span>
          </span>
        </div>
      </div>
      <div class="header-actions">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn btn-admin-toggle" id="btn-admin-toggle" title="Admin Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
          <a href="${whatsappLink}" target="_blank" rel="noopener" class="btn btn-whatsapp" id="btn-whatsapp">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
            WhatsApp Support
          </a>
        </div>
      </div>
    </div>
  `;
}

function updateLogo(container) {
  const { branding } = getConfig();
  const logoEl = container.querySelector('#header-logo');
  if (!logoEl) return;

  if (branding.logoUrl) {
    if (logoEl.tagName === 'IMG') {
      logoEl.src = branding.logoUrl;
    } else {
      const img = document.createElement('img');
      img.src = branding.logoUrl;
      img.alt = 'Company Logo';
      img.className = 'header-logo';
      img.id = 'header-logo';
      logoEl.replaceWith(img);
    }
  }
}

function updateWhatsAppLink(container) {
  const { branding } = getConfig();
  const btn = container.querySelector('#btn-whatsapp');
  if (btn && branding.whatsappLink) {
    btn.href = branding.whatsappLink;
  }
}
