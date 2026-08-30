/**
 * Input Renderer — Format selector, dimensions, quantity, delivery method
 * Renders controls and binds events to controller.
 */

import { subscribe, getState } from '../state/store.js';
import { onInputChange, onImagesUpdated, addConversion, updateConversion, removeConversion, setDesignTab, addManualSize, updateManualSize, removeManualSize, overrideImageWidth, setPrintTechnology, setUvPrintType, addToCart, removeFromCart, clearCart } from '../controller/appController.js';
import { processImage } from '../modules/imageProcessor.js';
import { parseLength } from '../modules/formatParser.js';

export function init(container) {
  // Render initial structure
  container.innerHTML = buildHTML(getState());

  // Bind events via delegation
  container.addEventListener('click', handleClick);
  container.addEventListener('input', handleInput);
  
  container.addEventListener('change', async (e) => {
    if (e.target.dataset.action === 'override-width') {
      const val = parseFloat(e.target.value);
      overrideImageWidth(e.target.dataset.id, val);
      return;
    }

    if (e.target.dataset.action === 'manual-size-dim') {
      const val = e.target.value.toLowerCase().trim();
      let num = parseFloat(val);
      
      if (!isNaN(num)) {
        if (val.endsWith('mm')) {
          num = num / 25.4;
        } else if (val.endsWith('cm')) {
          num = num / 2.54;
        } else if (val.endsWith('m')) {
          num = num * 39.37;
        }
        
        // Round to 2 decimal places for neatness
        num = Number(num.toFixed(2));
      } else {
        num = ''; // Reset if invalid
      }
      
      const fieldType = e.target.dataset.fieldtype;
      updateManualSize(e.target.dataset.id, fieldType, num);
      return;
    }

    if (e.target.dataset.action === 'image-qty') {
      const id = e.target.dataset.id;
      const val = parseInt(e.target.value, 10);
      const qty = isNaN(val) || val < 1 ? 1 : val;
      const state = getState();
      const newImages = state.images.map(img => img.id === id ? { ...img, quantity: qty } : img);
      onImagesUpdated(newImages);
      return;
    }

    if (e.target.dataset.action === 'manual-size-qty') {
      const val = parseInt(e.target.value, 10);
      updateManualSize(e.target.dataset.id, 'qty', isNaN(val) || val < 1 ? 1 : val);
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

    if (e.target.dataset.field === 'quantity') {
      const val = parseInt(e.target.value, 10);
      onInputChange('quantity', isNaN(val) || val < 1 ? 1 : val);
      return;
    }

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
  const isImageTab = state.designTab === 'image';
  const tech = state.printTechnology;
  const isUV = tech === 'uv_dtf';
  const isSublimation = tech === 'sublimation';
  const isFabric = tech === 'fabric';

  let formatList = ['A4', 'A3', 'A2', 'Meters'];
  if (isUV) formatList = ['A4', 'A3', 'Custom'];
  if (isSublimation) formatList = ['A4', 'A3', 'Roll'];

  return `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
          Print Technology
        </h2>
      </div>
      <div class="card-body">
        <div class="btn-group" style="margin-bottom: ${isUV ? 'var(--space-md)' : '0'};">
          <button class="btn btn-select ${isFabric ? 'active' : ''}" data-action="set-tech" data-value="fabric" id="tech-fabric">👕 Fabric DTF</button>
          <button class="btn btn-select ${isUV ? 'active' : ''}" data-action="set-tech" data-value="uv_dtf" id="tech-uv">✨ UV DTF</button>
          <button class="btn btn-select ${isSublimation ? 'active' : ''}" data-action="set-tech" data-value="sublimation" id="tech-sublimation">🔥 Sublimation</button>
        </div>
        
        <div id="uv-options-container" style="display: ${isUV ? 'block' : 'none'}; margin-top: 12px;">
          <label class="field-label">UV PRINT TYPE</label>
          <div class="btn-group" style="margin-bottom: 0;">
            <button class="btn btn-select ${state.uvPrintType === 'normal' ? 'active' : ''}" data-action="set-uv-type" data-value="normal" id="uv-type-normal">Normal</button>
            <button class="btn btn-select ${state.uvPrintType === '3d' ? 'active' : ''}" data-action="set-uv-type" data-value="3d" id="uv-type-3d">3D</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          Design Input
        </h2>
      </div>
      <div class="card-body">
        <div class="btn-group" style="margin-bottom: var(--space-lg);">
          <button class="btn btn-select ${isImageTab ? 'active' : ''}" data-action="set-design-tab" data-value="image" id="tab-image">🖼 Upload Images</button>
          <button class="btn btn-select ${!isImageTab ? 'active' : ''}" data-action="set-design-tab" data-value="manual-size" id="tab-manual">📐 Manual Size Entry</button>
        </div>

        <div id="image-mode-container" style="display: ${isImageTab ? 'block' : 'none'};">
          <label class="btn btn-outline" style="width: 100%; display: flex; justify-content: center; margin-bottom: var(--space-md); cursor: pointer;">
            📁 Select PNG Images
            <input type="file" id="image-upload-input" accept="image/png" multiple hidden />
          </label>
          <div id="image-preview-container" style="display: flex; flex-direction: column; gap: 8px;"></div>
        </div>

        <div id="manual-size-container" style="display: ${!isImageTab ? 'block' : 'none'};">
          <div id="manual-sizes-list" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;"></div>
          <button class="btn-add-conversion" data-action="add-manual-size" style="width: 100%; text-align: center; justify-content: center;">+ Add Size</button>
        </div>
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
            ${formatList.map(f => `
              <button class="btn btn-select ${state.format === f ? 'active' : ''}" data-action="format" data-value="${f}" id="btn-format-${f.toLowerCase()}" ${state.inputMode === 'image' || state.inputMode === 'manual-size' ? 'disabled' : ''}>${f}</button>
            `).join('')}
          </div>
        </div>
        
        <div style="height: 1px; background: var(--border-color); margin: var(--space-xl) 0;"></div>

        <div class="field-group" id="meters-fields" style="display: ${state.format === 'Meters' || state.format === 'Custom' || state.format === 'Roll' || state.inputMode === 'image' || state.inputMode === 'manual-size' ? 'block' : 'none'}; margin-bottom: ${(state.format === 'Custom' || state.format === 'Roll') && state.inputMode !== 'image' && state.inputMode !== 'manual-size' ? 'var(--space-xl)' : '0'};">
          <div class="input-row">
            <div class="input-col">
              <label class="field-label">WIDTH (INCHES)</label>
              <input type="text" class="input-field input-fixed" value="${isUV ? '11 (Fixed)' : '24 (Fixed)'}" disabled id="input-width" />
            </div>
            <div class="input-col">
              <label class="field-label">LENGTH (INCHES)</label>
              <input type="text" class="input-field" placeholder="e.g. 1m, 20+19 or 39x3" data-field="rawLength" value="${(state.inputMode === 'image' || state.inputMode === 'manual-size') && state.computedImageLength ? state.computedImageLength + '" (Auto)' : state.rawLength}" id="input-length" ${state.inputMode === 'image' || state.inputMode === 'manual-size' ? 'disabled style="background: var(--bg-input); border-color: var(--border-color); color: var(--text-muted);"' : ''} />
              <div id="length-helper" style="font-size: 13px; color: var(--accent-pink); margin-top: 6px; font-weight: 500; display: none;"></div>
            </div>
          </div>
        </div>

        <div class="field-group" id="quantity-field" style="display: ${state.format !== 'Meters' && state.format !== 'Roll' && state.inputMode !== 'image' && state.inputMode !== 'manual-size' ? 'block' : 'none'}; margin-bottom: 0;">
          <div class="input-row">
            <div class="input-col">
              <label class="field-label">SELECTED FORMAT</label>
              <div id="format-badge" class="format-badge">
                <span id="format-badge-name" class="format-badge-name">A4 Sheet</span>
                <span id="format-badge-dims" class="format-badge-dims">(11" x 8")</span>
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

        <div id="conversions-divider" style="height: 1px; background: var(--border-color); margin: var(--space-xl) 0; display: ${isFabric ? 'block' : 'none'};"></div>

        <div class="field-group" id="conversions-section" style="margin-bottom: 0; display: ${isFabric ? 'block' : 'none'};">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <label class="field-label" style="margin-bottom: 0;">CONVERSIONS</label>
            <button class="btn-add-conversion" data-action="add-conversion">+ Add Conversion</button>
          </div>
          <div id="conversions-container" style="display: flex; flex-direction: column; gap: 12px;"></div>
        </div>

        <div class="validation-error" id="validation-error" style="display: none"></div>
        
        <button class="btn btn-primary" id="btn-add-to-cart" data-action="add-to-cart" style="width: 100%; margin-top: var(--space-xl); font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Add to Quote
        </button>
      </div>
    </div>

    <div class="card" id="cart-card" style="display: ${state.cart && state.cart.length > 0 ? 'block' : 'none'};">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h2 class="card-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon">
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          Quote Items
        </h2>
        <button class="btn-clear-cart" data-action="clear-cart" style="background: none; border: none; color: #ef4444; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 4px; font-weight: 500; padding: 4px 8px; border-radius: 4px;">
          ✕ Clear All
        </button>
      </div>
      <div class="card-body" style="padding-top: 0;">
        <div id="cart-items-list" style="display: flex; flex-direction: column; gap: 12px; margin-top: 12px;"></div>
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
    case 'set-tech':
      setPrintTechnology(value);
      break;
    case 'set-uv-type':
      setUvPrintType(value);
      break;
    case 'set-design-tab':
      setDesignTab(value);
      break;
    case 'format':
      if (getState().inputMode !== 'image' && getState().inputMode !== 'manual-size') onInputChange('format', value);
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
    case 'add-manual-size':
      addManualSize();
      break;
    case 'remove-manual-size':
      removeManualSize(btn.dataset.id);
      break;
    case 'override-width-clear':
      overrideImageWidth(btn.dataset.id, null);
      break;
    case 'inc-manual-qty': {
      const ms = getState().manualSizes.find(c => c.id === btn.dataset.id);
      if (ms) updateManualSize(ms.id, 'qty', ms.qty + 1);
      break;
    }
    case 'dec-manual-qty': {
      const ms = getState().manualSizes.find(c => c.id === btn.dataset.id);
      if (ms && ms.qty > 1) updateManualSize(ms.id, 'qty', ms.qty - 1);
      break;
    }
    case 'add-to-cart':
      addToCart();
      break;
    case 'clear-cart':
      clearCart();
      break;
    case 'remove-cart-item':
      removeFromCart(btn.dataset.id);
      break;
  }
}

function handleInput(e) {
  const field = e.target.dataset.field;
  
  if (e.target.dataset.action === 'image-qty') {
    return; // Handled on 'change' event to prevent cursor jumping
  }
  
  if (e.target.dataset.action === 'manual-size-qty') {
    return; // Handled on 'change' event to prevent cursor jumping
  }
  
  if (e.target.dataset.action === 'conversion-type') {
    return; // Handled on 'change' event to prevent cursor jumping
  }

  if (e.target.dataset.action === 'conversion-qty') {
    return; // Handled on 'change' event to prevent cursor jumping
  }

  if (!field) return;

  if (field === 'quantity') {
    return; // Handled on 'change' event to prevent cursor jumping
  }

  onInputChange(field, e.target.value);
}

function updateDOM(container, state) {
  // Save focus and selection info to prevent focus loss during DOM rebuilds
  const activeElement = document.activeElement;
  let focusSelector = null;
  let cursorStart = null;
  let cursorEnd = null;

  if (activeElement && container.contains(activeElement)) {
    if (activeElement.id) {
      focusSelector = `#${activeElement.id}`;
    } else {
      const action = activeElement.dataset.action;
      const id = activeElement.dataset.id;
      const fieldType = activeElement.dataset.fieldtype;
      const field = activeElement.dataset.field;
      
      if (action && id) {
        if (fieldType) {
          focusSelector = `[data-action="${action}"][data-id="${id}"][data-fieldtype="${fieldType}"]`;
        } else {
          focusSelector = `[data-action="${action}"][data-id="${id}"]`;
        }
      } else if (action) {
        focusSelector = `[data-action="${action}"]`;
      } else if (field) {
        focusSelector = `[data-field="${field}"]`;
      }
    }
    
    if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
      const isNumberInput = activeElement.tagName === 'INPUT' && activeElement.type === 'number';
      if (isNumberInput) {
        try {
          activeElement.type = 'text';
        } catch (e) {}
      }
      try {
        cursorStart = activeElement.selectionStart;
        cursorEnd = activeElement.selectionEnd;
      } catch (e) {
        // ignore
      }
      if (isNumberInput) {
        try {
          activeElement.type = 'number';
        } catch (e) {}
      }
    }
  }

  const tech = state.printTechnology;
  const isUV = tech === 'uv_dtf';
  const isSublimation = tech === 'sublimation';
  const isFabric = tech === 'fabric';

  // Update technology buttons
  container.querySelectorAll('#tech-fabric').forEach(btn => btn.classList.toggle('active', isFabric));
  container.querySelectorAll('#tech-uv').forEach(btn => btn.classList.toggle('active', isUV));
  container.querySelectorAll('#tech-sublimation').forEach(btn => btn.classList.toggle('active', isSublimation));
  
  const uvOptions = container.querySelector('#uv-options-container');
  if (uvOptions) uvOptions.style.display = isUV ? 'block' : 'none';
  
  container.querySelectorAll('#uv-type-normal').forEach(btn => btn.classList.toggle('active', state.uvPrintType === 'normal'));
  container.querySelectorAll('#uv-type-3d').forEach(btn => btn.classList.toggle('active', state.uvPrintType === '3d'));

  // Update Design Tabs
  container.querySelectorAll('#tab-image').forEach(btn => btn.classList.toggle('active', state.designTab === 'image'));
  container.querySelectorAll('#tab-manual').forEach(btn => btn.classList.toggle('active', state.designTab === 'manual-size'));
  
  const imgModeContainer = container.querySelector('#image-mode-container');
  const manualModeContainer = container.querySelector('#manual-size-container');
  if (imgModeContainer) imgModeContainer.style.display = state.designTab === 'image' ? 'block' : 'none';
  if (manualModeContainer) manualModeContainer.style.display = state.designTab === 'manual-size' ? 'block' : 'none';

  // Re-render and update format buttons
  const formatGroup = container.querySelector('#format-group');
  if (formatGroup) {
    let list = ['A4', 'A3', 'A2', 'Meters'];
    if (isUV) list = ['A4', 'A3', 'Custom'];
    if (isSublimation) list = ['A4', 'A3', 'Roll'];

    formatGroup.innerHTML = list.map(f => `
      <button class="btn btn-select ${state.format === f ? 'active' : ''}" data-action="format" data-value="${f}" id="btn-format-${f.toLowerCase()}" ${state.inputMode === 'image' || state.inputMode === 'manual-size' ? 'disabled' : ''}>${f}</button>
    `).join('');
  }

  // Show/hide meters vs quantity fields based on format OR image/manual mode
  const metersFields = container.querySelector('#meters-fields');
  const quantityField = container.querySelector('#quantity-field');
  const showMeters = (state.format === 'Meters' || state.format === 'Custom' || state.format === 'Roll' || state.inputMode === 'image' || state.inputMode === 'manual-size');
  const showQuantity = (state.format !== 'Meters' && state.format !== 'Roll' && state.inputMode !== 'image' && state.inputMode !== 'manual-size');
  if (metersFields) {
    metersFields.style.display = showMeters ? 'block' : 'none';
    metersFields.style.marginBottom = ((state.format === 'Custom' || state.format === 'Roll') && state.inputMode !== 'image' && state.inputMode !== 'manual-size') ? 'var(--space-xl)' : '0';
  }
  if (quantityField) quantityField.style.display = showQuantity ? 'block' : 'none';

  // Show/hide conversions section based on printTechnology
  const conversionsDivider = container.querySelector('#conversions-divider');
  const conversionsSection = container.querySelector('#conversions-section');
  if (conversionsDivider) conversionsDivider.style.display = isFabric ? 'block' : 'none';
  if (conversionsSection) conversionsSection.style.display = isFabric ? 'block' : 'none';

  // Update input-width dynamic text
  const inputWidth = container.querySelector('#input-width');
  if (inputWidth) {
    inputWidth.value = isUV ? '11 (Fixed)' : '24 (Fixed)';
  }

  // Update quantity field values and spinner disable state
  const inputQuantity = container.querySelector('#input-quantity');
  if (inputQuantity) {
    inputQuantity.value = state.quantity;
    const isAutoPacking = state.inputMode === 'image' || state.inputMode === 'manual-size';
    inputQuantity.disabled = isAutoPacking;
    inputQuantity.style.background = isAutoPacking ? 'var(--bg-input)' : '';
    inputQuantity.style.borderColor = isAutoPacking ? 'var(--border-color)' : '';
    inputQuantity.style.color = isAutoPacking ? 'var(--text-muted)' : '';
    
    container.querySelectorAll('#quantity-field .number-input-group button').forEach(btn => {
      btn.disabled = isAutoPacking;
    });
  }

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
    } else if (state.format === 'Roll') {
      badgeName.textContent = 'Sublimation Roll';
      const parsedLen = parseLength(state.rawLength);
      badgeDims.textContent = parsedLen > 0 ? `(24" x ${parsedLen}")` : '(24" x ?")';
    } else if (state.format === 'Custom') {
      badgeName.textContent = 'Custom Sheet';
      const parsedLen = parseLength(state.rawLength);
      badgeDims.textContent = parsedLen > 0 ? `(11" x ${parsedLen}")` : '(11" x ?")';
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
    if (state.inputMode === 'image' || state.inputMode === 'manual-size') {
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

  // Update manual sizes list
  const manualList = container.querySelector('#manual-sizes-list');
  if (manualList) {
    if (!state.manualSizes || state.manualSizes.length === 0) {
      manualList.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); font-style: italic; text-align: center; padding: 12px 0;">No sizes added.</div>';
    } else {
      manualList.innerHTML = state.manualSizes.map(m => `
        <div class="manual-size-item">
          <div class="size-inputs-group">
            <input type="text" class="input-field" placeholder="W" value="${m.width}" data-action="manual-size-dim" data-fieldtype="width" data-id="${m.id}" style="width: 60px; padding: 6px;" />
            <span class="multiplier">×</span>
            <input type="text" class="input-field" placeholder="H" value="${m.height}" data-action="manual-size-dim" data-fieldtype="height" data-id="${m.id}" style="width: 60px; padding: 6px;" />
            <span class="unit">in</span>
          </div>
          
          <div class="spacer"></div>
          
          <div class="quantity-group">
            <div class="number-input-group" style="height: 36px; min-width: 90px;">
              <button class="btn-spin" data-action="dec-manual-qty" data-id="${m.id}" style="width: 28px;">-</button>
              <input type="number" class="input-field" min="1" value="${m.qty}" data-action="manual-size-qty" data-id="${m.id}" style="padding: 0; font-size: 13px;" />
              <button class="btn-spin" data-action="inc-manual-qty" data-id="${m.id}" style="width: 28px;">+</button>
            </div>
          </div>
          
          <div class="delete-group">
            <button class="btn btn-icon remove-btn" data-action="remove-manual-size" data-id="${m.id}">✕</button>
          </div>
        </div>
      `).join('');
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
            <div style="font-size: 11px; color: ${img.isValid && !img.hasWarning ? 'var(--text-muted)' : 'var(--accent-pink)'};">
              ${img.isValid && !img.hasWarning && !img.isOverridden ? `Detected: ${img.width}" × ${img.length}"` : ''}
              ${!img.isValid ? `Invalid: ${img.error}` : ''}
            </div>
            
            ${img.dpiConfidence ? `
              <div style="font-size: 10px; color: ${img.dpiConfidence === 'high' ? '#10b981' : '#f59e0b'}; margin-top: 2px; font-weight: 500;">
                DPI: ${img.dpi} (${img.dpiConfidence === 'high' ? 'High' : 'Low'} confidence)
              </div>
            ` : ''}
            
            ${img.hasWarning ? `
              <div style="margin-top: 4px; padding: 6px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; font-size: 11px; color: #b45309;">
                ${img.warning}
                <div style="margin-top: 6px; display: flex; align-items: center; gap: 8px;">
                  <label style="font-weight: 500;">Actual Width:</label>
                  <input type="number" step="0.1" data-action="override-width" data-id="${img.id}" style="width: 70px; padding: 4px; border: 1px solid #fcd34d; border-radius: 4px;" placeholder="inches" />
                </div>
              </div>
            ` : ''}

            ${img.isOverridden ? `
              <div style="margin-top: 4px; font-size: 11px; color: #10b981; font-weight: 500;">
                Overridden Size: ${img.width}" × ${img.length}"
                <button class="btn btn-icon" data-action="override-width-clear" data-id="${img.id}" style="padding: 0; margin-left: 4px; font-size: 10px; color: #ef4444; background: none; border: none; text-decoration: underline; display: inline; width: auto; min-height: 0; height: auto;">Reset</button>
              </div>
            ` : ''}

            ${img.isValid && (!img.hasWarning || img.isOverridden) ? `
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
    if ((state.format === 'Meters' || state.format === 'Custom' || state.inputMode === 'image' || state.inputMode === 'manual-size') && state.length > 0 && state.isValid) {
      if (state.format === 'Custom' && state.length < 8) {
        lengthHelper.textContent = `Total length: ${state.length}" (Minimum billing length is 8" / 1 A4 sheet)`;
      } else {
        lengthHelper.textContent = 'Total length: ' + state.length + '"';
      }
      lengthHelper.style.display = 'block';
      if (state.inputMode !== 'image' && state.inputMode !== 'manual-size') lengthInput.style.borderColor = 'var(--accent-pink)';
    } else {
      lengthHelper.style.display = 'none';
      if (state.inputMode !== 'image' && state.inputMode !== 'manual-size') lengthInput.style.borderColor = '';
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

  // Update Cart Card and Cart List DOM elements
  const btnAddToCart = container.querySelector('#btn-add-to-cart');
  if (btnAddToCart) {
    btnAddToCart.disabled = !state.isValid;
  }

  const cartCard = container.querySelector('#cart-card');
  if (cartCard) {
    const hasItems = state.cart && state.cart.length > 0;
    cartCard.style.display = hasItems ? 'block' : 'none';
  }

  const cartList = container.querySelector('#cart-items-list');
  if (cartList && state.cart) {
    cartList.innerHTML = state.cart.map(item => {
      let itemTech = 'Fabric DTF';
      if (item.printTechnology === 'uv_dtf') {
        itemTech = `UV DTF (${item.uvPrintType === '3d' ? '3D' : 'Normal'})`;
      } else if (item.printTechnology === 'sublimation') {
        itemTech = 'Sublimation';
      }

      const formatLabel = (item.format === 'Meters' || item.format === 'Roll')
        ? `${item.format === 'Roll' ? 'Roll' : 'Meters'} (24" x ${item.length}")`
        : `${item.format} (${item.pricingWidth}" x ${item.length}")`;

      const qtyText = item.isSheetFormat
        ? `${item.quantity} pcs`
        : `${item.totalMeters.toFixed(2)}m`;

      const conversionText = item.conversions && item.conversions.length > 0
        ? `<span>•</span><span>Conversions: ${item.conversionBreakdown}</span>`
        : '';

      return `
        <div class="cart-item">
          <div class="cart-item-details">
            <div class="cart-item-title">${itemTech} — ${formatLabel}</div>
            <div class="cart-item-sub">
              <span>Qty/Length: ${qtyText}</span>
              <span>•</span>
              <span>Price: ₹${Math.ceil(item.printCost)}</span>
              ${conversionText}
            </div>
          </div>
          <button class="btn btn-icon" data-action="remove-cart-item" data-id="${item.id}" style="width: 36px; height: 36px; min-height: 36px; padding: 0; display: flex; align-items: center; justify-content: center; color: #ef4444; border: 1px solid #fecaca; background: #fef2f2; border-radius: 8px; flex-shrink: 0; cursor: pointer; transition: all var(--transition-fast);">✕</button>
        </div>
      `;
    }).join('');
  }

  // Restore focus and cursor selection
  if (focusSelector) {
    const elementToFocus = container.querySelector(focusSelector);
    if (elementToFocus) {
      const isNumberInput = elementToFocus.tagName === 'INPUT' && elementToFocus.type === 'number';
      if (isNumberInput) {
        try {
          elementToFocus.type = 'text';
        } catch (e) {}
      }

      elementToFocus.focus();

      if (cursorStart !== null && cursorEnd !== null) {
        try {
          elementToFocus.setSelectionRange(cursorStart, cursorEnd);
        } catch (e) {
          // ignore
        }
      } else {
        try {
          const len = elementToFocus.value.length;
          elementToFocus.setSelectionRange(len, len);
        } catch (e) {}
      }

      if (isNumberInput) {
        try {
          elementToFocus.type = 'number';
        } catch (e) {}
      }
    }
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
        </div>
      </div>
      <div class="partner-cost">₹${p.shippingCost}</div>
    </div>
  `).join('');
}
