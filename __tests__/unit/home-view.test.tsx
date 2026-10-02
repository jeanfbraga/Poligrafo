/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeView } from "@/components/dashboard/HomeView";
import { InvestigacaoProvider } from "@/components/investigacao/InvestigacaoProvider";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
	usePathname: () => "/",
	useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-mobile", () => ({ useViewport: () => "desktop", useIsMobile: () => false }));
vi.mock("gsap", () => ({
	default: {
		context: (fn: () => void) => {
			fn();
			return { revert: vi.fn() };
		},
		to: (obj: { val: number }, cfg: { val: number; onUpdate?: () => void }) => {
			obj.val = cfg.val;
			cfg.onUpdate?.();
			return { kill: vi.fn() };
		},
	},
}));

const montar = () =>
	render(
		<InvestigacaoProvider>
			<HomeView />
		</InvestigacaoProvider>,
	);

describe("HomeView", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("com dados vazios mostra o fallback 'Sem registros.' em cada painel", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			json: vi.fn().mockResolvedValue({ ceapTotal: [], ceapTop10: [], menosPresentes: [], totalSessoes: null, ceapCategorias: [], emendasTop10: [], emendasUF: [], ceapEstados: {}, pesquisas: [] }),
		});
		montar();
		await waitFor(() => expect(screen.getAllByText("Sem registros.").length).toBeGreaterThan(3));
		expect(screen.getByText(/Campeonato estadual de gastos/i)).toBeInTheDocument();
	});

	it("'Menos presentes' exibe presenças como fração do total de sessões", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			json: vi.fn().mockResolvedValue({
				ceapTotal: [], ceapTop10: [], menosPresentes: [{ nome: "Deputado Ausente", presencas: 2, partido: "XYZ", uf: "RJ", id_deputado: 9 }],
				totalSessoes: 121, ceapCategorias: [], emendasTop10: [], emendasUF: [], ceapEstados: {}, pesquisas: [],
			}),
		});
		montar();
		expect(await screen.findByText("Deputado Ausente")).toBeInTheDocument();
		expect(screen.getByText("2/121 sess.")).toBeInTheDocument();
	});

	it("KPI mostra o total do ano mais recente e a concentração do top 10", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			json: vi.fn().mockResolvedValue({
				ceapTotal: [{ ano: "2025", total_gasto: "1000" }],
				ceapTop10: [{ nome: "A", total_gasto: 400, partido: "X", uf: "SP", id_deputado: 1 }],
				menosPresentes: [], totalSessoes: null, ceapCategorias: [], emendasTop10: [], emendasUF: [], ceapEstados: {}, pesquisas: [],
			}),
		});
		montar();
		expect(await screen.findByText(/GASTO_EM_COTA_PARLAMENTAR :: 2025/)).toBeInTheDocument();
		expect(await screen.findByText("40%")).toBeInTheDocument();
	});

	it("falha na API mostra o estado de erro dos painéis", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
		montar();
		await waitFor(() => expect(screen.getAllByText("Falha ao decodificar dados.").length).toBeGreaterThan(0));
	});

	it("não exibe banner Pix de doação (descontinuado)", async () => {
		global.fetch = vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({ ceapEstados: {} }) });
		const { container } = montar();
		await waitFor(() => expect(container.querySelector(".pg-kpi")).toBeInTheDocument());
		expect(container.textContent?.toLowerCase()).not.toMatch(/doa[çc][ãa]o|apoie|chave pix/);
	});
});
