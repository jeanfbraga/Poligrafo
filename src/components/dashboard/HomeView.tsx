"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { KStats, Panel, RankRow } from "@/components/ds";
import { AppShell, useShell } from "@/components/layout/AppShell";
import { useViewport } from "@/hooks/use-mobile";
import { calcularKpi, type HomeData, percentuaisRelativos, rotaDoRanking } from "@/lib/dashboard-home";
import { brlCurto, percentual } from "@/lib/format";
import { textoDePresenca } from "@/lib/frequencia";
import { formatName } from "@/lib/utils";
import { AnimatedNumber } from "./AnimatedNumber";
import { UfPainel } from "./UfPainel";

type Estado = "carregando" | "erro" | "ok";

interface ItemRanking {
	nome: string;
	sub?: string;
	valor: number;
	texto: string;
	rota?: string;
}

/** Painel de ranking com os estados de carregamento, erro e vazio. */
function PainelRanking({ titulo, sub, itens, estado }: { titulo: string; sub: string; itens: ItemRanking[]; estado: Estado }) {
	const router = useRouter();
	const pct = percentuaisRelativos(itens.map((i) => i.valor));
	let corpo: ReactNode;
	if (estado === "carregando") corpo = <p className="pg-empty">Carregando…</p>;
	else if (estado === "erro") corpo = <p className="pg-empty" style={{ color: "var(--pg-crit)" }}>Falha ao decodificar dados.</p>;
	else if (itens.length === 0) corpo = <p className="pg-empty">Sem registros.</p>;
	else {
		corpo = itens.map((it, i) => (
			<RankRow
				key={`${it.nome}-${i}`}
				pos={i + 1}
				name={it.nome}
				sub={it.sub}
				value={it.texto}
				percent={pct[i]}
				onClick={it.rota ? () => router.push(it.rota as string) : undefined}
			/>
		));
	}
	return (
		<Panel title={titulo} sub={sub} flush>
			{corpo}
		</Panel>
	);
}

function perfilDe(nome: string, id?: number | string, uf?: string, partido?: string, cargo?: string) {
	const temPartido = partido && partido !== "N/A";
	return {
		nome: formatName(nome),
		sub: temPartido ? `${partido}·${uf ?? ""}` : undefined,
		rota: temPartido || id ? rotaDoRanking({ nome, id, uf, partido, cargo }) : undefined,
	};
}

type LinhaPresenca = NonNullable<HomeData["menosPresentes"]>[number];

/** "25/92 sess. · 27%" quando há taxa (sessões desde a entrada em exercício); senão o formato antigo. */
function textoDaPresenca(i: LinhaPresenca, totalSessoes: number | null): string {
	if (i.sessoes !== undefined && i.taxa !== undefined) return textoDePresenca(i.presencas, i.sessoes, i.taxa);
	return totalSessoes ? `${i.presencas}/${totalSessoes} sess.` : `${i.presencas} sess.`;
}
function itensDe(d: HomeData | null) {
	const ceap = (d?.ceapTop10 ?? []).slice(0, 8).map((i) => ({
		...perfilDe(i.nome, i.id_deputado, i.uf, i.partido, i.cargo),
		valor: i.total_gasto,
		texto: brlCurto(i.total_gasto),
	}));
	const presenca = (d?.menosPresentes ?? []).slice(0, 8).map((i) => ({
		...perfilDe(i.nome, i.id_deputado, i.uf, i.partido, i.cargo),
		valor: i.taxa !== undefined ? Math.round(i.taxa * 100) : i.presencas,
		texto: textoDaPresenca(i, d?.totalSessoes ?? null),
	}));
	const categorias = (d?.ceapCategorias ?? []).slice(0, 5).map((i) => ({
		nome: i.tipo_despesa ? i.tipo_despesa.charAt(0).toUpperCase() + i.tipo_despesa.slice(1).toLowerCase() : "Outros",
		valor: Number(i.total_gasto) || 0,
		texto: brlCurto(i.total_gasto),
	}));
	const emendas = (d?.emendasTop10 ?? []).slice(0, 8).map((i) => ({
		...perfilDe(i.autor, i.id_deputado, i.uf, i.partido, i.cargo),
		valor: i.total_pix,
		texto: brlCurto(i.total_pix),
	}));
	const emendasUf = (d?.emendasUF ?? [])
		.filter((i) => i.uf_destino?.toUpperCase() !== "MÚLTIPLO")
		.slice(0, 8)
		.map((i) => ({ nome: i.uf_destino, valor: i.total_pix, texto: brlCurto(i.total_pix) }));
	const buscas = (d?.pesquisas ?? []).slice(0, 8).map((i) => ({
		...perfilDe(i.termo, i.id_deputado, i.uf, i.partido, i.cargo),
		rota: rotaDoRanking({ nome: i.termo, id: i.id_deputado, uf: i.uf, partido: i.partido, cargo: i.cargo }),
		valor: i.quantidade,
		texto: `${i.quantidade} buscas`,
	}));
	return { ceap, presenca, categorias, emendas, emendasUf, buscas };
}

function Kpi({ d, carregando }: { d: HomeData | null; carregando: boolean }) {
	const k = calcularKpi(d);
	return (
		<div className="pg-kpi">
			<p className="pg-label">&gt; GASTO_EM_COTA_PARLAMENTAR :: {k.ano}</p>
			<div className="pg-kpi__n">{carregando ? "CARREGANDO…" : <AnimatedNumber value={k.total} prefix="R$ " isCurrency />}</div>
			{carregando ? null : (
				<KStats
					items={[
						{ key: "conc", label: "Concentração top 10", value: k.concentracaoTop10 > 0 ? percentual(k.concentracaoTop10) : "—" },
						{ key: "media", label: "Média do top 10", value: brlCurto(k.mediaTop10) },
						{ key: "pix", label: "Emendas Pix, top 10", value: brlCurto(k.somaPixTop10) },
					]}
					cols={3}
				/>
			)}
		</div>
	);
}

function BuscaMobileHome() {
	const { abrirBusca } = useShell();
	return (
		<button type="button" className="pg-msearch" onClick={abrirBusca}>
			<span>nome do político</span>
			<span className="pg-msearch__scp">busca</span>
		</button>
	);
}

/** Home: KPI do ano, gasto por estado (pódio + mapa) e rankings. */
export function HomeView() {
	const vp = useViewport();
	const [dados, setDados] = useState<HomeData | null>(null);
	const [estado, setEstado] = useState<Estado>("carregando");

	useEffect(() => {
		fetch("/api/dashboard/home")
			.then((r) => r.json())
			.then((d: HomeData) => {
				setDados(d);
				setEstado("ok");
			})
			.catch(() => setEstado("erro"));
	}, []);

	if (!vp) return null;
	const mobile = vp === "mobile";
	const it = itensDe(dados);
	const multiplo = dados?.emendasUF?.find((i) => i.uf_destino?.toUpperCase() === "MÚLTIPLO");
	const semUf = estado === "ok" && Object.keys(dados?.ceapEstados ?? {}).length === 0;

	return (
		<AppShell migalhas={[{ label: "Início" }]} status={<span>fonte: dados abertos da Câmara, Senado e Transferegov</span>}>
			<div className="pg-view">
				<div className="pg-view__inner">
					{mobile ? <BuscaMobileHome /> : null}
					<Kpi d={dados} carregando={estado === "carregando"} />
					<div className="pg-home-grid">
						<div className="pg-uf pg-panel">
							<div className="pg-panel__head">
								<div className="pg-panel__title">
									Campeonato estadual de gastos
									<span className="pg-panel__sub">Mapa de calor por UF · cota acumulada desde jan/2025</span>
								</div>
							</div>
							{semUf ? <p className="pg-empty">Sem registros.</p> : <UfPainel ceapEstados={dados?.ceapEstados} mobile={mobile} />}
						</div>
						<PainelRanking titulo="Deputados que mais gastaram" sub="Cota do ano · acumulado" itens={it.ceap} estado={estado} />
						<PainelRanking titulo="Menos presentes" sub="Sessões deliberativas · últimos 90 dias" itens={it.presenca} estado={estado} />
						<PainelRanking titulo="Categorias de gasto" sub="Top 5 · desde jan/2024" itens={it.categorias} estado={estado} />
						<PainelRanking titulo="Maiores emendas Pix" sub="Valores pagos · todos os anos" itens={it.emendas} estado={estado} />
						<PainelRanking
							titulo="Emendas Pix por estado"
							sub={multiplo ? `Destinação · múltiplas regiões: ${brlCurto(multiplo.total_pix)}` : "Destinação · valores pagos"}
							itens={it.emendasUf}
							estado={estado}
						/>
						<PainelRanking titulo="Mais investigados" sub="Pelos usuários do Polígrafo" itens={it.buscas} estado={estado} />
					</div>
				</div>
			</div>
		</AppShell>
	);
}
