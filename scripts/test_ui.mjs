import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Navegando para http://localhost:3000...");
  await page.goto('http://localhost:3000');
  
  // Teste 1: Buscar sem selecionar alçada e com termo fora do autocomplete
  console.log("Teste 1: Digitar nome aleatório e clicar em Procurar (Desktop)");
  await page.fill('input[placeholder="ALVO: NOME DO POLÍTICO"]', 'Político Falso Teste');
  
  // Como o termo não está no index, não deve abrir autocomplete
  await page.waitForTimeout(500); 
  
  // Clica procurar
  await page.click('button:has-text("PROCURAR")');
  
  // Deve aparecer o aviso: "> SELECIONE A ALÇADA (ESTADO) DO POLÍTICO ANTES DE BUSCAR."
  await page.waitForTimeout(2500);
  const textMsg = await page.textContent('body');
  if (textMsg.includes('SELECIONE A ALÇADA')) {
      console.log("✅ Teste 1 Passou: Validação de alçada acionada com sucesso.");
  } else {
      console.error("❌ Teste 1 Falhou: Aviso de alçada não foi exibido.");
  }

  // Teste 2: Selecionar alçada e buscar
  console.log("Teste 2: Selecionar Alçada e Buscar");
  await page.selectOption('select#select-alcada', 'SP');
  await page.click('button:has-text("PROCURAR")');
  await page.waitForTimeout(1000);
  
  const textMsg2 = await page.textContent('body');
  if (textMsg2.includes('Estabelecendo conexão segura') || !textMsg2.includes('> SELECIONE A ALÇADA')) {
      console.log("✅ Teste 2 Passou: Busca iniciada quando alçada está selecionada.");
  } else {
      console.error("❌ Teste 2 Falhou: Busca não iniciou após selecionar alçada.");
  }

  // Reload para resetar estado
  await page.goto('http://localhost:3000');

  // Teste 3: Autocomplete match bypasses select
  console.log("Teste 3: Selecionar via Autocomplete não exige alçada");
  await page.fill('input[placeholder="ALVO: NOME DO POLÍTICO"]', 'Tiririca');
  await page.waitForTimeout(1000);
  
  // O dropdown de autocomplete deve aparecer. Clicar no primeiro
  const autocompleteMatch = page.locator('button:has-text("TIRIRICA")').first();
  if (await autocompleteMatch.isVisible()) {
      await autocompleteMatch.click();
      await page.waitForTimeout(1000);
      const textMsg3 = await page.textContent('body');
      if (textMsg3.includes('Estabelecendo conexão segura') || !textMsg3.includes('> SELECIONE A ALÇADA')) {
          console.log("✅ Teste 3 Passou: Autocomplete ignora a obrigatoriedade da alçada.");
      } else {
          console.error("❌ Teste 3 Falhou: Autocomplete exigiu alçada.");
      }
  } else {
      console.error("❌ Teste 3 Falhou: Autocomplete dropdown não apareceu para 'Tiririca'.");
  }

  await browser.close();
  console.log("Testes completos.");
})();
