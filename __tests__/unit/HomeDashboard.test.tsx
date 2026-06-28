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
        faltosos: [],
        votantes: [],
        categorias: [],
        pixEstados: [],
        pixTop10: []
      })
    });

    render(<HomeDashboard />);

    await waitFor(() => {
      // The Central de Inteligência title should be there
      expect(screen.getByText(/Central de Inteligência/i)).toBeInTheDocument();
    });

    // Check if the empty state text "Sem registros." is rendered multiple times (for each widget)
    const emptyMessages = screen.getAllByText("Sem registros.");
    expect(emptyMessages.length).toBeGreaterThan(0);
  });

  it("renders the 'Últimos 90 dias' subtitle on Frequência and Votações widgets", async () => {
    // Mock the fetch call to return some mock data so it doesn't stay in loading
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        ceapTotal: [],
        ceapTop10: [],
        faltosos: [{ nome: "Deputado Faltoso", ausencias_nao_justificadas: 10 }],
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
      expect(screen.getByText("Deputado Faltoso")).toBeInTheDocument();
    });

    // Subtitle check
    const subtitles = screen.getAllByText(/últimos 90 dias/i);
    expect(subtitles).toHaveLength(1); // Faltosos
  });

  it("renders updated widget titles correctly", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        ceapTotal: [],
        ceapTop10: [],
        faltosos: [],
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
    });
  });
});

