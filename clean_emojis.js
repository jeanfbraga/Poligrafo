const fs = require('fs');
let c = fs.readFileSync('app/page.tsx', 'utf8');
c = c.replace(/⚠️ï¸ /g, '');
c = c.replace(/⚠️/g, '');
c = c.replace(/✓/g, '');
c = c.replace(/🚨/g, '');
// clear double spaces that might be left
c = c.replace(/  /g, ' ');
fs.writeFileSync('app/page.tsx', c, 'utf8');
