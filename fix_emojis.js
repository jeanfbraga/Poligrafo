const fs = require('fs');
let c = fs.readFileSync('app/page.tsx', 'utf8');
const map = {
    'âš ï¸ ': '⚠️',
    'âœ“': '✓',
    'âš ': '⚠️',
    'â”€': '─',
    'â€¢': '•'
};
for (const k in map) {
    c = c.split(k).join(map[k]);
}
fs.writeFileSync('app/page.tsx', c, 'utf8');
