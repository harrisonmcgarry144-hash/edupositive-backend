const fs = require('fs');
const files = ['analytics.js', 'gamification.js', 'social.js', 'exams.js'];
files.forEach(file => {
  let c = fs.readFileSync(file, 'utf8');
  c = c.replace(/module\.exports = \{ analyticsRouter \};/, 'module.exports = router;');
  c = c.replace(/module\.exports = \{ gamificationRouter \};/, 'module.exports = router;');
  c = c.replace(/module\.exports = \{ socialRouter \};/, 'module.exports = router;');
  c = c.replace(/module\.exports = \{ examsRouter \};/, 'module.exports = router;');
  fs.writeFileSync(file, c);
  console.log('Fixed: ' + file);
});
console.log('Done!');