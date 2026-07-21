"use client";

import {
	BarChart3,
	Loader2,
	PieChart as PieChartIcon,
	ShieldAlert,
	TrendingUp,
} from "lucide-react";
import {
	Bar,
	BarChart,
	Cell,
	Pie,
	PieChart as RechartsPieChart,
	Tooltip as RechartsTooltip,
	ResponsiveContainer,
	XAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";

export const DashboardCotaConteudo = ({
	nome,
	data,
	loading,
}: {
	nome: string;
	data: any;
	loading: boolean;
}) => {
	const fmtBRL = (v: number) =>
		v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
	const maxCategoria = data?.gastosPorCategoria?.[0]?.valor || 1;

	return (
		<div className="space-y-6 pb-4">
			{/* Header */}
			<div className="border-b border-indigo-800 pb-4">
				<Badge
					variant="outline"
					className="w-fit text-xs uppercase rounded-none border bg-indigo-950/60 text-indigo-400 border-indigo-600 mb-2"
				>
					COTA DE GABINETE · CMRJ
				</Badge>
				<div className="flex items-center gap-2 mt-1">
					<BarChart3 className="h-5 w-5 text-indigo-400 shrink-0" />
					<h2 className="text-base font-bold uppercase tracking-wider text-indigo-300 truncate">
						{nome}
					</h2>
				</div>
				{!loading && data?.periodo && (
					<div className="mt-2 text-xs font-mono text-indigo-500/70 border-l-2 border-indigo-900/50 pl-2">
						Período processado: {data.periodo}
					</div>
				)}
			</div>

			<div className="bg-amber-950/20 border border-amber-900/50 p-3 flex gap-3 text-amber-500/90 rounded-sm">
				<ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
				<div className="text-[11px] leading-relaxed uppercase tracking-wider">
					<p className="font-bold mb-1 text-amber-500">
						Limitação de Transparência (CMRJ)
					</p>
					O Portal de Transparência da Câmara Municipal do Rio de Janeiro
					disponibiliza apenas o valor bruto mensal por categoria. A casa
					legislativa <strong>não publica o detalhamento dos pagamentos</strong>
					, <strong>nem os dados dos fornecedores</strong>, e{" "}
					<strong>não fornece as notas fiscais originais</strong> em formato
					aberto para consulta. Os dados abaixo refletem a consolidação das
					tabelas sintéticas disponibilizadas.
				</div>
			</div>

			{loading && (
				<div className="flex flex-col items-center justify-center py-12 gap-3">
					<Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
					<p className="text-xs text-indigo-400 uppercase tracking-widest animate-pulse">
						Extraindo matriz de despesas da CMRJ...
					</p>
				</div>
			)}

			{!loading && data?.error && (
				<div className="p-4 border border-red-800 bg-red-950/20 text-red-400 text-xs uppercase tracking-wide">
					⚠ {data.error}
				</div>
			)}

			{!loading && data && !data.error && (
				<>
					{/* Total Geral */}
					<div className="p-4 border border-indigo-800 bg-indigo-950/20">
						<p className="text-xs uppercase text-indigo-500 mb-1">
							Total Gasto (Mandato Atual)
						</p>
						<p className="text-2xl font-bold text-indigo-200 tracking-widest">
							{fmtBRL(data.totalGastos || 0)}
						</p>
						<p className="text-xs text-indigo-600 mt-1">
							{data.totalNotas || 0} registros de despesas analisados
						</p>
					</div>

					{/* Gastos por Categoria */}
					{data.gastosPorCategoria?.length > 0 && (
						<div>
							<h3 className="text-xs uppercase font-bold text-indigo-500 mb-3 flex items-center gap-2 border-b border-indigo-900 pb-1">
								<PieChartIcon className="w-3.5 h-3.5" /> Gastos por Categoria
							</h3>
							<div className="h-64 w-full">
								<ResponsiveContainer width="100%" height="100%">
									<RechartsPieChart>
										<Pie
											data={data.gastosPorCategoria.slice(0, 6)}
											dataKey="valor"
											nameKey="categoria"
											cx="50%"
											cy="50%"
											innerRadius={60}
											outerRadius={80}
											paddingAngle={5}
											stroke="none"
										>
											{data.gastosPorCategoria
												.slice(0, 6)
												.map((_: any, index: number) => (
													<Cell
														key={`cell-${index}`}
														fill={
															[
																"#6366f1",
																"#8b5cf6",
																"#a855f7",
																"#d946ef",
																"#ec4899",
																"#f43f5e",
															][index % 6]
														}
													/>
												))}
										</Pie>
										<RechartsTooltip
											formatter={(value: any) => fmtBRL(Number(value))}
											contentStyle={{
												backgroundColor: "#0f172a",
												border: "1px solid #312e81",
												borderRadius: "4px",
												color: "#c7d2fe",
												fontSize: "12px",
											}}
											itemStyle={{ color: "#c7d2fe" }}
										/>
									</RechartsPieChart>
								</ResponsiveContainer>
							</div>
							<div className="flex flex-wrap gap-2 mt-2">
								{data.gastosPorCategoria
									.slice(0, 6)
									.map((cat: any, index: number) => (
										<div
											key={index}
											className="flex items-center gap-1.5 text-[10px] text-indigo-300 bg-indigo-950/30 px-2 py-1 rounded-sm border border-indigo-900/50"
										>
											<div
												className="w-2 h-2 rounded-full"
												style={{
													backgroundColor: [
														"#6366f1",
														"#8b5cf6",
														"#a855f7",
														"#d946ef",
														"#ec4899",
														"#f43f5e",
													][index % 6],
												}}
											/>
											<span className="truncate max-w-30" title={cat.categoria}>
												{cat.categoria}
											</span>
										</div>
									))}
							</div>
						</div>
					)}

					{/* Top Categorias (Lista) */}
					{data.gastosPorCategoria?.length > 0 && (
						<div>
							<h3 className="text-xs uppercase font-bold text-indigo-500 mb-3 flex items-center gap-2 border-b border-indigo-900 pb-1">
								<TrendingUp className="w-3.5 h-3.5" /> Maiores Categorias
							</h3>
							<div className="space-y-3">
								{data.gastosPorCategoria
									.slice(0, 5)
									.map((cat: any, i: number) => {
										const pct = Math.round((cat.valor / maxCategoria) * 100);
										return (
											<div
												key={i}
												className="p-2 border border-indigo-900/50 bg-indigo-950/10"
											>
												<div className="flex justify-between text-xs mb-1.5">
													<span className="text-indigo-200 font-bold truncate max-w-55">
														{i + 1}. {cat.categoria}
													</span>
													<span className="text-indigo-300 font-bold shrink-0 ml-2">
														{fmtBRL(cat.valor)}
													</span>
												</div>
												<div className="w-full bg-indigo-950 h-1.5">
													<div
														className="h-full bg-linear-to-r from-violet-600 to-indigo-400 transition-all duration-700"
														style={{ width: `${pct}%` }}
													/>
												</div>
											</div>
										);
									})}
							</div>
						</div>
					)}

					{/* Evolução Mensal */}
					{data.gastosMensais?.length > 1 && (
						<div>
							<h3 className="text-xs uppercase font-bold text-indigo-500 mb-3 flex items-center gap-2 border-b border-indigo-900 pb-1">
								<TrendingUp className="w-3.5 h-3.5" /> Evolução Mensal
							</h3>
							<div className="h-40 w-full mt-4">
								<ResponsiveContainer width="100%" height="100%">
									<BarChart data={data.gastosMensais.slice(-12)}>
										<XAxis
											dataKey="mes"
											tickFormatter={(val) => val.split("-")[1] || ""}
											stroke="#4f46e5"
											fontSize={10}
											tickLine={false}
											axisLine={false}
										/>
										<RechartsTooltip
											cursor={{ fill: "#312e81", opacity: 0.4 }}
											formatter={(value: any) => [
												fmtBRL(Number(value)),
												"Gasto",
											]}
											labelFormatter={(label) => `Mês: ${label}`}
											contentStyle={{
												backgroundColor: "#0f172a",
												border: "1px solid #312e81",
												borderRadius: "4px",
												color: "#c7d2fe",
												fontSize: "12px",
											}}
										/>
										<Bar dataKey="valor" radius={[2, 2, 0, 0]}>
											{data.gastosMensais
												.slice(-12)
												.map((_: any, index: number) => (
													<Cell
														key={`cell-${index}`}
														fill="#6366f1"
														className="hover:fill-violet-500 transition-colors duration-300"
													/>
												))}
										</Bar>
									</BarChart>
								</ResponsiveContainer>
							</div>
						</div>
					)}

					{data.totalGastos === 0 && (
						<div className="p-4 border border-indigo-900/50 bg-indigo-950/10 text-indigo-500 text-xs text-center uppercase tracking-wide">
							Nenhum dado de despesas encontrado para este vereador.
						</div>
					)}
				</>
			)}
		</div>
	);
};
