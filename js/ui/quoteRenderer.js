/**
 * Quote Renderer — "Client Quote Message" + gradient "Copy Message" button
 */

import { subscribe, getState } from '../state/store.js';

export function init(container) {
  container.innerHTML = buildHTML(getState());

  container.addEventListener('click', (e) => {
    if (e.target.closest('#btn-copy-quote')) {
      copyQuote(container);
    }
  });

  subscribe(state => updateDOM(container, state));
}

function buildHTML(state) {
  return `
    <div class="card quote-card">
      <div class="card-header quote-header">
        <h2 class="card-title" style="margin-bottom: 0;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f7a21b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="card-icon">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          Client Quote Message
        </h2>
        <div class="quote-actions">
          <button class="btn btn-primary" id="btn-copy-quote">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy Message
          </button>
        </div>
      </div>
      <div class="card-body">
        <textarea class="input-field quote-textarea" id="quote-textarea" rows="12">${state.quoteText || ''}</textarea>
        <div id="copy-feedback" style="display: none; color: var(--success); font-size: 13px; margin-top: 8px; text-align: right;">
          ✓ Copied to clipboard!
        </div>
      </div>
    </div>
  `;
}

function updateDOM(container, state) {
  const textarea = container.querySelector('#quote-textarea');
  if (textarea) textarea.value = state.quoteText;
}

function copyQuote(container) {
  const textarea = container.querySelector('#quote-textarea');
  if (!textarea) return;

  navigator.clipboard.writeText(textarea.value).then(() => {
    const btn = container.querySelector('#btn-copy-quote');
    if (btn) {
      const original = btn.innerHTML;
      btn.innerHTML = '✅ Copied!';
      btn.classList.add('btn-success');
      setTimeout(() => {
        btn.innerHTML = original;
        btn.classList.remove('btn-success');
      }, 2000);
    }
  }).catch(() => {
    textarea.select();
    document.execCommand('copy');
  });
}
