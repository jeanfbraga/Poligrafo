/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HomeDashboard from "@/components/dashboard/HomeDashboard";

// Mock GSAP to avoid animation issues in tests
vi.mock("gsap", () => ({
  default: {
    context: (fn: any) => {
      fn();
      return { revert: vi.fn() };
    },
    from: vi.fn(),
    to: (obj: any, config: any) => {
      obj.val = config.val;
      if (config.onUpdate) config.onUpdate();
      return { kill: vi.fn() };
    }
  }
}));

// Mock @gsap/react
vi.mock("@gsap/react", () => ({
  useGSAP: (fn: any) => fn()
}));

describe("HomeDashboard Component", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders correctly with empty data (Sem registros fallback)", async () => {
    // Mock the fetch call to return empty data arrays
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        ceapTotal: [],
        ceapTop10: [],
        menosPresentes: [],
        totalSessoes: null,
        votantes: [],
        categorias: [],
        pixEstados: [],
        pixTop10: []
      })
    });

    render(<HomeDashboard />);

    await waitFor(() => {
      // The Campeonato estadual de gastos title should be there
      expect(screen.getByText(/Campeonato estadual de gastos/i)).toBeInTheDocument();
    });

    // Check if the empty state text "Sem registros." is rendered multiple times (for each widget)
    const emptyMessages = screen.getAllByText("Sem registros.");
    expect(emptyMessages.length).toBeGreaterThan(0);
  });

  it("renders 'Menos Presentes' widget with presence data and fraction format", async () => {
    // Mock da API com novo contrato: menosPresentes + totalSessoes
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        ceapTotal: [],
        ceapTop10: [],
        menosPresentes: [{ nome: "Deputado Ausente", presencas: 2 }],
        totalSessoes: 121,
        votantes: [{ nome: "Deputado Votante", votos_registrados: 50 }],
        categorias: [],
        emendasTop10: [],
        emendasUF: [],
        ceapEstados: {},
        pesquisas: []
      })
    });

    render(<HomeDashboard />);

    await waitFor(() => {
      // Deputado deve aparecer no ranking
      expect(screen.getByText("Deputado Ausente")).toBeInTheDocument();
    });

    // Widget deve ter o novo título
    expect(screen.getByText(/Menos Presentes/i)).toBeInTheDocument();

    // Subtítulo e tooltip devem mencionar sessões deliberativas (ambos presentes)
    const sessoesEls = screen.getAllByText(/sess.es deliberativas/i);
    expect(sessoesEls.length).toBeGreaterThanOrEqual(2); // subtitle do widget + tooltip

    // Tooltip de explicação deve estar presente
    expect(screen.getByText(/O que s.o sess.es deliberativas/i)).toBeInTheDocument();
  });

  it("renders updated widget titles correctly", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        ceapTotal: [],
        ceapTop10: [],
        menosPresentes: [],
        totalSessoes: null,
        votantes: [],
        categorias: [],
        emendasTop10: [],
        emendasUF: [],
        ceapEstados: {},
        pesquisas: []
      })
    });

    render(<HomeDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Emendas PIX por Estado/i)).toBeInTheDocument();
      expect(screen.getByText(/Categorias de gastos/i)).toBeInTheDocument();
      expect(screen.getByText(/Deputados Federais que mais gastaram/i)).toBeInTheDocument();
      // Garante que o widget antigo "Mais Faltosos" NÃO existe mais
      expect(screen.queryByText(/Mais Faltosos/i)).not.toBeInTheDocument();
      // Garante que o widget novo "Menos Presentes" existe
      expect(screen.getByText(/Menos Presentes/i)).toBeInTheDocument();
    });
  });
});

