"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FilterChip, Seg } from "@/components/ds";
import { useInvestigacao } from "@/components/investigacao/InvestigacaoProvider";
import { JobRibbon } from "@/components/investigacao/JobIndicadores";
import { AppShell, type Migalha } from "@/components/layout/AppShell";
import { construirCard } from "@/components/nodes/card-model";
import { NodeCard } from "@/components/nodes/NodeCard";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { type ShareData, ShareDialog } from "@/components/shared/ShareDialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useViewport } from "@/hooks/use-mobile";
import { alvoDosParams, urlDossie } from "@/lib/investigacao/alvo";
import { contarConexoes, prepararArestas } from "@/lib/investigacao/arestas";
import { resumirCota } from "@/lib/investigacao/cota";
import { contarDossie, type DossieNode } from "@/lib/investigacao/dossie-state";
import { problemasDeConexao } from "@/lib/investigacao/etapas";
import { exportarDossieDocx } from "@/lib/investigacao/exportar-cliente";
import { montarShareData } from "@/lib/investigacao/exportacao";
import type { Direcao } from "@/lib/investigacao/layout";
import { tituloCaso } from "@/lib/texto";
import { type AcaoNo, TIPOS_COM_INSPETOR } from "./acoes";
import { AvisosApi, avisoDoProblema, PainelErro, PainelHomonimos } from "./Avisos";
import { DossieCanvas, type DossieCanvasHandle } from "./DossieCanvas";
import { DossieUiCtx } from "./dossie-ui";
import { Inspetor } from "./Inspetor";
import { type FiltroRisco, filtrarAchados, ordenarEvidencias, Rail } from "./Rail";
import { ResumoCota } from "./ResumoCota";
import { RaioXPainel, useRaioX } from "./RaioX";

type VisaoMobile = "achados" | "despesas" | "rede";

function migalhasDoDossie(nome: string, ref?: string): Migalha[] {
	const m = ref?.match(/^FEDERAL:CAMARA:(\d+)$/);
	const base: Migalha[] = [{ label: "Início", href: "/" }];
	if (m) base.push({ label: "Perfil", href: `/perfil/deputado/${m[1]}?nome=${encodeURIComponent(nome)}` });
	return [...base, { label: `Dossiê · ${nome}` }];
}

/* ------------------------------------------------------------------ */
/* Estado e ações da tela (hook)                                      */
/* ------------------------------------------------------------------ */

function useDossieControle() {
	const params = useSearchParams();
	const router = useRouter();
	const inv = useInvestigacao();
	const { state } = inv;
	const d = state.dossie;
	const alvoUrl = useMemo(() => alvoDosParams(new URLSearchParams(params?.toString() ?? "")), [params]);
	const chaveAlvo = alvoUrl ? `${alvoUrl.ref ?? ""}|${alvoUrl.nome}|${alvoUrl.uf ?? ""}` : "";

	const canvasRef = useRef<DossieCanvasHandle>(null);
	const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
	const [destacado, setDestacado] = useState<string | null>(null);
	const [direcao, setDirecao] = useState<Direcao>("LR");
	const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
	const [share, setShare] = useState<ShareData | null>(null);
	const [exportando, setExportando] = useState(false);
	const raio = useRaioX();

	// Inicia, restaura ou segue a investigação do alvo da URL.
	useEffect(() => {
		if (!alvoUrl) {
			router.replace("/");
			return;
		}
		const alvo = { ...alvoUrl, uf: alvoUrl.uf ?? "FEDERAL" };
		if (!inv.restaurar(alvo)) void inv.iniciar(alvo);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [chaveAlvo]);

	// Mantém a URL em dia quando o alvo muda (homônimo escolhido).
	useEffect(() => {
		if (state.alvo?.ref && alvoUrl && state.alvo.ref !== alvoUrl.ref) router.replace(urlDossie(state.alvo));
	}, [state.alvo, alvoUrl, router]);

	const nodesView = useMemo(() => d.nodes.map((n) => ({ ...n, selected: n.id === selecionadoId })), [d.nodes, selecionadoId]);
	const edgesView = useMemo(() => prepararArestas(d.nodes, d.edges, selecionadoId), [d.nodes, d.edges, selecionadoId]);
	const ui = useMemo(() => ({ direcao, destacado, conexoes: contarConexoes(d.edges) }), [direcao, destacado, d.edges]);
	// No mobile as despesas de baixo risco (lista) também abrem o inspetor.
	const selecionado = selecionadoId ? (d.nodes.find((n) => n.id === selecionadoId) ?? d.evidencias.find((n) => n.id === selecionadoId)) : undefined;
	const resumoCota = useMemo(() => resumirCota(d.nodes, d.evidencias), [d.nodes, d.evidencias]);

	const focar = useCallback((id: string) => {
		setSelecionadoId(id);
		canvasRef.current?.focar(id);
	}, []);

	const aoAcao = (a: AcaoNo, n: DossieNode) => {
		const marcar = () => setExpandidos((s) => new Set(s).add(n.id));
		if (a.id === "pivot-cnpj" && a.arg) {
			marcar();
			void inv.pivotarCnpj(a.arg, n.id);
		} else if (a.id === "busca-reversa" && a.arg) {
			marcar();
			void inv.buscaReversa(a.arg, n.id);
		} else if (a.id === "toggle-emendas") inv.alternarEmendas(n.id);
		else if (a.id === "raio-x") void raio.abrir(a.arg ?? "");
	};

	const compartilhar = (n: DossieNode) => {
		const pessoa = d.nodes.find((x) => x.type === "PESSOA");
		setShare(montarShareData(pessoa, n.data ?? {}, String(n.type)));
	};

	const exportar = async () => {
		setExportando(true);
		try {
			await exportarDossieDocx(d.nodes, d.evidencias, state.alvo?.nome ?? "", state.alvo?.ref);
			toast.success("Dossiê DOCX gerado e baixado com sucesso.");
		} catch (e) {
			toast.error(`Erro ao exportar: ${(e as Error).message}`);
		} finally {
			setExportando(false);
		}
	};

	return {
		router, inv, state, d, alvoUrl, canvasRef, raio,
		selecionadoId, setSelecionadoId, selecionado, destacado, setDestacado,
		direcao, setDirecao, expandidos, share, setShare, exportando,
		nodesView, edgesView, ui, focar, aoAcao, compartilhar, exportar, resumoCota,
		rodando: d.status === "running",
		nome: tituloCaso(state.alvo?.nome ?? alvoUrl?.nome ?? "Dossiê"),
	};
}

type Controle = ReturnType<typeof useDossieControle>;

/* ------------------------------------------------------------------ */
/* Peças de tela                                                      */
/* ------------------------------------------------------------------ */

function BarraStatus({ c }: { c: Controle }) {
	const cont = contarDossie(c.state.dossie);
	const estado = c.rodando ? "investigação em andamento" : c.d.status === "done" ? "dossiê concluído" : c.d.status;
	return (
		<>
			<span>nós <b>{cont.nos}</b></span>
			<span className="pg-status__c">◆ críticos <b>{cont.criticos}</b></span>
			<span className="pg-status__w">▲ atenção <b>{cont.atencao}</b></span>
			<span>despesas no rail <b>{c.d.evidencias.length}</b></span>
			<span className="pg-status__sp" />
			<span>{estado}</span>
		</>
	);
}

function BotaoExportar({ c }: { c: Controle }) {
	return (
		<button type="button" className="pg-btn" disabled={c.exportando || c.d.nodes.length === 0 || c.rodando} onClick={c.exportar}>
			<PixelIcon name="download" size={14} />
			{c.exportando ? "Gerando…" : "Exportar dossiê"}
		</button>
	);
}

/** Avisos do servidor + fontes que não responderam (evento ETAPA); os dispensados somem. */
function useAvisos(c: Controle) {
	const [dispensados, setDispensados] = useState<Set<string>>(new Set());
	const problemas = problemasDeConexao(c.d.etapas, c.rodando).map(avisoDoProblema).filter((a) => !dispensados.has(a.fonte));
	const fechar = (fonte: string) => {
		setDispensados((s) => new Set(s).add(fonte));
		c.inv.descartarAviso(fonte);
	};
	return { avisos: [...c.d.warnings, ...problemas], fechar };
}

function Camadas({ c }: { c: Controle }) {
	const { d, inv, router } = c;
	const homonimos = d.candidatos && d.candidatos.length > 0 ? d.candidatos : null;
	const falhou = Boolean(d.erro) && d.status === "error" && d.nodes.length <= 1;
	const avisos = useAvisos(c);
	return (
		<>
			<AvisosApi avisos={avisos.avisos} onFechar={avisos.fechar} />
			{homonimos ? (
				<PainelHomonimos
					candidatos={homonimos}
					onEscolher={(x) => {
						inv.limparCandidatos();
						void inv.iniciar({ nome: x.nome, ref: x.ref, uf: c.state.alvo?.uf });
					}}
					onCancelar={() => router.push("/")}
				/>
			) : null}
			{falhou ? <PainelErro mensagem={d.erro} onTentar={() => void inv.recomecar()} onFechar={() => router.push("/")} /> : null}
		</>
	);
}

function InspetorDoNo({ c }: { c: Controle }) {
	if (!c.selecionado) return null;
	return (
		<Inspetor
			node={c.selecionado}
			nodes={c.d.nodes}
			edges={c.d.edges}
			jaExpandido={c.expandidos.has(c.selecionado.id)}
			ocupado={c.state.pivotando || c.rodando}
			onFechar={() => c.setSelecionadoId(null)}
			onSelecionar={c.focar}
			onCompartilhar={c.compartilhar}
			onAcao={c.aoAcao}
		/>
	);
}

interface CanvasDoDossieProps {
	c: Controle;
	mobile: boolean;
	comFaixa: boolean;
}

function CanvasDoDossie({ c, mobile, comFaixa }: CanvasDoDossieProps) {
	const { inv } = c;
	return (
		<DossieCanvas
			ref={c.canvasRef}
			nodes={c.nodesView}
			edges={c.edgesView}
			direcao={c.direcao}
			onDirecao={c.setDirecao}
			onNodesChange={(ch) => inv.onNodesChange(ch.filter((x) => x.type !== "select"))}
			onEdgesChange={inv.onEdgesChange}
			setNodes={inv.setNodes}
			onSelecionar={c.setSelecionadoId}
			onSoltarEvidencia={(id, pos) => inv.evidenciaParaCanvas(id, pos)}
			comFaixa={comFaixa}
			mobile={mobile}
			enquadrarAuto={c.rodando}
		/>
	);
}

function DossieDesktop({ c, inspetorAberto }: { c: Controle; inspetorAberto: boolean }) {
	return (
		<div className={`pg-graph${inspetorAberto ? " pg-graph--insp" : ""}`}>
			<Rail
				nodes={c.d.nodes}
				evidencias={c.d.evidencias}
				selecionadoId={c.selecionadoId}
				onSelecionar={c.focar}
				onDestacar={c.setDestacado}
				onAdicionarEvidencia={(id) => c.canvasRef.current?.adicionarEvidencia(id)}
				carregando={c.rodando}
				resumoCota={c.resumoCota}
			/>
			<div style={{ position: "relative", minWidth: 0, minHeight: 0, height: "100%" }}>
				<JobRibbon />
				<CanvasDoDossie c={c} mobile={false} comFaixa={c.d.status !== "idle"} />
				<Camadas c={c} />
			</div>
			{inspetorAberto ? <InspetorDoNo c={c} /> : null}
		</div>
	);
}

function ListaAchadosMobile({ c, filtro, onFiltro }: { c: Controle; filtro: FiltroRisco; onFiltro: (f: FiltroRisco) => void }) {
	const achados = useMemo(() => filtrarAchados(c.nodesView, filtro), [c.nodesView, filtro]);
	const vazio = c.rodando ? "Os achados aparecem aqui conforme as fontes respondem." : "Nenhum achado neste filtro.";
	return (
		<>
			<div className="pg-mchips" style={{ padding: "8px 12px" }}>
				<FilterChip pressed={filtro === "all"} onClick={() => onFiltro("all")}>Todos</FilterChip>
				<FilterChip pressed={filtro === "crit"} tone="crit" onClick={() => onFiltro("crit")}>◆ Crítico</FilterChip>
				<FilterChip pressed={filtro === "warn"} tone="warn" onClick={() => onFiltro("warn")}>▲ Atenção</FilterChip>
			</div>
			<div className="pg-mlist" style={{ flex: 1, overflow: "auto" }}>
				{achados.map((n) => (
					<NodeCard key={n.id} modelo={construirCard(n.type ?? "", n.data)} densidade="row" onClick={() => c.setSelecionadoId(n.id)} />
				))}
				{achados.length === 0 ? <p className="pg-empty">{vazio}</p> : null}
			</div>
		</>
	);
}

function ListaDespesasMobile({ c }: { c: Controle }) {
	const despesas = useMemo(() => ordenarEvidencias(c.d.evidencias), [c.d.evidencias]);
	const vazio = c.rodando ? "As despesas aparecem aqui conforme as fontes respondem." : "Nenhuma despesa de baixo risco.";
	return (
		<>
			{c.resumoCota ? <ResumoCota resumo={c.resumoCota} /> : null}
			<div className="pg-mlist" style={{ flex: 1, overflow: "auto" }}>
				{despesas.map((n) => (
					<NodeCard key={n.id} modelo={construirCard(n.type ?? "", n.data)} densidade="row" onClick={() => c.setSelecionadoId(n.id)} />
				))}
				{despesas.length === 0 ? <p className="pg-empty">{vazio}</p> : null}
			</div>
		</>
	);
}

interface ConteudoMobileProps {
	c: Controle;
	visao: VisaoMobile;
	filtro: FiltroRisco;
	onFiltro: (f: FiltroRisco) => void;
}

function ConteudoMobile({ c, visao, filtro, onFiltro }: ConteudoMobileProps) {
	if (visao === "achados") return <ListaAchadosMobile c={c} filtro={filtro} onFiltro={onFiltro} />;
	if (visao === "despesas") return <ListaDespesasMobile c={c} />;
	return (
		<div className="pg-mrede" style={{ flex: 1 }}>
			<CanvasDoDossie c={c} mobile comFaixa={false} />
		</div>
	);
}

function DossieMobile({ c }: { c: Controle }) {
	const [visao, setVisao] = useState<VisaoMobile>("achados");
	const [filtro, setFiltro] = useState<FiltroRisco>("all");
	return (
		<div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
			<JobRibbon fluxo />
			<div className="pg-msec" style={{ alignItems: "center" }}>
				<Seg<VisaoMobile>
					label="Visão do dossiê"
					value={visao}
					onChange={setVisao}
					options={[
						{ value: "achados", label: "Achados", icon: <PixelIcon name="list" size={14} /> },
						{ value: "despesas", label: `Despesas (${c.d.evidencias.length})`, icon: <PixelIcon name="dollar" size={14} /> },
						{ value: "rede", label: "Rede", icon: <PixelIcon name="graph" size={14} /> },
					]}
				/>
			</div>
			<ConteudoMobile c={c} visao={visao} filtro={filtro} onFiltro={setFiltro} />
			<div className="pg-mact">
				<BotaoExportar c={c} />
				<button
					type="button"
					className="pg-btn"
					onClick={() => {
						c.inv.limpar();
						c.router.push("/");
					}}
				>
					Nova busca
				</button>
			</div>
			<Camadas c={c} />
		</div>
	);
}

function Dialogos({ c, mobile }: { c: Controle; mobile: boolean }) {
	return (
		<>
			<ShareDialog open={c.share !== null} onOpenChange={(o) => !o && c.setShare(null)} data={c.share} isMobile={mobile} />
			<RaioXPainel estado={c.raio.estado} onFechar={c.raio.fechar} mobile={mobile} />
		</>
	);
}

function SheetDoInspetor({ c, aberto }: { c: Controle; aberto: boolean }) {
	return (
		<Drawer open={aberto} onOpenChange={(o) => !o && c.setSelecionadoId(null)}>
			<DrawerContent className="pg-msheet">
				<DrawerTitle className="sr-only">Detalhes do achado</DrawerTitle>
				<DrawerDescription className="sr-only">Informações do nó selecionado</DrawerDescription>
				<InspetorDoNo c={c} />
			</DrawerContent>
		</Drawer>
	);
}

function DossieInner() {
	const c = useDossieControle();
	const vp = useViewport();
	if (!vp) return null;
	const mobile = vp === "mobile";
	const inspetorAberto = Boolean(c.selecionado && TIPOS_COM_INSPETOR.has(c.selecionado.type ?? ""));

	return (
		<DossieUiCtx.Provider value={c.ui}>
			<AppShell
				migalhas={migalhasDoDossie(c.nome, c.state.alvo?.ref)}
				acoes={<BotaoExportar c={c} />}
				status={<BarraStatus c={c} />}
				tituloMobile={{ titulo: c.nome, subtitulo: "Dossiê" }}
				voltarHref="/"
				jobJaVisto
			>
				{mobile ? <DossieMobile c={c} /> : <DossieDesktop c={c} inspetorAberto={inspetorAberto} />}
				{mobile ? <SheetDoInspetor c={c} aberto={inspetorAberto} /> : null}
				<Dialogos c={c} mobile={mobile} />
			</AppShell>
		</DossieUiCtx.Provider>
	);
}

export function DossieView(): ReactNode {
	return (
		<ReactFlowProvider>
			<DossieInner />
		</ReactFlowProvider>
	);
}
