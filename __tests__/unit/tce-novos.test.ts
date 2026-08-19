import { describe, it, expect, vi, beforeEach } from "vitest";
import { buscarDespesasMG, buscarContratosMG } from "@/app/api/investigar/estados/mg/tce";
import { buscarDespesasBA, buscarContratosBA } from "@/app/api/investigar/estados/ba/tce";
import { buscarDespesasPR, buscarContratosPR } from "@/app/api/investigar/estados/pr/tce";
import { buscarDespesasTcmSP, buscarContratosTcmSP } from "@/app/api/investigar/municipios/tcm-sp";
import * as tseModule from "@/app/api/investigar/tse";

describe("Novos Conectores de Tribunais de Contas (Ponto 8)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("TCE-MG (Minas Gerais)", () => {
		it("deve retornar contratos do TCE-MG formatados", async () => {
			vi.spyOn(tseModule, "fetchWithTimeout").mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					result: {
						records: [
							{
								objeto: "Reforma de escola municipal",
								fornecedor: "CONSTRUTORA MINEIRA LTDA",
								cnpj: "11222333000144",
								valor: "450000.00",
								data_publicacao: "2024-03-15",
								modalidade: "Concorrência",
							},
						],
					},
				}),
			} as any);

			const contratos = await buscarContratosMG("Belo Horizonte");
			expect(contratos.length).toBe(1);
			expect(contratos[0].fornecedor).toBe("CONSTRUTORA MINEIRA LTDA");
			expect(contratos[0].valor).toBe(450000);

			const despesas = await buscarDespesasMG("Belo Horizonte");
			expect(despesas.length).toBe(1);
			expect(despesas[0].tipoDespesa).toContain("TCE-MG");
		});
	});

	describe("TCM-BA / TCE-BA (Bahia)", () => {
		it("deve retornar contratos do TCM-BA formatados", async () => {
			vi.spyOn(tseModule, "fetchWithTimeout").mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => [
					{
						objeto: "Pavimentação asfáltica",
						fornecedor: "BAHIA ASFALTO LTDA",
						cnpj: "55666777000188",
						valor: "1200000",
						data: "2024-02-10",
						unidadeGestora: "Prefeitura Municipal de Feira de Santana",
					},
				],
			} as any);

			const contratos = await buscarContratosBA("Feira de Santana");
			expect(contratos.length).toBe(1);
			expect(contratos[0].fornecedor).toBe("BAHIA ASFALTO LTDA");
			expect(contratos[0].valor).toBe(1200000);

			const despesas = await buscarDespesasBA("Feira de Santana");
			expect(despesas.length).toBe(1);
			expect(despesas[0].tipoDespesa).toContain("TCM-BA");
		});
	});

	describe("TCE-PR (Paraná)", () => {
		it("deve retornar contratações do TCE-PR formatadas", async () => {
			vi.spyOn(tseModule, "fetchWithTimeout").mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					dados: [
						{
							dsc_objeto: "Fornecimento de merenda escolar",
							nom_vencedor: "ALIMENTOS DO PARANA S/A",
							num_cnpj_cpf: "99888777000166",
							vlr_homologado: "850000",
							dta_homologacao: "2024-01-20",
							nom_entidade: "Prefeitura de Curitiba",
						},
					],
				}),
			} as any);

			const contratos = await buscarContratosPR("Curitiba");
			expect(contratos.length).toBe(1);
			expect(contratos[0].fornecedor).toBe("ALIMENTOS DO PARANA S/A");
			expect(contratos[0].valor).toBe(850000);

			const despesas = await buscarDespesasPR("Curitiba");
			expect(despesas.length).toBe(1);
			expect(despesas[0].tipoDespesa).toContain("TCE-PR");
		});
	});

	describe("TCM-SP (São Paulo - Capital)", () => {
		it("deve retornar contratos do TCM-SP formatados", async () => {
			vi.spyOn(tseModule, "fetchWithTimeout").mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					contratos: [
						{
							numeroContrato: "CT-2024/001",
							descricaoObjeto: "Serviços de limpeza urbana",
							razaoSocial: "PAULISTA SERVICOS URBANOS S/A",
							cnpjContratado: "33444555000122",
							valorInicial: "5400000",
							dataAssinatura: "2024-04-01",
							secretaria: "Secretaria Municipal de Subprefeituras",
						},
					],
				}),
			} as any);

			const contratos = await buscarContratosTcmSP("Limpeza");
			expect(contratos.length).toBe(1);
			expect(contratos[0].contratado).toBe("PAULISTA SERVICOS URBANOS S/A");
			expect(contratos[0].valor).toBe(5400000);

			const despesas = await buscarDespesasTcmSP("Limpeza");
			expect(despesas.length).toBe(1);
			expect(despesas[0].tipoDespesa).toContain("TCM-SP");
		});
	});
});
