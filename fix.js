const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.js') && f !== 'server.js' && f !== 'fix.js');
files.forEach(file => {
  let c = fs.readFileSync(file, 'utf8');
  c = c.replace(/require\('\.\.\/db'\)/g, "require('./index')");
  c = c.replace(/require\("\.\.\/db"\)/g, "require('./index')");
  c = c.replace(/require\('\.\.\/db\/index'\)/g, "require('./index')");
  c = c.replace(/require\('\.\.\/middleware\/auth'\)/g, "require('./auth')");
  c = c.replace(/require\("\.\.\/middleware\/auth"\)/g, "require('./auth')");
  c = c.replace(/require\('\.\.\/services\/gamification'\)/g, "require('./gamification')");
  c = c.replace(/require\('\.\.\/services\/scheduler'\)/g, "require('./scheduler')");
  c = c.replace(/require\('\.\.\/services\/notifications'\)/g, "require('./notifications')");
  c = c.replace(/require\('\.\.\/services\/email'\)/g, "require('./email')");
  fs.writeFileSync(file, c);
  console.log('Fixed: ' + file);
});
console.log('All done!');
