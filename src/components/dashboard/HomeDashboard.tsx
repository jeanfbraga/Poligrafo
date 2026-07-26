"use client";

import {
	AlertTriangle,
	DollarSign,
	FileText,
	Landmark,
	MapPin,
	Terminal,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AnimatedNumber } from "@/components/dashboard/AnimatedNumber";
import { CategoriasChart } from "@/components/dashboard/CategoriasChart";
import { Widget } from "@/components/dashboard/Widget";
import { Badge } from "@/components/ui/badge";
import { HybridTooltip } from "@/components/ui/hybrid-tooltip";
import { formatName } from "@/lib/utils";
import { BarRanking, type BarRankingItem } from "./BarRanking";
// Módulos do rascunho (layout v2)
import { KpiBand } from "./KpiBand";
import { UfHeatGrid } from "./UfHeatGrid";

// Tipagens Rigorosas
interface DashboardData {
	ceapTotal: { total_gasto: string; ano: string }[];
	ceapTop10: {
		nome: string;
		total_gasto: number;
		partido?: string;
		uf?: string;
		foto?: string | null;
		id_deputado?: number;
		cargo?: string;
	}[];
	menosPresentes: {
		nome: string;
		presencas: number;
		partido?: string;
		uf?: string;
		foto?: string | null;
		id_deputado?: number;
		cargo?: string;
	}[];
	totalSessoes: number | null;
	votantes: {
		nome: string;
		votos_registrados: number;
		partido?: string;
		uf?: string;
		foto?: string | null;
		id_deputado?: number;
		cargo?: string;
	}[];
	ceapCategorias: { tipo_despesa: string; total_gasto: number }[];
	emendasTop10: {
		autor: string;
		total_pix: number;
		id_deputado?: number;
		foto?: string | null;
		uf?: string;
		partido?: string;
		cargo?: string;
	}[];
	emendasUF: { uf_destino: string; total_pix: number }[];
	pesquisas: {
		termo: string;
		quantidade: number;
		partido?: string;
		uf?: string;
		foto?: string | null;
		id_deputado?: number;
		cargo?: string;
	}[];
	ceapEstados: Record<string, { total: number; deputados: any[] }>;
}

export function HomeDashboard() {
	const [data, setData] = useState<DashboardData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);

	useEffect(() => {
		fetch("/api/dashboard/home")
			.then((res) => res.json())
			.then((d: DashboardData) => {
				setData(d);
				setLoading(false);
			})
			.catch((e) => {
				console.error(e);
				setError(true);
				setLoading(false);
			});
	}, []);

	// Mapeadores padronizados com formatName (Title Case / Caixa Normal)
	const ceapTop10Items: BarRankingItem[] = (data?.ceapTop10 || []).map(
		(item) => ({
			label: formatName(item.nome),
			value: item.total_gasto,
			profile:
				item.partido && item.partido !== "N/A"
					? {
							nome: formatName(item.nome),
							partido: item.partido,
							uf: item.uf,
							foto: item.foto,
							id: item.id_deputado,
							cargo: item.cargo,
						}
					: null,
		}),
	);

	const menosPresItem: BarRankingItem[] = (data?.menosPresentes || []).map(
		(item) => ({
			label: formatName(item.nome),
			value: item.presencas,
			valueTotal: data?.totalSessoes ?? undefined,
			profile:
				item.partido && item.partido !== "N/A"
					? {
							nome: formatName(item.nome),
							partido: item.partido,
							uf: item.uf,
							foto: item.foto,
							id: item.id_deputado,
							cargo: item.cargo,
						}
					: null,
		}),
	);

	const emendasTop10Items: BarRankingItem[] = (data?.emendasTop10 || []).map(
		(item) => ({
			label: formatName(item.autor),
			value: item.total_pix,
			profile:
				item.partido && item.partido !== "N/A"
					? {
							nome: formatName(item.autor),
							partido: item.partido,
							uf: item.uf,
							foto: item.foto,
							id: item.id_deputado,
							cargo: item.cargo,
						}
					: null,
		}),
	);

	// Separa MÚLTIPLO do ranking das UFs para não desproporcionar a escala visual dos estados
	const multiploEmendaItem = (data?.emendasUF || []).find(
		(item) => item.uf_destino?.toUpperCase() === "MÚLTIPLO",
	);
	const emendasUFItems: BarRankingItem[] = (data?.emendasUF || [])
		.filter((item) => item.uf_destino?.toUpperCase() !== "MÚLTIPLO")
		.map((item) => ({
			label: item.uf_destino,
			value: item.total_pix,
		}));

	const pesquisasItems: BarRankingItem[] = (data?.pesquisas || []).map(
		(item) => ({
			label: formatName(item.termo),
			value: item.quantidade,
			profile:
				item.partido && item.partido !== "N/A"
					? {
							nome: formatName(item.termo),
							partido: item.partido,
							uf: item.uf,
							foto: item.foto,
							id: item.id_deputado,
							cargo: item.cargo,
						}
					: null,
		}),
	);

	return (
		<div
			className="absolute inset-0 z-10 overflow-y-auto bg-[#050505] custom-scrollbar"
			style={{
				backgroundImage:
					"radial-gradient(circle, #002200 1px, transparent 1px)",
				backgroundSize: "24px 24px",
			}}
		>
			{/* Mobile-only Header */}
			<div className="md:hidden sticky top-0 z-50 h-14 border-b border-green-500/50 bg-black/95 backdrop-blur-sm flex items-center px-4 gap-2">
				<Terminal className="w-5 h-5 text-green-500" />
				<span className="text-base font-bold tracking-widest text-green-500 uppercase">
					POLÍGRAFO
				</span>
				<Badge variant="cyber-green" className="ml-1">
					IA
				</Badge>
			</div>

			<div className="max-w-400 w-full mx-auto p-4 md:p-8 pt-6 md:pt-10 pb-28 flex flex-col gap-6">
				{/* Header Section / Faixa KPI Hero (Draft) */}
				<KpiBand
					loading={loading}
					ceapTotal={data?.ceapTotal}
					ceapTop10={data?.ceapTop10}
					emendasTop10={data?.emendasTop10}
				/>

				<div className="flex flex-col xl:flex-row gap-6 items-start">
					{/* COLUNA ESQUERDA - PIXEL MAP DE CALOR POR UF (Draft) */}
					<div className="w-full xl:w-105 shrink-0 flex flex-col gap-4">
						<Widget
							title="Campeonato estadual de gastos"
							subtitle="Mapa de calor por UF — CEAP acumulada desde Jan/2025"
							icon={MapPin}
							data={data?.ceapEstados}
							error={error}
							loading={loading}
						>
							<UfHeatGrid data={data?.ceapEstados} />
						</Widget>
					</div>

					{/* DEMAIS WIDGETS (Padronização dos Tokens de Cores e Estilo das Barras) */}
					<div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{/* Widget: Top 10 Gastos CEAP */}
						<Widget
							title="Deputados Federais que mais gastaram"
							subtitle={`CEAP ${new Date().getFullYear()} — acumulado do ano`}
							icon={DollarSign}
							data={data?.ceapTop10}
							error={error}
							loading={loading}
						>
							<BarRanking
								items={ceapTop10Items}
								accent="green"
								isCurrency={true}
								valuePrefix="R$ "
							/>
						</Widget>

						{/* Widget: Menos Presentes em Sessões Deliberativas */}
						<Widget
							title="Menos Presentes"
							subtitle="Em sessões deliberativas (últimos 90 dias)"
							icon={AlertTriangle}
							data={data?.menosPresentes}
							error={error}
							loading={loading}
						>
							<div className="mb-3">
								<HybridTooltip content="Conta as presenças registradas em sessões deliberativas do Plenário da Câmara (votações, debates e deliberações) nos últimos 90 dias. Os dados vêm da API oficial da Câmara dos Deputados. Deputados licenciados, em missão oficial ou com mandato em exercício podem ter presenças baixas sem que isso signifique ausência injustificada.">
									<span className="inline-flex items-center gap-1 text-[11px] text-green-700 cursor-help border-b border-dashed border-green-800/60 hover:text-green-500 transition-colors">
										O que são sessões deliberativas?
										<span className="text-[10px] text-green-800">[?]</span>
									</span>
								</HybridTooltip>
							</div>
							<BarRanking
								items={menosPresItem}
								accent="green"
								showFraction={true}
								valueSuffix=" sess."
							/>
						</Widget>

						{/* Widget: Categorias CEAP */}
						<Widget
							title="Categorias de gastos"
							subtitle="Top 5 — CEAP acumulada desde Jan/2024"
							icon={FileText}
							data={data?.ceapCategorias}
							error={error}
							loading={loading}
						>
							<CategoriasChart data={data?.ceapCategorias || []} />
						</Widget>

						{/* Widget: Top Emendas PIX */}
						<Widget
							title="Maiores Emendas PIX"
							subtitle="Valores pagos — acumulado de todos os anos"
							icon={Landmark}
							data={data?.emendasTop10}
							error={error}
							loading={loading}
						>
							<BarRanking
								items={emendasTop10Items}
								accent="green"
								isCurrency={true}
								valuePrefix="R$ "
							/>
						</Widget>

						{/* Widget: Emendas por UF */}
						<Widget
							title="Emendas PIX por Estado"
							subtitle="Destinação de recursos — valores pagos"
							icon={Users}
							data={data?.emendasUF}
							error={error}
							loading={loading}
						>
							<div className="flex flex-col gap-3">
								{multiploEmendaItem && (
									<div className="pb-3 mb-1 border-b border-green-900/30 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
										<HybridTooltip 
											content="Recursos de emendas PIX destinados a múltiplos municípios ou regiões simultaneamente sem restrição de UF única."
										>
											<span className="text-xs font-bold text-green-300 cursor-help border-b border-dashed border-green-400/50 hover:text-green-200 transition-colors tracking-wider inline-flex items-center gap-1.5 whitespace-nowrap">
												<span>Múltiplas regiões</span>
												<span className="text-[10px] text-green-500 font-normal">
													[?]
												</span>
											</span>
										</HybridTooltip>
										<span className="text-xs md:text-sm font-mono font-bold text-green-400 shrink-0">
											<AnimatedNumber
												value={multiploEmendaItem.total_pix}
												prefix="R$ "
												isCurrency={true}
											/>
										</span>
									</div>
								)}

								<BarRanking
									items={emendasUFItems}
									accent="green"
									isCurrency={true}
									valuePrefix="R$ "
								/>
							</div>
						</Widget>

						{/* Widget: Mais Pesquisados */}
						<Widget
							title="Mais Investigados"
							subtitle="Pelos usuários do Polígrafo"
							icon={Terminal}
							data={data?.pesquisas}
							error={error}
							loading={loading}
						>
							<BarRanking
								items={pesquisasItems}
								accent="green"
								valueSuffix=" buscas"
							/>
						</Widget>
					</div>
				</div>
			</div>
		</div>
	);
}

export default HomeDashboard;
