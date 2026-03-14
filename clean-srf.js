const fs = require('fs');

const file = 'srf.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const before = data.result.results.length;

data.result.results = data.result.results.filter(e =>
  e.topic === 'Film' || e.topic === 'Schweizer Film'
);

const after = data.result.results.length;
fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
console.log(`${file}: ${before} → ${after} entries (removed ${before - after})`);
