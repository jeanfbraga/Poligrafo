const fs = require('fs');
const path = 'f:/Projetos/Polígrafo/lib/services/investigador-principal.ts';
let code = fs.readFileSync(path, 'utf8');

// Replace despesaId with a robust deterministic ID based on the despesa attributes and index
code = code.replace(
  /const despesaId = `despesa-\$\{d\.cnpjCpfFornecedor\}-\$\{Date\.now\(\)\}-\$\{Math\.random\(\)\.toString\(36\)\.substr\(2, 9\)\}`;/g,
  'const despesaId = `despesa-${pessoaId}-${d.cnpjCpfFornecedor}-${d.dataDocumento}-${d.valorDocumento}-${i}`;'
);

// Specific replacements to include pessoaId or uniquely identifying context
code = code.replace(/`bem-\$\{i\}-\$\{Date\.now\(\)\}`/g, '`bem-${pessoaId}-${i}`');
code = code.replace(/`servidor-cmrj-\$\{Date\.now\(\)\}-\$\{i\}`/g, '`servidor-cmrj-${pessoaId}-${i}`');
code = code.replace(/`dashboard-cota-cmrj-\$\{Date\.now\(\)\}`/g, '`dashboard-cota-cmrj-${pessoaId}`');
code = code.replace(/`orgao-alerj-\$\{Date\.now\(\)\}`/g, '`orgao-alerj-${pessoaId}`');
code = code.replace(/`acordao-pa-\$\{Date\.now\(\)\}-\$\{i\}`/g, '`acordao-pa-${pessoaId}-${i}`');
code = code.replace(/`processo-to-\$\{Date\.now\(\)\}-\$\{i\}`/g, '`processo-to-${pessoaId}-${i}`');
code = code.replace(/`bens-\$\{Date\.now\(\)\}`/g, '`bens-${pessoaId}`');

// For enterprise tracking
code = code.replace(/`empresa-rev-\$\{cnpjEmp\}-\$\{Date\.now\(\)\}`/g, '`empresa-rev-${pessoaId}-${cnpjEmp}`');
code = code.replace(/`convenio-\$\{cnpjRastreado\}-\$\{Date\.now\(\)\}`/g, '`convenio-${pessoaId}-${cnpjRastreado}`');
code = code.replace(/`anac-\$\{anv\.prefixo \|\| Date\.now\(\)\}-\$\{Math\.random\(\)\.toString\(36\)\.substr\(2, 5\)\}`/g, '`anac-${pessoaId}-${anv.prefixo || i}`');
code = code.replace(/`bndes-\$\{cnpj\}-\$\{Date\.now\(\)\}`/g, '`bndes-${pessoaId}-${cnpj}`');
code = code.replace(/`ibama-\$\{cnpj\}-\$\{Date\.now\(\)\}`/g, '`ibama-${pessoaId}-${cnpj}`');
code = code.replace(/`tcu-certidao-\$\{cnpj\}-\$\{Date\.now\(\)\}`/g, '`tcu-certidao-${pessoaId}-${cnpj}`');
code = code.replace(/`tcers-\$\{Date\.now\(\)\}-\$\{i\}`/g, '`tcers-${pessoaId}-${i}`');
code = code.replace(/`siconfi-\$\{enteSiconfi\.cod_ibge\}-\$\{Date\.now\(\)\}`/g, '`siconfi-${pessoaId}-${enteSiconfi.cod_ibge}`');
code = code.replace(/`fnde-\$\{deputadoBasico\.uf\}-\$\{Date\.now\(\)\}`/g, '`fnde-${pessoaId}-${deputadoBasico.uf}`');
code = code.replace(/`emenda-pix-\$\{cnpj\}-\$\{Date\.now\(\)\}`/g, '`emenda-pix-${pessoaId}-${cnpj}`');
code = code.replace(/`toma-la-da-ca-\$\{cnpjDoador\}-\$\{Date\.now\(\)\}`/g, '`toma-la-da-ca-${pessoaId}-${cnpjDoador}`');
code = code.replace(/`nepotismo-\$\{nomeSocio\.replace\(\/\\\\s\\+\/g, '-'\)\}-\$\{Date\.now\(\)\}`/g, '`nepotismo-${pessoaId}-${nomeSocio.replace(/\\s+/g, "-")}`');
code = code.replace(/`anac-forn-\$\{cnpjForn\}-\$\{anv\.prefixo \|\| Date\.now\(\)\}-\$\{Math\.random\(\)\.toString\(36\)\.substr\(2, 5\)\}`/g, '`anac-forn-${pessoaId}-${cnpjForn}-${anv.prefixo || "0"}`');

fs.writeFileSync(path, code);
console.log('Fixed IDs');
