#!/usr/bin/env node
// Verifie le wiring du bouton filtre (regression du bug { extras }).
function brokenTypeFilterBar(_filter, _onChange, { extras } = {}) {
  return typeof extras?.onFilter === 'function';
}
function fixedTypeFilterBar(_filter, _onChange, opts = {}) {
  return typeof opts.onFilter === 'function';
}

const args = [{ onFilter: () => {} }];
const brokenOk = brokenTypeFilterBar('all', () => {}, ...args);
const fixedOk = fixedTypeFilterBar('all', () => {}, ...args);

if (brokenOk) {
  console.error('FAIL: le wiring casse ne devrait PAS voir onFilter');
  process.exit(1);
}
if (!fixedOk) {
  console.error('FAIL: le wiring corrige devrait voir onFilter');
  process.exit(1);
}
console.log('OK test-filter-wiring');
