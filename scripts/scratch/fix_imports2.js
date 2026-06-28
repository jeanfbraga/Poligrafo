const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../../');
const srcDir = path.join(rootDir, 'src');
const nextDir = path.join(rootDir, '.next');

// 1. Delete .next folder
if (fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true });
}

// 2. Fix test file
const testFile = path.join(rootDir, '__tests__/unit/ui-links.test.tsx');
if (fs.existsSync(testFile)) {
  let content = fs.readFileSync(testFile, 'utf8');
  content = content.replace("from '../../src/components/MobileView'", "from '../../src/components/layout/MobileView'");
  fs.writeFileSync(testFile, content);
}

// 3. Fix core services relative imports
const integrations = [
  'anac', 'bndes', 'cmrj', 'data', 'denasus', 'dou', 'fnde', 
  'ibama', 'opensky', 'pncp', 'siconfi', 'spu', 'tcu', 'transferegov', 'tse'
];

function updateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Fix generic ../../../lib/services to @/services/core
  content = content.replace(/from\s+['"]\.\.\/\.\.\/\.\.\/lib\/services\/([^'"]+)['"]/g, "from '@/services/core/$1'");

  // Fix core services relative imports to integrations
  if (filePath.includes(path.join('src', 'services', 'core'))) {
    for (const intg of integrations) {
      const regex = new RegExp(`from\\s+['"]\\.\\./${intg}/([^'"]+)['"]`, 'g');
      content = content.replace(regex, `from '../integrations/${intg}/$1'`);
    }
    // Fix data/congresso-index
    content = content.replace(/from\s+['"]\.\.\/data\/congresso-index\.json['"]/g, "from '../integrations/data/congresso-index.json'");
    content = content.replace(/from\s+['"]\.\.\/supabase-admin['"]/g, "from '@/lib/supabase-admin'");
    content = content.replace(/from\s+['"]\.\.\/graph-analysis['"]/g, "from '@/lib/graph-analysis'");
  }

  // Fix API routes that might use ../../../../lib/...
  if (filePath.includes(path.join('src', 'app', 'api'))) {
    for (const intg of integrations) {
      const regex = new RegExp(`from\\s+['"](\\.\\.\\/)+lib/${intg}/([^'"]+)['"]`, 'g');
      content = content.replace(regex, `from '@/services/integrations/${intg}/$2'`);
    }
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content);
  }
}

function processDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      updateFile(fullPath);
    }
  }
}

processDirectory(srcDir);
console.log('Fixed remaining imports');
