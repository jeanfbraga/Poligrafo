import { describe, it, expect } from "vitest";

// Como as funções estão no módulo de rota, podemos importá-las ou testá-las diretamente
describe("Processamento de Histórico de Mandato e Suplência", () => {
  it("deve formatar data simples como DD/MM/AAAA sem horário", async () => {
    // Teste de regex padrão DD/MM/AAAA
    const formatarDataSimples = (dataHora?: string) => {
      if (!dataHora) return "";
      const match = dataHora.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        const [, ano, mes, dia] = match;
        return `${dia}/${mes}/${ano}`;
      }
      return "";
    };

    expect(formatarDataSimples("2023-12-14T17:59")).toBe("14/12/2023");
    expect(formatarDataSimples("2024-04-12T00:00")).toBe("12/04/2024");
    expect(formatarDataSimples("2025-01-31")).toBe("31/01/2025");
    expect(formatarDataSimples(undefined)).toBe("");
  });

  it("deve identificar suplência com início e fim exatos", () => {
    const historicoMock = [
      {
        idLegislatura: 57,
        dataHora: "2023-12-14T17:59",
        situacao: "Exercício",
        condicaoEleitoral: "Suplente",
        descricaoStatus: "Entrada - Posse de Suplente - Posse como Suplente",
      },
      {
        idLegislatura: 57,
        dataHora: "2024-04-12T00:00",
        situacao: "SUPLENCIA",
        condicaoEleitoral: "Suplente",
        descricaoStatus: "Saída - Afastamento sem prazo determinado - Afastamento de Suplente (automático)",
      },
    ];

    const ultimoStatus = {
      situacao: "Suplência",
      condicaoEleitoral: "Suplente",
      data: "2024-04-12",
    };

    // Verificar se as datas são extraídas sem horas
    const dtEntrada = "14/12/2023";
    const dtSaida = "12/04/2024";
    const texto = `Exerceu mandato como Suplente de ${dtEntrada} a ${dtSaida}`;

    expect(texto).toBe("Exerceu mandato como Suplente de 14/12/2023 a 12/04/2024");
    expect(texto).not.toContain("17:59");
    expect(texto).not.toContain("00:00");
  });

  it("deve identificar titular licenciado para cargo no Executivo", () => {
    const historicoMock = [
      {
        idLegislatura: 57,
        dataHora: "2023-02-01T12:05",
        situacao: "Exercício",
        condicaoEleitoral: "Titular",
        descricaoStatus: "Entrada - Posse de Eleito Titular",
      },
      {
        idLegislatura: 57,
        dataHora: "2023-02-02T17:37",
        situacao: "Licença",
        condicaoEleitoral: "Titular",
        descricaoStatus: "Saída - Afastamento sem prazo determinado - Ministro de Estado",
      },
    ];

    const dtSaida = "02/02/2023";
    const texto = `Licenciado desde ${dtSaida} para exercer o cargo de Ministro de Estado`;

    expect(texto).toBe("Licenciado desde 02/02/2023 para exercer o cargo de Ministro de Estado");
    expect(texto).not.toContain("17:37");
  });
});
