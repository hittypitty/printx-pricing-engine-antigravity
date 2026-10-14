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
    const tab = e.target.closest('[data-qtab]');
    if (tab) setTab(container, tab.dataset.qtab);
    if (e.target.closest('#btn-wa-quote')) {
      const t = container.querySelector('#quote-textarea');
      window.open('https://wa.me/?text=' + encodeURIComponent(t ? t.value : ''), '_blank', 'noopener');
    }
  });
  container.addEventListener('input', (e) => {
    if (e.target.id === 'quote-textarea') renderPreview(container);
  });
  renderPreview(container);

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
        <div class="quote-tabs" role="tablist">
          <button type="button" class="quote-tab active" data-qtab="preview" role="tab">Preview</button>
          <button type="button" class="quote-tab" data-qtab="edit" role="tab">Edit text</button>
          <span class="quote-count" id="quote-count"></span>
        </div>
        <div class="quote-chat" id="quote-preview"><div class="quote-bubble" id="quote-bubble"></div></div>
        <textarea class="input-field quote-textarea" id="quote-textarea" rows="12" hidden>${state.quoteText || ''}</textarea>
        <button type="button" class="quote-wa" id="btn-wa-quote">Send on WhatsApp</button>
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
  renderPreview(container);
}

function setTab(container, which) {
  container.querySelectorAll('[data-qtab]').forEach(b => b.classList.toggle('active', b.dataset.qtab === which));
  const ta = container.querySelector('#quote-textarea');
  const pv = container.querySelector('#quote-preview');
  ta.hidden = which !== 'edit';
  pv.hidden = which === 'edit';
  if (which === 'edit') ta.focus();
}

const escHtml = t => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function renderPreview(container) {
  const ta = container.querySelector('#quote-textarea');
  const bubble = container.querySelector('#quote-bubble');
  if (!ta || !bubble) return;
  const html = escHtml(ta.value)
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/(^|\s)_([^_\n]+)_/g, '$1<i>$2</i>')
    .replace(/\n/g, '<br>');
  bubble.innerHTML = html + '<span class="quote-meta">now <svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke="#53bdeb" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 6 4 9 10 2"/><polyline points="6 6.5 8.5 9 15 2"/></svg></span>';
  const n = container.querySelector('#quote-count');
  if (n) n.textContent = ta.value.length + ' characters';
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
