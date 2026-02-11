// Basic smoke tests for export-utils without introducing a full test framework.

const assert = require('node:assert');
const { generateFilename, validateExportFormat } = require('../dist/lib/export-utils'); // Adjust path if build output differs

function run() {
  const symbol = 'AAPL';
  const jsonName = generateFilename(symbol, 'json');
  const xlsxName = generateFilename(symbol, 'xlsx');

  assert.ok(jsonName.endsWith('.json'), 'JSON filename must end with .json');
  assert.ok(xlsxName.endsWith('.xlsx'), 'XLSX filename must end with .xlsx');
  assert.ok(jsonName.includes(symbol), 'Filename should contain symbol');

  assert.ok(validateExportFormat('json'), 'json should be valid format');
  assert.ok(validateExportFormat('xlsx'), 'xlsx should be valid format');
  assert.ok(!validateExportFormat('pdf'), 'pdf should not be valid format in MVP');

  // eslint-disable-next-line no-console
  console.log('export-utils tests passed');
}

run();


