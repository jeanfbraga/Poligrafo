const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../../src');

const integrations = [
  'anac', 'bndes', 'cmrj', 'data', 'denasus', 'dou', 'fnde', 
  'ibama', 'opensky', 'pncp', 'siconfi', 'spu', 'tcu', 'transferegov', 'tse'
];

function updateImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Replace any relative import to lib/services/... with @/services/core/...
  content = content.replace(/from\s+['"](\.\.\/)+lib\/services\/([^'"]+)['"]/g, "from '@/services/core/$2'");
  content = content.replace(/from\s+['"](\.\.\/)+src\/lib\/services\/([^'"]+)['"]/g, "from '@/services/core/$2'");
  
  // Replace relative imports to lib/integrations/... with @/services/integrations/...
  for (const intg of integrations) {
    const regex = new RegExp(`from\\s+['"](\\.\\.\\/)+lib/${intg}/([^'"]+)['"]`, 'g');
    content = content.replace(regex, `from '@/services/integrations/${intg}/$2'`);
    
    const regexSrc = new RegExp(`from\\s+['"](\\.\\.\\/)+src/lib/${intg}/([^'"]+)['"]`, 'g');
    content = content.replace(regexSrc, `from '@/services/integrations/${intg}/$2'`);
  }

  // Replace relative imports to supabase-admin with @/lib/supabase-admin
  content = content.replace(/from\s+['"](\.\.\/)+supabase-admin['"]/g, "from '@/lib/supabase-admin'");
  content = content.replace(/from\s+['"]\.\.\/supabase-admin['"]/g, "from '@/lib/supabase-admin'");

  // Replace relative imports to graph-analysis with @/lib/graph-analysis
  content = content.replace(/from\s+['"](\.\.\/)+graph-analysis['"]/g, "from '@/lib/graph-analysis'");

  // Replace relative imports to data/congresso-index.json
  content = content.replace(/from\s+['"](\.\.\/)+data\/congresso-index\.json['"]/g, "from '@/services/integrations/data/congresso-index.json'");

  if (content !== original) {
    fs.writeFileSync(filePath, content);
  }
}

function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      updateImports(fullPath);
    }
  }
}

processDirectory(srcDir);
console.log('Imports fixed in src');
