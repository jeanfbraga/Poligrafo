"use client";

import { useCallback, useState } from "react";
import {
	Bar,
	BarChart,
	Cell,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip as RechartsTooltip,
	XAxis,
} from "recharts";
import { Kv, Label, PixelBar, Spinner, Tag } from "@/components/ds";
import { ESTILO_TOOLTIP, ESTILO_TOOLTIP_ITEM, ESTILO_TOOLTIP_ROTULO } from "@/components/ds/chart-tooltip";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { brl } from "@/lib/format";
import { tituloCaso } from "@/lib/texto";

type Dados = Record<string, any>;

/** Paleta de categorias: tons neutros do sistema (sem cores de risco). */
const PALETA = ["#9db4cc", "#3dff8b", "#4fd8e6", "#b69cff", "#7fd39b", "#4f9b6c"];

export interface EstadoRaioX {
	aberto: boolean;
	nome: string;
	carregando: boolean;
	dados: Dados | null;
}

/** Busca o Raio-X (cota de gabinete CMRJ) sob demanda. */
export function useRaioX() {
	const [estado, setEstado] = useState<EstadoRaioX>({ aberto: false, nome: "", carregando: false, dados: null });

	const abrir = useCallback(async (nome: string) => {
		setEstado({ aberto: true, nome, carregando: true, dados: null });
		try {
			const res = await fetch(`/api/investigar/estados/rj/dashboard-cota?nome=${encodeURIComponent(nome)}`);
			const dados = res.ok ? await res.json() : { error: "Falha ao carregar dados." };
			setEstado((s) => ({ ...s, carregando: false, dados }));
		} catch {
			setEstado((s) => ({ ...s, carregando: false, dados: { error: "Erro de rede." } }));
		}
	}, []);

	const fechar = useCallback(() => setEstado((s) => ({ ...s, aberto: false })), []);
	return { estado, abrir, fechar };
}

function GraficoCategorias({ categorias }: { categorias: Dados[] }) {
	if (!categorias?.length) return null;
	const top = categorias.slice(0, 6);
	return (
		<div className="pg-insp__sec">
			<Label>Gastos por categoria</Label>
			<div style={{ height: 240, width: "100%" }}>
				<ResponsiveContainer width="100%" height="100%">
					<PieChart>
						<Pie data={top} dataKey="valor" nameKey="categoria" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={4} stroke="none">
							{top.map((_, i) => (
								<Cell key={i} fill={PALETA[i % PALETA.length]} />
							))}
						</Pie>
						<RechartsTooltip formatter={(v) => brl(Number(v))} contentStyle={ESTILO_TOOLTIP} itemStyle={ESTILO_TOOLTIP_ITEM} labelStyle={ESTILO_TOOLTIP_ROTULO} />
					</PieChart>
				</ResponsiveContainer>
			</div>
			<div className="pg-chiprow">
				{top.map((c, i) => (
					<span key={i} className="pg-tag" title={c.categoria}>
						<i style={{ width: 8, height: 8, background: PALETA[i % PALETA.length], display: "inline-block" }} />
						<span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{c.categoria}</span>
					</span>
				))}
			</div>
		</div>
	);
}

function MaioresCategorias({ categorias, max }: { categorias: Dados[]; max: number }) {
	if (!categorias?.length) return null;
	return (
		<div className="pg-insp__sec">
			<Label>Maiores categorias</Label>
			{categorias.slice(0, 5).map((c, i) => (
				<div key={i} className="pg-stack">
					<div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
						<b style={{ color: "var(--pg-ink-1)", fontSize: "var(--pg-t-sm)" }}>
							{i + 1}. {c.categoria}
						</b>
						<span style={{ color: "var(--pg-ink-1)" }}>{brl(c.valor)}</span>
					</div>
					<PixelBar value={Math.round((c.valor / max) * 100)} size="sm" label={c.categoria} />
				</div>
			))}
		</div>
	);
}

function EvolucaoMensal({ meses }: { meses: Dados[] }) {
	if (!meses || meses.length <= 1) return null;
	const ultimos = meses.slice(-12);
	return (
		<div className="pg-insp__sec">
			<Label>Evolução mensal</Label>
			<div style={{ height: 160, width: "100%" }}>
				<ResponsiveContainer width="100%" height="100%">
					<BarChart data={ultimos}>
						<XAxis dataKey="mes" tickFormatter={(v: string) => v.split("-")[1] || ""} stroke="#4f9b6c" fontSize={10} tickLine={false} axisLine={false} />
						<RechartsTooltip
							cursor={{ fill: "#102a1a", opacity: 0.6 }}
							formatter={(v) => [brl(Number(v)), "Gasto"]}
							labelFormatter={(l) => `Mês: ${l}`}
							contentStyle={ESTILO_TOOLTIP} itemStyle={ESTILO_TOOLTIP_ITEM} labelStyle={ESTILO_TOOLTIP_ROTULO}
						/>
						<Bar dataKey="valor" radius={0} fill="#3dff8b" fillOpacity={0.8} />
					</BarChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
}

function Resultado({ dados }: { dados: Dados }) {
	const max = dados.gastosPorCategoria?.[0]?.valor || 1;
	return (
		<>
			<Kv items={[{ key: "tot", label: "Total gasto (mandato atual)", value: brl(dados.totalGastos || 0), big: true }, { key: "n", label: "Registros", value: `${dados.totalNotas || 0} despesas analisadas` }]} />
			<GraficoCategorias categorias={dados.gastosPorCategoria} />
			<MaioresCategorias categorias={dados.gastosPorCategoria} max={max} />
			<EvolucaoMensal meses={dados.gastosMensais} />
			{dados.totalGastos === 0 ? <p className="pg-empty">Nenhum dado de despesas encontrado para este vereador.</p> : null}
		</>
	);
}

/** Conteúdo do Raio-X de gastos (cota de gabinete). */
export function RaioXConteudo({ estado }: { estado: EstadoRaioX }) {
	const { nome, carregando, dados } = estado;
	return (
		<div className="pg-insp__scroll" style={{ padding: 16 }}>
			<div className="pg-stack">
				<Tag>Cota de gabinete · CMRJ</Tag>
				<h3 style={{ color: "var(--pg-ink-1)" }}>{tituloCaso(nome)}</h3>
				{!carregando && dados?.periodo ? <p className="pg-label">Período processado: {dados.periodo}</p> : null}
			</div>
			<div className="pg-riskbox pg-riskbox--warn">
				<div className="pg-riskbox__row">
					<span>▲ Limitação de transparência</span>
				</div>
				<p>
					O portal da Câmara Municipal do Rio publica só o valor bruto mensal por categoria: não divulga o detalhamento dos
					pagamentos, os fornecedores nem as notas fiscais em formato aberto.
				</p>
			</div>
			{carregando ? (
				<p className="pg-empty">
					<Spinner /> Extraindo matriz de despesas da CMRJ…
				</p>
			) : null}
			{!carregando && dados?.error ? <div className="pg-riskbox pg-riskbox--crit"><p>◆ {dados.error}</p></div> : null}
			{!carregando && dados && !dados.error ? <Resultado dados={dados} /> : null}
		</div>
	);
}

/** Raio-X em sheet lateral (desktop) ou drawer (mobile). */
export function RaioXPainel({ estado, onFechar, mobile }: { estado: EstadoRaioX; onFechar: () => void; mobile: boolean }) {
	if (mobile) {
		return (
			<Drawer open={estado.aberto} onOpenChange={(o) => !o && onFechar()}>
				<DrawerContent>
					<DrawerTitle className="sr-only">Raio-X de gastos</DrawerTitle>
					<DrawerDescription className="sr-only">Dashboard de cota de gabinete</DrawerDescription>
					<div className="pg-drawer__body">
						<RaioXConteudo estado={estado} />
					</div>
				</DrawerContent>
			</Drawer>
		);
	}
	return (
		<Sheet open={estado.aberto} onOpenChange={(o) => !o && onFechar()}>
			<SheetContent style={{ width: "min(100%, 560px)" }}>
				<SheetTitle className="sr-only">Raio-X de gastos</SheetTitle>
				<SheetDescription className="sr-only">Dashboard de cota de gabinete</SheetDescription>
				<RaioXConteudo estado={estado} />
			</SheetContent>
		</Sheet>
	);
}
