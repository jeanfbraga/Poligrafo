const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../../');
const srcDir = path.join(rootDir, 'src');

const filesToMoveToSrc = ['app', 'components', 'hooks', 'types', 'lib'];

// 1. Create src directory
if (!fs.existsSync(srcDir)) {
  fs.mkdirSync(srcDir);
}

// 2. Move root folders to src
for (const item of filesToMoveToSrc) {
  const oldPath = path.join(rootDir, item);
  const newPath = path.join(srcDir, item);
  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath);
  }
}

// 3. Create components subdirectories and move components
const componentsDir = path.join(srcDir, 'components');
const dirsToCreate = ['analytics', 'layout', 'search', 'shared'];
for (const dir of dirsToCreate) {
  const dirPath = path.join(componentsDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
  }
}

const componentMoves = [
  ['Clarity.tsx', 'analytics/Clarity.tsx'],
  ['GoogleAnalytics.tsx', 'analytics/GoogleAnalytics.tsx'],
  ['HomeDashboard.tsx', 'dashboard/HomeDashboard.tsx'],
  ['MobileView.tsx', 'layout/MobileView.tsx'],
  ['MobileGate.tsx', 'layout/MobileGate.tsx'],
  ['SearchBar.tsx', 'search/SearchBar.tsx'],
  ['ShareDialog.tsx', 'shared/ShareDialog.tsx']
];

for (const [oldName, newName] of componentMoves) {
  const oldPath = path.join(componentsDir, oldName);
  const newPath = path.join(componentsDir, newName);
  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath);
  }
}

// 4. Create services directory and move from lib
const servicesDir = path.join(srcDir, 'services');
const coreDir = path.join(servicesDir, 'core');
const integrationsDir = path.join(servicesDir, 'integrations');

if (!fs.existsSync(servicesDir)) fs.mkdirSync(servicesDir);
if (!fs.existsSync(coreDir)) fs.mkdirSync(coreDir);
if (!fs.existsSync(integrationsDir)) fs.mkdirSync(integrationsDir);

const libDir = path.join(srcDir, 'lib');
const libServicesPath = path.join(libDir, 'services');

if (fs.existsSync(libServicesPath)) {
  const files = fs.readdirSync(libServicesPath);
  for (const file of files) {
    fs.renameSync(path.join(libServicesPath, file), path.join(coreDir, file));
  }
  fs.rmdirSync(libServicesPath);
}

const integrationsToMove = [
  'anac', 'bndes', 'cmrj', 'data', 'denasus', 'dou', 'fnde', 
  'ibama', 'opensky', 'pncp', 'siconfi', 'spu', 'tcu', 'transferegov', 'tse'
];

for (const integration of integrationsToMove) {
  const oldPath = path.join(libDir, integration);
  const newPath = path.join(integrationsDir, integration);
  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath);
  }
}

// 5. Update tsconfig.json
const tsconfigPath = path.join(rootDir, 'tsconfig.json');
if (fs.existsSync(tsconfigPath)) {
  let tsconfig = fs.readFileSync(tsconfigPath, 'utf8');
  tsconfig = tsconfig.replace(/"@\/\*":\s*\[\s*"\.\/\*"\s*\]/, '"@/*": ["./src/*"]');
  fs.writeFileSync(tsconfigPath, tsconfig);
}

// 6. Fix imports across all .ts and .tsx files
function updateImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Update @/ components moves
  content = content.replace(/@\/components\/Clarity/g, '@/components/analytics/Clarity');
  content = content.replace(/@\/components\/GoogleAnalytics/g, '@/components/analytics/GoogleAnalytics');
  content = content.replace(/@\/components\/HomeDashboard/g, '@/components/dashboard/HomeDashboard');
  content = content.replace(/@\/components\/MobileView/g, '@/components/layout/MobileView');
  content = content.replace(/@\/components\/MobileGate/g, '@/components/layout/MobileGate');
  content = content.replace(/@\/components\/SearchBar/g, '@/components/search/SearchBar');
  content = content.replace(/@\/components\/ShareDialog/g, '@/components/shared/ShareDialog');

  // Update @/ lib to services
  content = content.replace(/@\/lib\/services\//g, '@/services/core/');
  for (const integration of integrationsToMove) {
    const regex = new RegExp(`@/lib/${integration}/`, 'g');
    content = content.replace(regex, `@/services/integrations/${integration}/`);
  }

  // Handle __tests__ relative imports which now need an extra `../` or `src/` depending on depth.
  if (filePath.includes('__tests__') || filePath.includes('scripts')) {
    content = content.replace(/from\s+['"]\.\.\/\.\.\/lib\//g, "from '../../src/lib/");
    content = content.replace(/from\s+['"]\.\.\/\.\.\/app\//g, "from '../../src/app/");
    content = content.replace(/from\s+['"]\.\.\/\.\.\/components\//g, "from '../../src/components/");
    // Also handle services
    content = content.replace(/from\s+['"]\.\.\/\.\.\/src\/lib\/services\//g, "from '../../src/services/core/");
    for (const integration of integrationsToMove) {
        const regex = new RegExp(`from ['"]\\.\\./\\.\\./src/lib/${integration}/`, 'g');
        content = content.replace(regex, `from '../../src/services/integrations/${integration}/`);
    }
  }

  // If path is in src/services/integrations, increment relative imports depth
  const inIntegrations = filePath.includes(path.join('src', 'services', 'integrations'));
  if (inIntegrations) {
    // Add one more `../` to existing `../../`
    content = content.replace(/from\s+['"]\.\.\/\.\.\//g, "from '../../../");
    // `../utils` in `lib/anac/client.ts` was pointing to `lib/utils`. Now it needs to be `../../lib/utils`
    content = content.replace(/from\s+['"]\.\.\/utils/g, "from '../../src/lib/utils");
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content);
  }
}

function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    if (file === 'node_modules' || file === '.next' || file === '.git' || file === '.agents' || file === 'Obsidian Poligrafo Docs') continue;
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js') || fullPath.endsWith('.mjs')) {
      updateImports(fullPath);
    }
  }
}

processDirectory(rootDir);

console.log('Refactoring complete.');
