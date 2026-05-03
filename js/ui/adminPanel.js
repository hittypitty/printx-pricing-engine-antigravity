/**
 * Admin Panel — Slide-over drawer for editing system config.
 * Writes to configStore. No calculation logic here.
 */

import { getConfig, updateConfig, resetConfig, subscribeConfig } from '../state/configStore.js';
import { recalculate } from '../controller/appController.js';

let isOpen = false;
let isSaving = false; // Prevents re-render during batch save

export function init() {
  const panel = document.createElement('div');
  panel.id = 'admin-panel';
  panel.className = 'admin-panel';
  document.body.appendChild(panel);

  const overlay = document.createElement('div');
  overlay.id = 'admin-overlay';
  overlay.className = 'admin-overlay';
  document.body.appendChild(overlay);

  renderPanel(panel);

  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-admin-toggle')) {
      e.preventDefault();
      e.stopPropagation();

      openAdminPanel(panel, overlay);
      return;
    }
    if (e.target.closest('#btn-admin-close')) {
      close(panel, overlay);
    }
  });

  // Close overlay on direct mousedown to prevent drag-highlight from triggering a close
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) {
      close(panel, overlay);
    }
  });

  // Re-render only when panel is open AND we're not in the middle of saving
  subscribeConfig(() => {
    if (isOpen && !isSaving) renderPanel(panel);
  });
}

function checkAdminSession() {
  const auth = sessionStorage.getItem('isAdminAuthenticated') === 'true';
  if (!auth) return false;

  const loginTime = parseInt(sessionStorage.getItem('adminLoginTime') || '0', 10);
  const now = Date.now();
  const fifteenMins = 15 * 60 * 1000;

  if (now - loginTime > fifteenMins) {
    sessionStorage.removeItem('isAdminAuthenticated');
    sessionStorage.removeItem('adminLoginTime');
    alert('Session expired. Please login again.');
    return false;
  }
  return true;
}

function openAdminPanel(panel, overlay) {
  // STRICT GUARD: Prevent direct manual access
  if (!checkAdminSession()) {
    showPasswordPrompt(panel, overlay);
    return;
  }

  // If authenticated and valid, toggle
  isOpen = !isOpen;
  panel.classList.toggle('open', isOpen);
  overlay.classList.toggle('open', isOpen);
  if (isOpen) renderPanel(panel);
}

function showPasswordPrompt(panel, overlay) {
  const promptOverlay = document.createElement('div');
  promptOverlay.style.position = 'fixed';
  promptOverlay.style.inset = '0';
  promptOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  promptOverlay.style.zIndex = '99999';
  promptOverlay.style.display = 'flex';
  promptOverlay.style.alignItems = 'center';
  promptOverlay.style.justifyContent = 'center';

  const promptModal = document.createElement('div');
  promptModal.style.background = 'white';
  promptModal.style.padding = '24px';
  promptModal.style.borderRadius = '12px';
  promptModal.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
  promptModal.style.width = '300px';
  promptModal.style.display = 'flex';
  promptModal.style.flexDirection = 'column';
  promptModal.style.gap = '16px';

  promptModal.innerHTML = `
    <h3 style="margin: 0; font-size: 18px; color: var(--text-primary);">Admin Access</h3>
    <input type="password" id="admin-pass-input" placeholder="Enter password" style="padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 14px;" />
    <div id="admin-pass-error" style="color: #ef4444; font-size: 13px; display: none;">Incorrect password.</div>
    <div style="display: flex; justify-content: flex-end; gap: 8px;">
      <button id="admin-pass-cancel" class="btn" style="background: var(--bg-input); color: var(--text-secondary);">Cancel</button>
      <button id="admin-pass-submit" class="btn btn-primary">Login</button>
    </div>
  `;

  promptOverlay.appendChild(promptModal);
  document.body.appendChild(promptOverlay);

  const input = promptModal.querySelector('#admin-pass-input');
  const err = promptModal.querySelector('#admin-pass-error');
  const cancelBtn = promptModal.querySelector('#admin-pass-cancel');
  const submitBtn = promptModal.querySelector('#admin-pass-submit');

  const cleanup = () => document.body.removeChild(promptOverlay);

  const submit = () => {
    if (input.value === '301307') {
      sessionStorage.setItem('isAdminAuthenticated', 'true');
      sessionStorage.setItem('adminLoginTime', Date.now().toString());
      cleanup();
      openAdminPanel(panel, overlay);
    } else {
      err.style.display = 'block';
      input.value = '';
      input.focus();
    }
  };

  cancelBtn.onclick = cleanup;
  submitBtn.onclick = submit;
  input.onkeydown = (ev) => { if (ev.key === 'Enter') submit(); };

  setTimeout(() => input.focus(), 50);
}

function close(panel, overlay) {
  isOpen = false;
  panel.classList.remove('open');
  overlay.classList.remove('open');
}

function renderPanel(panel) {
  const config = getConfig();

  panel.innerHTML = `
    <div class="admin-header">
      <h2 class="admin-title">⚙️ Admin Panel</h2>
      <button class="btn btn-icon" id="btn-admin-close" title="Close">✕</button>
    </div>

    <div class="admin-body">

      <!-- PRICING -->
      <div class="admin-section">
        <h3 class="admin-section-title">💰 Pricing</h3>



        <div class="admin-field">
          <label class="admin-label">Conversion Cost (₹)</label>
          <input type="number" class="input-field" value="${config.pricing.CONVERSION_COST}" data-section="pricing" data-key="CONVERSION_COST" />
        </div>

        <div class="admin-field">
          <label class="admin-label">Packaging Cost (₹)</label>
          <input type="number" class="input-field" value="${config.pricing.PACKAGING_COST}" data-section="pricing" data-key="PACKAGING_COST" />
        </div>

        <h4 class="admin-subsection-title">Slab Rates</h4>
        ${config.pricing.METER_SLABS.map((slab, i) => `
          <div class="admin-slab-row">
            <span class="admin-slab-range">${slab.min}–${slab.max === Infinity ? '∞' : slab.max}m</span>
            <div class="admin-slab-input">
              <span class="admin-slab-prefix">₹</span>
              <input type="number" class="input-field input-sm" value="${slab.rate}" data-action="slab-rate" data-index="${i}" />
              <span class="admin-slab-suffix">/m</span>
            </div>
          </div>
        `).join('')}

        <h4 class="admin-subsection-title">Sheet Prices</h4>
        ${['A4', 'A3', 'A2'].map(fmt => `
          <div class="admin-slab-row">
            <span class="admin-slab-range">${fmt}</span>
            <div class="admin-slab-input">
              <span class="admin-slab-prefix">₹</span>
              <input type="number" class="input-field input-sm" value="${config.formats.FORMATS[fmt].fixedPrice}" data-action="sheet-price" data-format="${fmt}" />
            </div>
          </div>
        `).join('')}
      </div>

      <!-- COURIERS -->
      <div class="admin-section">
        <h3 class="admin-section-title">🚚 Courier Partners</h3>
        ${Object.entries(config.couriers).map(([key, partner]) => `
          <div class="admin-courier-card">
            <h4 class="admin-courier-name">${partner.name}</h4>
            <div class="admin-field-grid">
              <div class="admin-field">
                <label class="admin-label">Base (₹)</label>
                <input type="number" class="input-field input-sm" value="${partner.base}" data-action="courier" data-partner="${key}" data-field="base" />
              </div>
              <div class="admin-field">
                <label class="admin-label">Per Slab (₹)</label>
                <input type="number" class="input-field input-sm" value="${partner.add}" data-action="courier" data-partner="${key}" data-field="add" />
              </div>
              <div class="admin-field">
                <label class="admin-label">Slab (kg)</label>
                <input type="number" class="input-field input-sm" step="0.1" value="${partner.slab}" data-action="courier" data-partner="${key}" data-field="slab" />
              </div>
              <div class="admin-field">
                <label class="admin-label">ETA</label>
                <input type="text" class="input-field input-sm" value="${partner.eta}" data-action="courier" data-partner="${key}" data-field="eta" />
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- SYSTEM -->
      <div class="admin-section">
        <h3 class="admin-section-title">⚡ System</h3>
        <div class="admin-field">
          <label class="admin-label">Weight per Meter (kg)</label>
          <input type="number" class="input-field" step="0.01" value="${config.weights.WEIGHT_PER_METER_KG}" data-section="weights" data-key="WEIGHT_PER_METER_KG" />
        </div>
      </div>

    </div>

    <div class="admin-footer">
      <button class="btn btn-primary" id="btn-admin-save">💾 Save Changes</button>
      <button class="btn btn-outline btn-danger-outline" id="btn-admin-reset">↩ Reset Defaults</button>
      <button class="btn btn-outline" id="btn-admin-logout" style="margin-left: auto;">🚪 Logout</button>
    </div>
  `;

  bindEvents(panel);
}

function bindEvents(panel) {
  panel.querySelector('#btn-admin-save')?.addEventListener('click', () => {
    saveAll(panel);
  });

  panel.querySelector('#btn-admin-reset')?.addEventListener('click', () => {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      resetConfig();
      recalculate();
    }
  });

  panel.querySelector('#btn-admin-logout')?.addEventListener('click', () => {
    sessionStorage.removeItem('isAdminAuthenticated');
    sessionStorage.removeItem('adminLoginTime');
    close(panel, document.getElementById('admin-overlay'));
  });

}

function saveAll(panel) {
  // CRITICAL: Suppress re-renders during batch save.
  // Without this, each updateConfig() triggers subscribeConfig → renderPanel,
  // which wipes the DOM inputs and loses values for fields not yet saved.
  isSaving = true;

  // 1. Collect ALL simple key-value fields, grouped by section
  const sectionUpdates = {};
  panel.querySelectorAll('[data-section][data-key]').forEach(input => {
    const section = input.dataset.section;
    const key = input.dataset.key;
    const value = input.type === 'number' ? parseFloat(input.value) : input.value;
    if (!sectionUpdates[section]) sectionUpdates[section] = {};
    sectionUpdates[section][key] = value;
  });

  // 2. Collect ALL slab rates from DOM before any writes
  const config = getConfig();
  const slabs = config.pricing.METER_SLABS.map(s => ({ ...s }));
  panel.querySelectorAll('[data-action="slab-rate"]').forEach(input => {
    const index = parseInt(input.dataset.index);
    slabs[index] = { ...slabs[index], rate: parseFloat(input.value) };
  });
  if (!sectionUpdates.pricing) sectionUpdates.pricing = {};
  sectionUpdates.pricing.METER_SLABS = slabs;

  // 3. Collect ALL sheet prices from DOM
  const formats = {};
  Object.entries(config.formats.FORMATS).forEach(([k, v]) => {
    formats[k] = { ...v };
  });
  panel.querySelectorAll('[data-action="sheet-price"]').forEach(input => {
    const fmt = input.dataset.format;
    formats[fmt] = { ...formats[fmt], fixedPrice: parseFloat(input.value) };
  });

  // 4. Collect ALL courier fields from DOM
  const courierUpdates = {};
  panel.querySelectorAll('[data-action="courier"]').forEach(input => {
    const partner = input.dataset.partner;
    const field = input.dataset.field;
    const value = input.type === 'number' ? parseFloat(input.value) : input.value;
    if (!courierUpdates[partner]) courierUpdates[partner] = {};
    courierUpdates[partner][field] = value;
  });

  // 5. Now write everything in batch — DOM is fully read at this point
  Object.entries(sectionUpdates).forEach(([section, partial]) => {
    updateConfig(section, partial);
  });
  updateConfig('formats', { FORMATS: formats });
  if (Object.keys(courierUpdates).length > 0) {
    updateConfig('couriers', courierUpdates);
  }

  // Re-enable re-renders
  isSaving = false;

  // Trigger recalculation with new config
  recalculate();

  // Re-render panel to reflect saved values
  renderPanel(panel);

  // Visual feedback
  const btn = panel.querySelector('#btn-admin-save');
  if (btn) {
    const original = btn.innerHTML;
    btn.innerHTML = '✅ Saved!';
    btn.classList.add('btn-success');
    setTimeout(() => {
      btn.innerHTML = original;
      btn.classList.remove('btn-success');
    }, 1500);
  }
}
