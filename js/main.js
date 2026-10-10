/**
 * Main — Bootstrap entry point
 * Imports all UI modules, wires them to containers, triggers initial calculation.
 */

import { init as initHeader } from './ui/header.js';
import { init as initInput } from './ui/inputRenderer.js';
import { init as initDropship } from './ui/dropshipPanel.js';
import { init as initOutput } from './ui/outputRenderer.js';
import { init as initQuote } from './ui/quoteRenderer.js';
import { recalculate } from './controller/appController.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize UI modules with their container elements
  initHeader(document.getElementById('app-header'));
  initInput(document.getElementById('app-inputs'));
  initDropship(document.getElementById('dropship-mount'));
  initOutput(document.getElementById('app-outputs'));
  initQuote(document.getElementById('app-quote'));

  // Run initial calculation with default state
  recalculate();
});
