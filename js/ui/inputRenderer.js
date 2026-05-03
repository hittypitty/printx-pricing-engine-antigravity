/**
 * Input Renderer — Format selector, dimensions, quantity, delivery method
 * Renders controls and binds events to controller.
 */

import { subscribe, getState } from '../state/store.js';
import { onInputChange, onImagesUpdated, addConversion, updateConversion, removeConversion } from '../controller/appController.js';
import { processImage } from '../modules/imageProcessor.js';

export function init(container) {
  // Render initial structure
  container.innerHTML = buildHTML(getState());

  // Bind events via delegation
  container.addEventListener('click', handleClick);
  container.addEventListener('input', handleInput);
  
  container.addEventListener('change', async (e) => {
    if (e.target.id === 'image-upload-input') {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;
      
      const state = getState();
      const currentImages = [...state.images];
      
      for (const file of files) {
        const processed = await processImage(file);
        currentImages.push(processed);
      }
      
      onImagesUpdated(currentImages);
      e.target.value = ''; // reset
    }
  });

  // Subscribe to state changes for targeted updates
  subscribe(state => updateDOM(container, state));
}

function buildHTML(state) {
  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          Upload Design (Optional)
        </h2>
      </div>
      <div class="card-body">
        <label class="btn btn-outline" style="width: 100%; display: flex; justify-content: center; margin-bottom: var(--space-md); cursor: pointer;">
          📁 Select PNG Images
          <input type="file" id="image-upload-input" accept="image/png" multiple hidden />
        </label>
        <div id="image-preview-container" style="display: flex; flex-direction: column; gap: 8px;"></div>
      </div>
    </div>
    
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          Print Details
        </h2>
      </div>
      <div class="card-body">
        <div class="field-group" style="margin-bottom: 0;">
          <label class="field-label">SELECT FORMAT</label>
          <div class="btn-group" id="format-group">
            ${['A4', 'A3', 'A2', 'Meters'].map(f => `
              <button class="btn btn-select ${state.format === f ? 'active' : ''}" data-action="format" data-value="${f}" id="btn-format-${f.toLowerCase()}" ${state.inputMode === 'image' ? 'disabled' : ''}>${f}</button>
            `).join('')}
          </div>
        </div>
        
        <div style="height: 1px; background: var(--border-color); margin: var(--space-xl) 0;"></div>

        <div class="field-group" id="meters-fields" style="display: ${state.format === 'Meters' || state.inputMode === 'image' ? 'block' : 'none'}; margin-bottom: 0;">
          <div class="input-row">
            <div class="input-col">
              <label class="field-label">WIDTH (INCHES)</label>
              <input type="text" class="input-field input-fixed" value="24 (Fixed)" disabled id="input-width" />
            </div>
            <div class="input-col">
              <label class="field-label">LENGTH (INCHES)</label>
              <input type="text" class="input-field" placeholder="e.g. 1m, 20+19 or 39x3" data-field="rawLength" value="${state.inputMode === 'image' && state.computedImageLength ? state.computedImageLength + '" (Auto)' : state.rawLength}" id="input-length" ${state.inputMode === 'image' ? 'disabled style="background: var(--bg-input); border-color: var(--border-color); color: var(--text-muted);"' : ''} />
              <div id="length-helper" style="font-size: 13px; color: var(--accent-pink); margin-top: 6px; font-weight: 500; display: none;"></div>
            </div>
          </div>
        </div>

        <div class="field-group" id="quantity-field" style="display: ${state.format !== 'Meters' && state.inputMode !== 'image' ? 'block' : 'none'}; margin-bottom: 0;">
          <div class="input-row">
            <div class="input-col">
              <label class="field-label">SELECTED FORMAT</label>
              <div id="format-badge" style="background: #fdf2f8; border: 1px solid #fce7f3; border-radius: 8px; padding: 10px 14px; display: flex; flex-direction: column; justify-content: center; min-height: 44px;">
                <span id="format-badge-name" style="color: #9d174d; font-weight: 700; font-size: 14px;">A4 Sheet</span>
                <span id="format-badge-dims" style="color: #be185d; font-size: 11px; margin-top: 2px;">(11" x 8")</span>
              </div>
            </div>
            <div class="input-col">
              <label class="field-label">QUANTITY (PIECES)</label>
              <div class="number-input-group">
                <button class="btn-spin" data-action="dec-qty">-</button>
                <input type="number" class="input-field" min="1" value="${state.quantity}" data-field="quantity" id="input-quantity" />
                <button class="btn-spin" data-action="inc-qty">+</button>
              </div>
            </div>
          </div>
        </div>

        <div style="height: 1px; background: var(--border-color); margin: var(--space-xl) 0;"></div>

        <div class="field-group" style="margin-bottom: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <label class="field-label" style="margin-bottom: 0;">CONVERSIONS</label>
            <button class="btn-add-conversion" data-action="add-conversion">+ Add Conversion</button>
          </div>
          <div id="conversions-container" style="display: flex; flex-direction: column; gap: 12px;"></div>
        </div>

        <div class="validation-error" id="validation-error" style="display: none"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon">
            <rect x="1" y="3" width="15" height="13"></rect>
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
            <circle cx="5.5" cy="18.5" r="2.5"></circle>
            <circle cx="18.5" cy="18.5" r="2.5"></circle>
          </svg>
          Delivery Details
        </h2>
      </div>
      <div class="card-body">
        <div class="field-group" style="margin-bottom: ${state.deliveryMethod === 'courier' ? 'var(--space-xl)' : '0'};" id="delivery-method-group">
          <label class="field-label">Delivery Method</label>
          <div class="btn-group" id="delivery-group">
            <button class="btn btn-select ${state.deliveryMethod === 'pickup' ? 'active' : ''}" data-action="delivery" data-value="pickup" id="btn-delivery-pickup">
              🏢 Office Pickup
            </button>
            <button class="btn btn-select ${state.deliveryMethod === 'courier' ? 'active' : ''}" data-action="delivery" data-value="courier" id="btn-delivery-courier">
              📦 Courier
            </button>
          </div>
        </div>

        <div id="courier-section" style="display: ${state.deliveryMethod === 'courier' ? 'block' : 'none'}">
          <div class="field-group">
            <label class="field-label">Sort By</label>
            <div class="chip-group" id="filter-group">
              ${['all', 'cheapest', 'fastest'].map(f => `
                <button class="chip ${state.courierFilter === f ? 'active' : ''}" data-action="filter" data-value="${f}" id="chip-filter-${f}">${f.charAt(0).toUpperCase() + f.slice(1)}</button>
              `).join('')}
            </div>
          </div>
          <div id="partner-cards-container"></div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 16px; text-align: center;">
            Delivery charges are estimated. Final charges may vary after packaging. Our team will inform you in case of any changes.
          </div>
        </div>
      </div>
    </div>
  `;
}

function handleClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const value = btn.dataset.value;

  switch (action) {
    case 'format':
      if (getState().inputMode !== 'image') onInputChange('format', value);
      break;
    case 'delivery':
      onInputChange('deliveryMethod', value);
      break;
    case 'filter':
      onInputChange('courierFilter', value);
      break;
    case 'partner':
      onInputChange('selectedPartner', value);
      break;
    case 'remove-image': {
      const id = btn.dataset.id;
      const state = getState();
      const newImages = state.images.filter(img => img.id !== id);
      onImagesUpdated(newImages);
      break;
    }
    case 'add-conversion':
      addConversion();
      break;
    case 'remove-conversion':
      removeConversion(btn.dataset.id);
      break;
    case 'inc-qty':
      onInputChange('quantity', getState().quantity + 1);
      break;
    case 'dec-qty':
      onInputChange('quantity', Math.max(1, getState().quantity - 1));
      break;
    case 'inc-conv': {
      const conv = getState().conversions.find(c => c.id === btn.dataset.id);
      if (conv) updateConversion(conv.id, 'qty', conv.qty + 1);
      break;
    }
    case 'dec-conv': {
      const conv = getState().conversions.find(c => c.id === btn.dataset.id);
      if (conv && conv.qty > 1) updateConversion(conv.id, 'qty', conv.qty - 1);
      break;
    }
    case 'inc-img-qty': {
      const state = getState();
      const newImages = state.images.map(img => img.id === btn.dataset.id ? { ...img, quantity: (img.quantity || 1) + 1 } : img);
      onImagesUpdated(newImages);
      break;
    }
    case 'dec-img-qty': {
      const state = getState();
      const newImages = state.images.map(img => img.id === btn.dataset.id ? { ...img, quantity: Math.max(1, (img.quantity || 1) - 1) } : img);
      onImagesUpdated(newImages);
      break;
    }
  }
}

function handleInput(e) {
  const field = e.target.dataset.field;
  
  if (e.target.dataset.action === 'image-qty') {
    const id = e.target.dataset.id;
    const val = parseInt(e.target.value, 10);
    const qty = isNaN(val) || val < 1 ? 1 : val;
    const state = getState();
    const newImages = state.images.map(img => img.id === id ? { ...img, quantity: qty } : img);
    onImagesUpdated(newImages);
    return;
  }
  
  if (e.target.dataset.action === 'conversion-type') {
    updateConversion(e.target.dataset.id, 'type', e.target.value);
    return;
  }

  if (e.target.dataset.action === 'conversion-qty') {
    const val = parseInt(e.target.value, 10);
    updateConversion(e.target.dataset.id, 'qty', isNaN(val) || val < 1 ? 1 : val);
    return;
  }

  if (!field) return;

  if (field === 'quantity') {
    const val = parseInt(e.target.value, 10);
    onInputChange(field, isNaN(val) || val < 1 ? 1 : val);
  } else {
    onInputChange(field, e.target.value);
  }
}

function updateDOM(container, state) {
  // Update format buttons and disable if image mode
  container.querySelectorAll('#format-group .btn-select').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === state.format);
    btn.disabled = state.inputMode === 'image';
  });

  // Show/hide meters vs quantity fields based on format OR image mode
  const metersFields = container.querySelector('#meters-fields');
  const quantityField = container.querySelector('#quantity-field');
  if (metersFields) metersFields.style.display = (state.format === 'Meters' || state.inputMode === 'image') ? 'block' : 'none';
  if (quantityField) quantityField.style.display = (state.format !== 'Meters' && state.inputMode !== 'image') ? 'block' : 'none';

  // Update format badge
  const badgeName = container.querySelector('#format-badge-name');
  const badgeDims = container.querySelector('#format-badge-dims');
  if (badgeName && badgeDims) {
    if (state.format === 'A4') {
      badgeName.textContent = 'A4 Sheet';
      badgeDims.textContent = '(11" x 8")';
    } else if (state.format === 'A3') {
      badgeName.textContent = 'A3 Sheet';
      badgeDims.textContent = '(11" x 16")';
    } else if (state.format === 'A2') {
      badgeName.textContent = 'A2 Sheet';
      badgeDims.textContent = '(22.5" x 16.5")';
    }
  }

  // Update conversion UI
  const convContainer = container.querySelector('#conversions-container');
  if (convContainer) {
    if (!state.conversions || state.conversions.length === 0) {
      convContainer.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); font-style: italic;">No conversions added.</div>';
    } else {
      convContainer.innerHTML = state.conversions.map(c => `
        <div style="display: flex; gap: 12px; align-items: center; background: #f9fafb; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px;">
          <div style="flex: 1;">
            <select class="input-field" data-action="conversion-type" data-id="${c.id}">
              <option value="Puff" ${c.type === 'Puff' ? 'selected' : ''}>Puff</option>
              <option value="Embroidery" ${c.type === 'Embroidery' ? 'selected' : ''}>Embroidery</option>
              <option value="Leather" ${c.type === 'Leather' ? 'selected' : ''}>Leather</option>
            </select>
          </div>
          <div style="width: 100px;">
            <div class="number-input-group" style="height: 44px;">
              <button class="btn-spin" data-action="dec-conv" data-id="${c.id}" style="width: 32px;">-</button>
              <input type="number" class="input-field" min="1" value="${c.qty}" data-action="conversion-qty" data-id="${c.id}" style="padding: 0;" />
              <button class="btn-spin" data-action="inc-conv" data-id="${c.id}" style="width: 32px;">+</button>
            </div>
          </div>
          <button class="btn btn-icon" data-action="remove-conversion" data-id="${c.id}" style="width: 44px; height: 44px; min-height: 44px; padding: 0; display: flex; align-items: center; justify-content: center; color: #ef4444; border: 1px solid #fecaca; background: #fef2f2; border-radius: 8px; flex-shrink: 0;">✕</button>
        </div>
      `).join('');
    }
  }

  // Handle Length input overrides
  const lengthInput = container.querySelector('#input-length');
  if (lengthInput) {
    if (state.inputMode === 'image') {
      lengthInput.disabled = true;
      lengthInput.value = state.computedImageLength ? state.computedImageLength + '" (Auto)' : '';
      lengthInput.style.background = 'var(--bg-input)';
      lengthInput.style.borderColor = 'var(--border-color)';
      lengthInput.style.color = 'var(--text-muted)';
    } else {
      lengthInput.disabled = false;
      lengthInput.value = state.rawLength;
      lengthInput.style.background = '';
      lengthInput.style.color = '';
    }
  }

  // Update image preview container
  const previewContainer = container.querySelector('#image-preview-container');
  if (previewContainer) {
    if (state.images && state.images.length > 0) {
      previewContainer.innerHTML = state.images.map(img => `
        <div style="display: flex; align-items: center; gap: 12px; padding: 8px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-card);">
          <img src="${img.dataUrl}" style="width: 40px; height: 40px; object-fit: contain; border-radius: 4px; background: #000;" />
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${img.name}</div>
            <div style="font-size: 11px; color: ${img.isValid ? 'var(--text-muted)' : 'var(--accent-pink)'};">
              ${img.isValid ? `Detected: ${img.width}" × ${img.length}"` : `Invalid: ${img.error}`}
            </div>
            ${img.isValid ? `
            <div style="margin-top: 4px; display: flex; align-items: center; gap: 8px;">
              <label style="font-size: 11px; color: var(--text-muted);">Qty:</label>
              <div class="number-input-group" style="height: 28px;">
                <button class="btn-spin" data-action="dec-img-qty" data-id="${img.id}" style="width: 24px; font-size: 14px;">-</button>
                <input type="number" min="1" value="${img.quantity || 1}" data-action="image-qty" data-id="${img.id}" style="width: 40px; text-align: center; border: none; background: transparent; font-size: 11px; color: var(--text-primary);" />
                <button class="btn-spin" data-action="inc-img-qty" data-id="${img.id}" style="width: 24px; font-size: 14px;">+</button>
              </div>
            </div>
            ` : ''}
          </div>
          <button class="btn" style="padding: 4px 8px; font-size: 11px; background: transparent; border: 1px solid var(--border-color); color: var(--text-muted);" data-action="remove-image" data-id="${img.id}">Remove</button>
        </div>
      `).join('');
    } else {
      previewContainer.innerHTML = '';
    }
  }

  // Update delivery buttons
  container.querySelectorAll('#delivery-group .btn-select').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === state.deliveryMethod);
  });

  // Show/hide courier section
  const courierSection = container.querySelector('#courier-section');
  const deliveryMethodGroup = container.querySelector('#delivery-method-group');
  if (courierSection) courierSection.style.display = state.deliveryMethod === 'courier' ? 'block' : 'none';
  if (deliveryMethodGroup) deliveryMethodGroup.style.marginBottom = state.deliveryMethod === 'courier' ? 'var(--space-xl)' : '0';

  // Update filter chips
  container.querySelectorAll('#filter-group .chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.value === state.courierFilter);
  });

  // Length helper text
  const lengthHelper = container.querySelector('#length-helper');
  if (lengthHelper && lengthInput) {
    if ((state.format === 'Meters' || state.inputMode === 'image') && state.length > 0 && state.isValid) {
      lengthHelper.textContent = 'Total length: ' + state.length + '"';
      lengthHelper.style.display = 'block';
      if (state.inputMode !== 'image') lengthInput.style.borderColor = 'var(--accent-pink)';
    } else {
      lengthHelper.style.display = 'none';
      if (state.inputMode !== 'image') lengthInput.style.borderColor = '';
    }
  }

  // Validation error
  const errorEl = container.querySelector('#validation-error');
  if (errorEl) {
    if (!state.isValid && state.validationError) {
      errorEl.textContent = state.validationError;
      errorEl.style.display = 'block';
    } else {
      errorEl.style.display = 'none';
    }
  }

  // Render partner cards
  const cardsContainer = container.querySelector('#partner-cards-container');
  if (cardsContainer && state.deliveryMethod === 'courier') {
    renderPartnerCards(cardsContainer, state);
  }
}

function renderPartnerCards(container, state) {
  if (!state.allPartnerResults || state.allPartnerResults.length === 0) {
    container.innerHTML = '<p class="text-muted">Calculate dimensions first to see shipping options.</p>';
    return;
  }

  container.innerHTML = state.allPartnerResults.map(p => `
    <div class="partner-card ${state.selectedPartner === p.partnerKey ? 'selected' : ''}" data-action="partner" data-value="${p.partnerKey}" id="partner-${p.partnerKey}">
      <div class="partner-info">
        <div class="partner-title-row">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="partner-name">${p.partnerName}</span>
            ${p.partnerKey === state.recommendedPartner ? '<span class="badge-recommended">⭐ Recommended</span>' : ''}
          </div>
          <a href="${p.trackUrl}" target="_blank" rel="noopener" class="partner-track" onclick="event.stopPropagation()">Track ↗</a>
        </div>
        <div class="partner-meta-row">
          <span style="display: flex; align-items: center; gap: 4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            ${p.eta}
          </span>
          <span style="display: flex; align-items: center; gap: 4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            ${p.countedWeight} kg
          </span>
        </div>
      </div>
      <div class="partner-cost">₹${p.shippingCost}</div>
    </div>
  `).join('');
}
