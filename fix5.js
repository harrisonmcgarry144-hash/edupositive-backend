const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.js') && !f.startsWith('fix') && f !== 'server.js');
files.forEach(file => {
  let c = fs.readFileSync(file, 'utf8');
  c = c.replace(/require\(['"]\.\/auth['"]\)/g, "require('./authmiddleware')");
  fs.writeFileSync(file, c);
  console.log('Fixed: ' + file);
});
console.log('Done!');