const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../../');
const testDir = path.join(rootDir, '__tests__');

function fixTests(dirPath) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      fixTests(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let original = content;
      // Fix dynamic imports
      content = content.replace(/import\(['"]\.\.\/\.\.\/app\//g, "import('@/app/");
      
      if (content !== original) {
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

fixTests(testDir);
console.log('Fixed tests');
