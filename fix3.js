const files = ['auth.js','users.js','content.js','flashcards.js','ai.js','exams.js','analytics.js','gamification.js','social.js','tutors.js','upload.js','admin.js'];
files.forEach(file => {
  try {
    const m = require('./' + file);
    if (typeof m !== 'function') {
      console.log('BAD: ' + file + ' exports: ' + typeof m);
    } else {
      console.log('OK: ' + file);
    }
  } catch(e) {
    console.log('ERROR: ' + file + ' - ' + e.message);
  }
});