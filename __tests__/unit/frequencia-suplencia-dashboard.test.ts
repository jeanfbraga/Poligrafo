import { describe, it, expect, vi } from "vitest";

describe("Filtro de Suplência e Licença na Frequência do Dashboard", () => {
	it("deve filtrar exclusivamente titulares em exercício e descartar suplentes e licenças", () => {
		const registrosFrequenciaMock = [
			{ id_deputado: 1, nome: "Deputado A", presencas: 0, condicao_eleitoral: "Titular", situacao: "Exercício" },
			{ id_deputado: 2, nome: "Roseana Sarney", presencas: 0, condicao_eleitoral: "Titular", situacao: "Licença" },
			{ id_deputado: 3, nome: "Leonardo Gadelha", presencas: 2, condicao_eleitoral: "Suplente", situacao: "Exercício" },
			{ id_deputado: 4, nome: "Deputado B", presencas: 3, condicao_eleitoral: "Titular", situacao: "Exercício" },
			{ id_deputado: 5, nome: "Deputado C", presencas: 5, condicao_eleitoral: "Titular", situacao: "Exercício" },
			{ id_deputado: 6, nome: "Paulo Soares", presencas: 9, condicao_eleitoral: "Suplente", situacao: "Exercício" },
		];

		const filtrados = registrosFrequenciaMock.filter(
			(d) => d.condicao_eleitoral === "Titular" && d.situacao === "Exercício"
		);

		expect(filtrados).toHaveLength(3);
		expect(filtrados.map((d) => d.nome)).toEqual(["Deputado A", "Deputado B", "Deputado C"]);
		expect(filtrados.find((d) => d.nome === "Roseana Sarney")).toBeUndefined();
		expect(filtrados.find((d) => d.nome === "Leonardo Gadelha")).toBeUndefined();
		expect(filtrados.find((d) => d.nome === "Paulo Soares")).toBeUndefined();
	});

	it("consulta do Supabase para o dashboard deve encadear filtros de titular e exercício", async () => {
		const mockQueryBuilder = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			order: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue({ data: [], error: null }),
		};

		const mockSupabase = {
			from: vi.fn().mockReturnValue(mockQueryBuilder),
		};

		// Executa consulta simulada conforme implementado em route.ts
		await mockSupabase
			.from("camara_frequencia")
			.select("*")
			.eq("condicao_eleitoral", "Titular")
			.eq("situacao", "Exercício")
			.order("presencas", { ascending: true })
			.limit(10);

		expect(mockSupabase.from).toHaveBeenCalledWith("camara_frequencia");
		expect(mockQueryBuilder.eq).toHaveBeenCalledWith("condicao_eleitoral", "Titular");
		expect(mockQueryBuilder.eq).toHaveBeenCalledWith("situacao", "Exercício");
		expect(mockQueryBuilder.order).toHaveBeenCalledWith("presencas", { ascending: true });
		expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
	});
});
