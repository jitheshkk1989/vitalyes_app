/**
 * Reset transactional data (keeps sample patients & config)
 */
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

['invoices.json', 'payments.json', 'tokens.json', 'funnel-events.json'].forEach(file => {
  fs.writeFileSync(path.join(dataDir, file), '[]\n');
  console.log(`Reset ${file}`);
});

console.log('Transactional data reset. Sample patients retained.');
