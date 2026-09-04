import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/camara-perfil-sync.yml', 'utf8');
const composite = readFileSync('.github/actions/camara-perfil-sync/action.yml', 'utf8');
const condicaoRetry = workflow.match(/^    if: (.+)$/m)?.[1];
const condicoesPreflight = [...composite.matchAll(/^      if: (.+)$/gm)].map(match => match[1]);

describe('Decisão de trocar o runner antes das gravações', () => {
	it.each([
		['success', 'true', true],
		['success', 'false', false],
		['success', '', false],
		['failure', 'false', false],
		['failure', 'true', false],
		['cancelled', 'true', false],
	])('job %s com retryable=%s autoriza outro runner: %s', (result, retryable, esperado) => {
		expect(condicaoRetry).toBeDefined();
		expect(runInNewContext(condicaoRetry!, { needs: { sync: { result, outputs: { retryable } } } })).toBe(esperado);
	});

	it('não inicia dependências nem ETLs quando o preflight falha e reprova HTTP/dados inválidos', () => {
		const [reprovar, ...gravar] = condicoesPreflight;
		expect(gravar).toHaveLength(4);
		for (const retryable of ['true', 'false', '']) {
			const contexto = { steps: { preflight: { outcome: 'failure', outputs: { retryable } } } };
			expect(runInNewContext(reprovar, contexto)).toBe(retryable !== 'true');
			for (const condicao of gravar) expect(runInNewContext(condicao, contexto)).toBe(false);
		}
	});

	it('limita a duas VMs sequenciais e não tolera preflight final nem erros de ETL', () => {
		expect(workflow.match(/^    runs-on: ubuntu-latest$/gm)).toHaveLength(2);
		expect(workflow.match(/^    timeout-minutes: 60$/gm)).toHaveLength(2);
		expect(workflow).toContain('    needs: sync');
		expect(workflow).toContain('  cancel-in-progress: false');
		expect(workflow.match(/allow-runner-retry: 'true'/g)).toHaveLength(1);
		expect(composite).toContain("    default: 'false'");
		expect(composite.match(/continue-on-error:/g)).toHaveLength(1);
		expect(composite).toContain("      continue-on-error: ${{ inputs.allow-runner-retry == 'true' }}");
		expect(workflow).toContain('      retryable: ${{ steps.sync.outputs.retryable }}');
		expect(composite).toContain('    value: ${{ steps.preflight.outputs.retryable }}');
		// Os demais passos mantêm success() implícito do GitHub, interrompendo a carga após erro.
		expect(condicoesPreflight.every(condicao => !/always\(|failure\(/.test(condicao))).toBe(true);
	});
});
