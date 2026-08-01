"use client";

/* eslint-disable complexity */

import {
	addEdge,
	Background,
	BackgroundVariant,
	type Connection,
	Controls,
	type Edge,
	MiniMap,
	type Node,
	ReactFlow,
	ReactFlowProvider,
	useEdgesState,
	useNodesState,
	useReactFlow,
} from "@xyflow/react";
import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { CrtTurnOn } from "@/components/ui/crt-turn-on";
import { ScrambleText } from "@/components/ui/scramble-text";
import { HomeDashboard } from "@/components/dashboard/HomeDashboard";
import MobileView from "@/components/layout/MobileView";
import SearchBar from "@/components/search/SearchBar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import congressoIndex from "@/services/integrations/data/congresso-index.json";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDateOnly } from "@/lib/utils";
import "@xyflow/react/dist/style.css";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
	AlertTriangle,
	Briefcase,
	Building2,
	DollarSign,
	Download,
	FileText,
	Landmark,
	Loader2,
	Map as MapIcon,
	MapPin,
	Search,
	ShieldAlert,
	Terminal,
	User,
	Users,
	X,
} from "lucide-react";
import { toast } from "sonner";
import { Drawer } from "vaul";
import AnimatedEdge from "@/components/edges/AnimatedEdge";
import {
	AIProgressBar,
	ContratoNode,
	DashboardCotaConteudo,
	DespesaNode,
	EmendaNode,
	EmendaResumoNode,
	EmpresaNode,
	OrgaoNode,
	PessoaNode,
	ProcessoJudicialNode,
	RaioXGastosNode,
	SocioNode,
} from "@/components/nodes";
import { type ShareData, ShareDialog } from "@/components/shared/ShareDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useAutoLayout } from "@/hooks/useAutoLayout";
import { getPortalTransparenciaFallback } from "@/lib/utils";

// ==========================================
// Node components moved to @/components/nodes
// See: components/nodes/index.ts (barrel re-export)
// ==========================================

// ==========================================
// 2. Componente Principal (DashboardArea)
// ==========================================

function DashboardArea() {
	const isMobile = useIsMobile();
	// Estado do Grafo
	const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
	const { screenToFlowPosition, fitView, getNodes } = useReactFlow();

	// Hook anti-sobreposição e layout inteligente
	useAutoLayout(nodes, edges);

	// Habilita a ligação manual entre qualquer nó pelo usuário
	const onConnect = useCallback(
		(params: Connection) =>
			setEdges((eds) =>
				addEdge(
					{
						...params,
						animated: true,
						style: { stroke: "#4ade80", strokeWidth: 2 },
					},
					eds,
				),
			),
		[setEdges],
	);

	// Estado da Sidebar (Polígrafo)
	const [evidencias, setEvidencias] = useState<any[]>([]);

	// Estados da UI
	const [isShareOpen, setIsShareOpen] = useState(false);
	const [shareData, setShareData] = useState<ShareData | null>(null);
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedUf, setSelectedUf] = useState<string>(""); // Alçada selecionada ('FEDERAL' | sigla | '')

	const [isLoading, setIsLoading] = useState(false);
	const [errorMsg, setErrorMsg] = useState("");
	const [apiWarnings, setApiWarnings] = useState<
		{ fonte: string; mensagem: string }[]
	>([]);
	const [selectedNode, setSelectedNode] = useState<any>(null);

	// Reference for handleSearch so we can use it inside the event listener without re-adding it
	const handleSearchRef = useRef<Function | null>(null);

	useEffect(() => {
		const handlePoligrafoSearch = (e: any) => {
			const { nome, id, casa } = e.detail;
			setSearchTerm(nome);
			setSelectedUf("FEDERAL");
			const refOverride = e.detail.ref
				? e.detail.ref
				: id && casa
					? `FEDERAL:${casa}:${id}`
					: undefined;
			if (handleSearchRef.current) {
				handleSearchRef.current(refOverride, nome, "FEDERAL");
				window.scrollTo({ top: 0, behavior: "smooth" });
			}
		};

		window.addEventListener("poligrafo:search", handlePoligrafoSearch);
		return () =>
			window.removeEventListener("poligrafo:search", handlePoligrafoSearch);
	}, []);
	const [beneficiaryContracts, setBeneficiaryContracts] = useState<any[]>([]);
	const [loadingBeneficiaryContracts, setLoadingBeneficiaryContracts] =
		useState<boolean>(false);

	// Dashboard de Gastos (Cota de Gabinete CMRJ)
	const [dashboardOpen, setDashboardOpen] = useState(false);
	const [dashboardData, setDashboardData] = useState<any>(null);
	const [dashboardLoading, setDashboardLoading] = useState(false);
	const [dashboardNome, setDashboardNome] = useState<string>("");

	useEffect(() => {
		handleSearchRef.current = handleSearch;
	});

	const handleOpenDashboard = React.useCallback(
		async (nomeVereador: string) => {
			setDashboardNome(nomeVereador);
			setDashboardOpen(true);
			setDashboardLoading(true);
			setDashboardData(null);
			try {
				const res = await fetch(
					`/api/investigar/estados/rj/dashboard-cota?nome=${encodeURIComponent(nomeVereador)}`,
				);
				if (res.ok) {
					const json = await res.json();
					setDashboardData(json);
				} else {
					setDashboardData({ error: "Falha ao carregar dados." });
				}
			} catch (_e) {
				setDashboardData({ error: "Erro de rede." });
			} finally {
				setDashboardLoading(false);
			}
		},
		[],
	);

	useEffect(() => {
		setBeneficiaryContracts([]);
		setLoadingBeneficiaryContracts(false);
	}, []);

	const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>(
		{},
	);
	const [abortController, setAbortController] =
		useState<AbortController | null>(null);
	const [statusMessage, setStatusMessage] = useState<string>(
		"Insira o nome de um político para começar a investigar.",
	);
	const [displayedStatus, setDisplayedStatus] = useState<string>(""); // Texto que realmente aparece na tela
	const [isTyping, setIsTyping] = useState<boolean>(false); // Controle da animação

	// Estado de Busca e autocomplete foram migrados para o componente SearchBar

	// NODE BATCHING PARA PERFORMANCE (Throttling do React Flow)
	const nodesToAddBuffer = React.useRef<Node[]>([]);
	const edgesToAddBuffer = React.useRef<Edge[]>([]);
	// REF PERSISTENTE: Guarda o ID do nó PESSOA entre flushes do buffer (resolve o bug de edges desconectados)
	const pessoaNodeIdRef = React.useRef<string | null>(null);
	// REFs para layout radial de emendas ao redor do Hub
	const emendaHubIdRef = React.useRef<string | null>(null);
	const emendaRadialCount = React.useRef<number>(0);

	React.useEffect(() => {
		const interval = setInterval(() => {
			if (nodesToAddBuffer.current.length > 0) {
				const nodesSnapshot = [...nodesToAddBuffer.current];
				nodesToAddBuffer.current = [];

				setNodes((prev) => {
					const prevMap: Map<string, Node> = new Map(
						prev.map((n) => [n.id, n as any]),
					);
					nodesSnapshot.forEach((n: Node) => {
						if (prevMap.has(n.id)) {
							// Update existing node with fresh data
							const existing = prevMap.get(n.id)!;
							prevMap.set(n.id, {
								...existing,
								data: { ...existing.data, ...n.data },
							});
						} else {
							// Add new node
							prevMap.set(n.id, n);
						}
					});
					return Array.from(prevMap.values());
				});
			}
			if (edgesToAddBuffer.current.length > 0) {
				const edgesSnapshot = [...edgesToAddBuffer.current];
				edgesToAddBuffer.current = [];

				setEdges((prev) => {
					const prevMap = new Map(prev.map((e: Edge) => [e.id, e]));
					edgesSnapshot.forEach((e: Edge) => {
						prevMap.set(e.id, e);
					});
					return Array.from(prevMap.values());
				});
			}
		}, 500); // Batches de render a cada meio segundo
		return () => clearInterval(interval);
	}, [setNodes, setEdges]);

	React.useEffect(() => {
		if (!statusMessage) return;

		setIsTyping(true);
		setDisplayedStatus("");
		let i = 0;

		const typingInterval = setInterval(() => {
			if (i <= statusMessage.length) {
				// Use slice to avoid missing/duplicated characters from React Concurrent Mode race conditions
				setDisplayedStatus(statusMessage.slice(0, i));
				i++;
			} else {
				clearInterval(typingInterval);
				setIsTyping(false);
			}
		}, 25); // Velocidade da digitação (25ms = terminal bem rápido, mas legível)

		return () => clearInterval(typingInterval);
	}, [statusMessage]);
	const [candidatosHomonimos, setCandidatosHomonimos] = useState<any[] | null>(
		null,
	);

	const handleShareClick = useCallback(
		(nodeData: any, type: string) => {
			const pessoaNode = getNodes().find((n: Node) => n.type === "PESSOA");
			const getValor = () => {
				if (nodeData.valor !== undefined) return Number(nodeData.valor);
				if (nodeData._empenhado !== undefined)
					return Number(nodeData._empenhado);
				return undefined;
			};
			setShareData({
				politicoNome: String(
					(pessoaNode?.data as any)?.label || "Desconhecido",
				),
				politicoCargo: String((pessoaNode?.data as any)?.cargo || "Político"),
				politicoUf: String((pessoaNode?.data as any)?.uf || "BR"),
				politicoFoto: (pessoaNode?.data as any)?.urlFoto || undefined,
				achadoTipo: type,
				achadoValor: getValor(),
				achadoTitulo:
					nodeData.label || nodeData.objeto || "Registro Encontrado",
				achadoScore: nodeData.score_letalidade || undefined,
				achadoData: nodeData.dataDocumento || undefined,
				achadoMotivo: nodeData.motivo_ia || undefined,
				achadoFonteUrl:
					nodeData.urlDocumento ||
					nodeData.url_documento ||
					nodeData.link_documento ||
					undefined,
			});
			setIsShareOpen(true);
		},
		[getNodes],
	);

	const handleToggleEmendas = useCallback(
		(hubId: string) => {
			setNodes((nds) => {
				const hubNode = nds.find((n) => n.id === hubId);
				if (!hubNode) return nds;
				const wasExpanded = !!hubNode.data?.isExpanded;
				const nextExpanded = !wasExpanded;

				const updatedNodes = nds.map((n) => {
					if (n.id === hubId) {
						return { ...n, data: { ...n.data, isExpanded: nextExpanded } };
					}
					if (n.type === "EMENDA" && n.id.startsWith("emenda-")) {
						return { ...n, hidden: !nextExpanded };
					}
					return n;
				});

				setEdges((eds) =>
					eds.map((e) => {
						if (e.source === hubId && e.id.startsWith("edge-emenda-hub-")) {
							return { ...e, hidden: !nextExpanded };
						}
						return e;
					}),
				);

				return updatedNodes;
			});
		},
		[setNodes, setEdges],
	);

	const nodeTypes = useMemo(
		() => ({
			PESSOA: PessoaNode,
			DESPESA: (props: any) => (
				<DespesaNode
					{...props}
					data={{ ...props.data, onShare: handleShareClick }}
				/>
			),
			CONTRATO: (props: any) => (
				<ContratoNode
					{...props}
					data={{ ...props.data, onShare: handleShareClick }}
				/>
			),
			EMENDA: (props: any) => (
				<EmendaNode
					{...props}
					data={{ ...props.data, onShare: handleShareClick }}
				/>
			),
			EMENDA_RESUMO: (props: any) => (
				<EmendaResumoNode
					{...props}
					data={{ ...props.data, onOpenDashboard: handleOpenDashboard }}
				/>
			),
			EMPRESA: (props: any) => (
				<EmpresaNode
					{...props}
					data={{ ...props.data, onShare: handleShareClick }}
				/>
			),
			SOCIO: SocioNode,
			ORGAO: OrgaoNode,
			PROCESSO_JUDICIAL: (props: any) => (
				<ProcessoJudicialNode
					{...props}
					data={{ ...props.data, onShare: handleShareClick }}
				/>
			),
			RESUMO_GASTOS: (props: any) => (
				<RaioXGastosNode
					{...props}
					data={{ ...props.data, onOpenDashboard: handleOpenDashboard }}
				/>
			),
		}),
		[handleShareClick, handleOpenDashboard],
	);

	const edgeTypes = useMemo(
		() => ({
			default: AnimatedEdge,
			smoothstep: AnimatedEdge,
		}),
		[],
	);

	const handlePivotCNPJ = async (cnpj: string, origemId: string) => {
		if (abortController) abortController.abort();
		const controller = new AbortController();
		setAbortController(controller);

		setIsLoading(true);
		setStatusMessage(`Quebrando sigilo societário do CNPJ ${cnpj}...`);

		// Liga o loading state no nó específico que está sofrendo drilldown
		setNodes((nds) =>
			nds.map((n) =>
				n.id === origemId
					? { ...n, data: { ...n.data, isSearching: true } }
					: n,
			),
		);

		try {
			const response = await fetch(
				`/api/investigar/cnpj?cnpj=${cnpj}&origemId=${origemId}`,
				{ signal: controller.signal },
			);
			if (!response.body) throw new Error("Falha no stream.");
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			const localPositions = new Map<string, { x: number; y: number }>();
			nodes.forEach((n) => localPositions.set(n.id, n.position));
			const childCounts = new Map<string, number>();

			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const dataStr = line.replace("data: ", "");
						try {
							const event = JSON.parse(dataStr);

							if (event.tipo === "STATUS") {
								setStatusMessage(event.payload.msg);

								// Injeta a mensagem em tempo real para os nós que estão em estado de loading
								setNodes((nds) =>
									nds.map((n) =>
										n.data?.isSearching
											? {
												...n,
												data: { ...n.data, currentStatus: event.payload.msg },
											}
											: n,
									),
								);
							} else if (event.tipo === "ERROR") {
								setErrorMsg(event.payload.mensagem);
								setIsLoading(false);
							} else if (event.tipo === "DONE") {
								setStatusMessage(event.payload.msg);
								setIsLoading(false);
							} else if (event.tipo === "NODE_NOVO") {
								const nodeParams = event.payload;

								// Posição Dinâmica com Evitação de Sobreposição
								const parentPos = localPositions.get(nodeParams._origemId);
								const baseX = parentPos ? parentPos.x : window.innerWidth / 2;
								const baseY = parentPos ? parentPos.y : 150;

								const parentId = nodeParams._origemId || "root";
								const siblingsSoFar = childCounts.get(parentId) || 0;
								childCounts.set(parentId, siblingsSoFar + 1);

								const spacingX = nodeParams.type === "SOCIO" ? 280 : 360;
								const spacingY = nodeParams.type === "CONTRATO" ? -50 : 250;

								let multiplier = 0;
								if (siblingsSoFar > 0) {
									multiplier =
										(siblingsSoFar % 2 !== 0 ? -1 : 1) *
										Math.ceil(siblingsSoFar / 2);
								}

								let px = baseX + multiplier * spacingX;
								let py = baseY + spacingY;

								if (nodeParams.type === "CONTRATO") {
									// Joga os contratos pro lado
									px = baseX + 380 + Math.random() * 40;
									py = baseY + siblingsSoFar * 130;
								}

								nodeParams.position = { x: px, y: py };
								localPositions.set(nodeParams.id, { x: px, y: py });

								// PREVINE DUPLICAÇÃO DE NÓ NO DRILLDOWN
								nodesToAddBuffer.current.push(nodeParams);
								// Conecta automaticamente
								if (nodeParams._origemId) {
									let edgeColor =
										nodeParams.type === "SOCIO" ? "#a855f7" : "#3b82f6";
									let edgeLabel =
										nodeParams.type === "SOCIO" ? "SÓCIO (QSA)" : "FORNECEDOR";
									const isAnimated = true;
									// VERIFICAÇÃO DE NEPOTISMO CRUZADO
									if (nodeParams.type === "SOCIO") {
										const pessoaNode =
											nodesToAddBuffer.current.find(
												(n: Node) => n.type === "PESSOA",
											) || nodes.find((n: Node) => n.type === "PESSOA");
										if (pessoaNode?.data?.nomeCivil) {
											const nomePoliticoArr = String(pessoaNode.data.nomeCivil)
												.trim()
												.split(" ");
											const sobrenomePolitico =
												nomePoliticoArr[
													nomePoliticoArr.length - 1
												].toLowerCase();
											const nomeSocioArr = String(nodeParams.data.label)
												.trim()
												.split(" ");
											const sobrenomeSocio =
												nomeSocioArr[nomeSocioArr.length - 1].toLowerCase();
											const sobrenomesComuns = [
												"silva",
												"santos",
												"oliveira",
												"souza",
												"pereira",
												"costa",
												"carvalho",
												"almeida",
												"ferreira",
												"ribeiro",
											];
											if (
												sobrenomePolitico === sobrenomeSocio &&
												!sobrenomesComuns.includes(sobrenomePolitico) &&
												sobrenomePolitico.length > 3
											) {
												edgeColor = "#ef4444"; // Vermelho Letal
												edgeLabel = "ï¸ ALERTA: POSSÍVEL PARENTESCO";
											}
										}
									}
									edgesToAddBuffer.current.push({
										id: `edge-pivot-${nodeParams._origemId}-${nodeParams.id}`,
										source: nodeParams._origemId,
										target: nodeParams.id,
										label: edgeLabel,
										animated: isAnimated,
										style: {
											stroke: edgeColor,
											strokeWidth: edgeColor === "#ef4444" ? 3 : 2,
										},
									});
								}
							}
						} catch (_e) { }
					}
				}
			}
		} catch (err: any) {
			if (err.name === "AbortError") {
				setStatusMessage("> [OPERAÇÃO ABORTADA PELO USUÃRIO]");
				toast.warning("> Drilldown cancelado pelo operador.");
				setIsLoading(false);
				setNodes((nds) =>
					nds.map((n) =>
						n.id === origemId
							? {
								...n,
								data: {
									...n.data,
									isSearching: false,
									currentStatus: undefined,
								},
							}
							: n,
					),
				);
				setExpandedNodes((prev) => ({ ...prev, [origemId]: false })); // Restaura o botão da sidebar
				return;
			}
			setErrorMsg(err.message);
			toast.error(`> [ERRO DE DRILLDOWN] ${err.message}`);
			setIsLoading(false);
		} finally {
			// Limpeza garantida caso o processo morra, mas sem emitir sucesso enganoso
			setNodes((nds) =>
				nds.map((n) =>
					n.id === origemId
						? { ...n, data: { ...n.data, isSearching: false } }
						: n,
				),
			);
		}
	};

	const _handleOrgaoSearch = async (
		orgaoNodeId: string,
		nomePolitico: string,
		casaLegislativa: string,
	) => {
		if (abortController) abortController.abort();
		const controller = new AbortController();
		setAbortController(controller);

		setIsLoading(true);
		setStatusMessage(
			`Aprofundando buscas no ${casaLegislativa} para o parlamentar ${nomePolitico}...`,
		);

		setNodes((nds) =>
			nds.map((n) =>
				n.id === orgaoNodeId
					? { ...n, data: { ...n.data, isSearching: true } }
					: n,
			),
		);

		try {
			// Rota específica baseada na casa
			const apiPath =
				casaLegislativa === "ALERJ" ? `/api/investigar/alerj/despesas` : "";
			if (!apiPath)
				throw new Error(
					"Integração Deep Dive indisponível para este órgão no momento.",
				);

			const response = await fetch(
				`${apiPath}?nome=${encodeURIComponent(nomePolitico)}&origemId=${orgaoNodeId}`,
				{ signal: controller.signal },
			);
			if (!response.body) throw new Error("Falha no stream do órgão.");

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			const localPositions = new Map<string, { x: number; y: number }>();
			nodes.forEach((n) => localPositions.set(n.id, n.position));
			const childCounts = new Map<string, number>();

			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const dataStr = line.replace("data: ", "");
						try {
							const event = JSON.parse(dataStr);

							if (event.tipo === "STATUS") {
								setStatusMessage(event.payload.msg);
							} else if (event.tipo === "ERROR") {
								setErrorMsg(event.payload.mensagem);
								setIsLoading(false);
							} else if (event.tipo === "DONE") {
								setStatusMessage(event.payload.msg);
								setIsLoading(false);
								setTimeout(() => {
									toast.success(
										`> [DRILlDOWN COMPLETO] Verificações no órgão de ${nomePolitico} processadas.`,
									);
									setNodes((nds) =>
										nds.map((n) =>
											n.id === orgaoNodeId
												? {
													...n,
													data: {
														...n.data,
														isSearching: false,
														hasDeepDive: false,
													},
												}
												: n,
										),
									);
								}, 1500);
							} else if (event.tipo === "NODE_NOVO") {
								const nodeParams = event.payload;

								// Posicionamento em estrela similar Ã s despesas
								const parentPos = localPositions.get(nodeParams._origemId);
								const baseX = parentPos ? parentPos.x : window.innerWidth / 2;
								const baseY = parentPos ? parentPos.y : 200;

								const parentId = nodeParams._origemId || "root";
								const siblingsSoFar = (childCounts.get(parentId) || 0) + 1;
								childCounts.set(parentId, siblingsSoFar);

								const angle = siblingsSoFar * 35 * (Math.PI / 180);
								const radius = 350 + siblingsSoFar * 10;
								const px = baseX + Math.cos(angle) * radius;
								const py = baseY + Math.sin(angle) * radius;

								nodeParams.position = { x: px, y: py };
								localPositions.set(nodeParams.id, { x: px, y: py });

								nodesToAddBuffer.current.push(nodeParams);
								edgesToAddBuffer.current.push({
									id: `e-${nodeParams._origemId}-${nodeParams.id}`,
									source: nodeParams._origemId,
									target: nodeParams.id,
									animated: true,
									type: "smoothstep",
									style: { stroke: "#eab308", strokeWidth: 2 },
								});
							} else if (event.tipo === "RESULTADO_COMPLETO") {
								// Adiciona as despesas retornadas cruas diretamente no log da sidebar
								if (
									event.payload.despesas &&
									event.payload.despesas.length > 0
								) {
									setEvidencias((prev) => {
										const deduplicated = event.payload.despesas.filter(
											(nova: any) =>
												!prev.some(
													(evt) =>
														evt.cnpjCpfFornecedor === nova.cnpjCpfFornecedor &&
														evt.valorDocumento === nova.valorDocumento,
												),
										);
										return [...prev, ...deduplicated];
									});
								}
							}
						} catch (_e) { }
					}
				}
			}
		} catch (err: any) {
			if (err.name === "AbortError") {
				setStatusMessage("> [ABORTADO PELO USUÃRIO L2]");
				toast.warning("> Drilldown de Câmara cancelado.");
				setIsLoading(false);
				setNodes((nds) =>
					nds.map((n) =>
						n.id === orgaoNodeId
							? {
								...n,
								data: {
									...n.data,
									isSearching: false,
									currentStatus: undefined,
								},
							}
							: n,
					),
				);
				return;
			}
			setErrorMsg(err.message);
			toast.error(`> [ERRO DE DRILLDOWN] ${err.message}`);
			setIsLoading(false);
		} finally {
			setNodes((nds) =>
				nds.map((n) =>
					n.id === orgaoNodeId
						? { ...n, data: { ...n.data, isSearching: false } }
						: n,
				),
			);
		}
	};

	const handleSocioSearch = async (nomeSocio: string, origemId: string) => {
		if (abortController) abortController.abort();
		const controller = new AbortController();
		setAbortController(controller);

		setIsLoading(true);
		setStatusMessage(`Varrendo malha reversa para o sócio ${nomeSocio}...`);

		// Liga o loading state no nó específico
		setNodes((nds) =>
			nds.map((n) =>
				n.id === origemId
					? { ...n, data: { ...n.data, isSearching: true } }
					: n,
			),
		);

		try {
			const response = await fetch(
				`/api/investigar/socio?nome=${encodeURIComponent(nomeSocio)}&origemId=${origemId}`,
				{ signal: controller.signal },
			);
			if (!response.body) throw new Error("Falha no stream.");
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			const localPositions = new Map<string, { x: number; y: number }>();
			nodes.forEach((n) => localPositions.set(n.id, n.position));
			const childCounts = new Map<string, number>();

			let totalCompaniesFound = 0;
			let newCompaniesAdded = 0;

			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const dataStr = line.replace("data: ", "");
						try {
							const event = JSON.parse(dataStr);

							if (event.tipo === "STATUS") {
								setStatusMessage(event.payload.msg);
							} else if (event.tipo === "ERROR") {
								setErrorMsg(event.payload.mensagem);
								setIsLoading(false);
							} else if (event.tipo === "DONE") {
								setStatusMessage(event.payload.msg);
								setIsLoading(false);
								setTimeout(() => {
									if (totalCompaniesFound > 0 && newCompaniesAdded === 0) {
										toast.info(
											`> Busca Reversa: ${totalCompaniesFound} empresa(s) de ${nomeSocio} já estavam no painel.`,
										);
									} else if (totalCompaniesFound === 0) {
										toast.info(
											`> Busca Reversa: Nenhuma empresa adicional vinculada a ${nomeSocio} foi encontrada publicamente.`,
										);
									} else {
										toast.success(
											`> [BUSCA REVERSA CONCLUÍDA] ${newCompaniesAdded} nova(s) conexão(ões) de ${nomeSocio} mapeada(s).`,
										);
									}
									setNodes((nds) =>
										nds.map((n) =>
											n.id === origemId
												? {
													...n,
													data: {
														...n.data,
														isSearching: false,
														currentStatus: undefined,
													},
												}
												: n,
										),
									);
								}, 1500);
							} else if (event.tipo === "NODE_NOVO") {
								const nodeParams = event.payload;

								if (nodeParams.type === "EMPRESA") {
									totalCompaniesFound++;
									const incomingCnpj = String(nodeParams.data?.cnpj || "").replace(/\D/g, "");
									const existingNode =
										nodes.find(
											(n) =>
												n.type === "EMPRESA" &&
												String(n.data?.cnpj || "").replace(/\D/g, "") === incomingCnpj,
										) ||
										nodesToAddBuffer.current.find(
											(n) =>
												n.type === "EMPRESA" &&
												String(n.data?.cnpj || "").replace(/\D/g, "") === incomingCnpj,
										);

									if (existingNode) {
										if (nodeParams._origemId) {
											edgesToAddBuffer.current.push({
												id: `edge-rev-dup-${nodeParams._origemId}-${existingNode.id}`,
												source: nodeParams._origemId,
												target: existingNode.id,
												label: "PARTICIPAÇÃO",
												animated: true,
												style: {
													stroke: "#a855f7",
													strokeWidth: 2,
													strokeDasharray: "5,5",
												},
											});
										}
										continue;
									}
									newCompaniesAdded++;
								}

								// Posição Dinâmica Fixa para Bolhas Reversas
								const parentPos = localPositions.get(nodeParams._origemId);
								const baseX = parentPos ? parentPos.x : window.innerWidth / 2;
								const baseY = parentPos ? parentPos.y : 150;

								const parentId = nodeParams._origemId || "root";
								const siblingsSoFar = childCounts.get(parentId) || 0;
								childCounts.set(parentId, siblingsSoFar + 1);

								let multiplier = 0;
								if (siblingsSoFar > 0) {
									multiplier =
										(siblingsSoFar % 2 !== 0 ? -1 : 1) *
										Math.ceil(siblingsSoFar / 2);
								}

								const px = baseX + multiplier * 360 + (Math.random() * 20 - 10);
								const py = baseY + 250;

								nodeParams.position = { x: px, y: py };
								localPositions.set(nodeParams.id, { x: px, y: py });

								// PREVINE DUPLICAÇÃO DE NÓ NA BUSCA REVERSA
								nodesToAddBuffer.current.push(nodeParams);
								// Conecta automaticamente (Invertido, pois Empresa vem do Sócio)
								if (nodeParams._origemId) {
									edgesToAddBuffer.current.push({
										id: `edge-rev-${nodeParams._origemId}-${nodeParams.id}`,
										source: nodeParams._origemId,
										target: nodeParams.id,
										label: "PARTICIPAÇÃO",
										animated: true,
										style: {
											stroke: "#a855f7",
											strokeWidth: 2,
											strokeDasharray: "5,5",
										},
									});
								}
							}
						} catch (_e) { }
					}
				}
			}
		} catch (err: any) {
			if (err.name === "AbortError") {
				setStatusMessage("> [OPERAÇÃO ABORTADA PELO USUÃRIO]");
				toast.warning("> Busca reversa cancelada pelo operador.");
				setIsLoading(false);
				setNodes((nds) =>
					nds.map((n) =>
						n.id === origemId
							? {
								...n,
								data: {
									...n.data,
									isSearching: false,
									currentStatus: undefined,
								},
							}
							: n,
					),
				);
				setExpandedNodes((prev) => ({ ...prev, [origemId]: false })); // Restaura o botão da sidebar
				return;
			}
			setErrorMsg(err.message);
			toast.error(`> [ERRO BUSCA REVERSA] ${err.message}`);
			setIsLoading(false);
		} finally {
			// Limpeza garantida
			setNodes((nds) =>
				nds.map((n) =>
					n.id === origemId
						? { ...n, data: { ...n.data, isSearching: false } }
						: n,
				),
			);
		}
	};

	const handleInvestigarContratos = async (cnpj: string, origemId: string) => {
		if (abortController) abortController.abort();
		const controller = new AbortController();
		setAbortController(controller);

		setIsLoading(true);
		setStatusMessage(
			`Buscando histórico de licitações no PNCP (Portal Nacional de Contratações Públicas)...`,
		);

		// Liga o loading state no nó específico
		setNodes((nds) =>
			nds.map((n) =>
				n.id === origemId
					? { ...n, data: { ...n.data, isSearching: true } }
					: n,
			),
		);

		try {
			const pessoaNode = nodes.find((n: Node) => n.type === "PESSOA");
			const politicoNome = String(pessoaNode?.data?.label || "");
			const response = await fetch(
				`/api/investigar/licitacoes?cnpj=${cnpj}&politico=${encodeURIComponent(politicoNome)}`,
				{ signal: controller.signal },
			);
			const data = await response.json();

			if (data.hasContracts && data.contracts?.length > 0) {
				setStatusMessage(
					`> ${data.contracts.length} contratos localizados. Renderizando fluxo financeiro...`,
				);

				const localPositions = new Map<string, { x: number; y: number }>();
				nodes.forEach((n) => localPositions.set(n.id, n.position));
				const parentPos = localPositions.get(origemId) || {
					x: window.innerWidth / 2,
					y: 150,
				};

				data.contracts.forEach((c: any, index: number) => {
					const cid = `pncp-${c.numeroControlePNCP}`;
					const aiAnalysis = data.aiAnalysis?.contratos_avaliados?.find(
						(a: any) => a.numeroControlePNCP === c.numeroControlePNCP,
					);

					const nodeParams = {
						id: cid,
						type: "CONTRATO",
						position: {
							x: parentPos.x + 380 + (Math.random() * 40 - 20),
							y: parentPos.y + index * 140,
						},
						data: {
							label: c.numeroControlePNCP,
							objeto: c.objetoContrato,
							valor: c.valorInicial,
							dataDocumento: c.dataAssinatura || c.dataVigenciaInicio,
							nomeFornecedor: c.orgaoEntidade?.razaoSocial,
							classificacao: aiAnalysis?.classificacao || "N/A",
							enquadramento_normativo:
								aiAnalysis?.enquadramento_normativo || "-",
							motivo_ia:
								aiAnalysis?.motivo_ia ||
								(data.aiAnalysis?.score_letalidade_geral > 50
									? "Risco sistêmico identificado no lote."
									: null),
							score_letalidade:
								aiAnalysis?.score_letalidade ??
								(data.aiAnalysis?.score_letalidade_geral || 20),
						},
					};

					nodesToAddBuffer.current.push(nodeParams as unknown as Node);

					edgesToAddBuffer.current.push({
						id: `edge-lic-${origemId}-${cid}`,
						source: origemId,
						target: cid,
						type: "smoothstep",
						animated: true,
						label: "CONTRATO PÚBLICO",
						style: { stroke: "#eab308", strokeWidth: 2 },
					});
				});

				toast.success(
					`> [PNCP] ${data.contracts.length} contratos integrados.`,
				);
			} else {
				toast.info(
					`> [PNCP] Nenhum contrato relevante encontrado nos últimos 8 anos.`,
				);
			}
			setIsLoading(false);
		} catch (err: any) {
			if (err.name === "AbortError") return;
			toast.error(`> [ERRO PNCP] ${err.message}`);
			setIsLoading(false);
		} finally {
			setNodes((nds) =>
				nds.map((n) =>
					n.id === origemId
						? {
							...n,
							data: { ...n.data, isSearching: false, currentStatus: null },
						}
						: n,
				),
			);
		}
	};

	const handleSearch = async (
		refOverride?: string | any,
		nomeOverride?: string | any,
		ufOverride?: string | any,
	) => {
		// Proteção contra eventos do React passados por bindings errados (ex: onClick={handleSearch})
		if (typeof refOverride === "object") refOverride = undefined;
		if (typeof nomeOverride === "object") nomeOverride = undefined;
		if (typeof ufOverride === "object") ufOverride = undefined;

		const termo = (nomeOverride || searchTerm).trim();
		if (!termo) return;

		const currentUf = ufOverride || selectedUf;

		// Valida alçada: obrigatória se não é uma busca com ref direta (federal/autocomplete)
		if (!refOverride && !currentUf) {
			setStatusMessage(
				"> SELECIONE A ALÇADA (ESTADO) DO POLÍTICO ANTES DE BUSCAR.",
			);
			return;
		}

		if (abortController) abortController.abort();
		const controller = new AbortController();
		setAbortController(controller);

		setIsLoading(true);
		setErrorMsg("");
		setApiWarnings([]);

		// Tenta pré-popular cargo, UF e foto imediatamente a partir de refOverride, currentUf ou congressoIndex
		let initialCargo: string | undefined = undefined;
		let initialUf: string | undefined =
			currentUf && currentUf !== "FEDERAL" ? currentUf : undefined;
		let initialFoto: string | undefined = undefined;
		let initialFotoFallback: string | undefined = undefined;

		const supabaseUrl =
			process.env.NEXT_PUBLIC_SUPABASE_URL ||
			"https://uvzynmgwfmdsdrwvgbsy.supabase.co";

		if (refOverride && typeof refOverride === "string") {
			const parts = refOverride.split(":");
			if (parts[0] === "FEDERAL" && parts[1] === "CAMARA" && parts[2]) {
				initialCargo = "DEPUTADO FEDERAL";
				initialFoto = `${supabaseUrl}/storage/v1/object/public/fotos-politicos/${parts[2]}.jpg`;
				initialFotoFallback = `https://www.camara.leg.br/internet/deputado/bandep/${parts[2]}.jpg`;
			} else if (parts[0] === "FEDERAL" && parts[1] === "SENADO" && parts[2]) {
				initialCargo = "SENADOR";
				initialFoto = `${supabaseUrl}/storage/v1/object/public/fotos-politicos/${parts[2]}.jpg`;
				initialFotoFallback = `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${parts[2]}.jpg`;
			} else if (parts[0] === "GOVERNADOR") {
				initialCargo = "GOVERNADOR";
				initialUf = parts[1];
			} else if (parts[0] === "PREFEITO") {
				initialCargo = "PREFEITO";
				initialUf = parts[1];
			}
		}

		const termoNorm = termo
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "");
		const matchedCandidate = congressoIndex.find(
			(p: any) =>
				p.nome
					.toLowerCase()
					.normalize("NFD")
					.replace(/[\u0300-\u036f]/g, "") === termoNorm,
		);

		if (matchedCandidate) {
			if (!initialUf && matchedCandidate.uf) initialUf = matchedCandidate.uf;
			if (!initialCargo) {
				initialCargo =
					matchedCandidate.casa === "CAMARA"
						? "DEPUTADO FEDERAL"
						: matchedCandidate.casa === "SENADO"
							? "SENADOR"
							: undefined;
			}
			if (!initialFoto && matchedCandidate.id) {
				if (matchedCandidate.casa === "CAMARA") {
					initialFoto = `${supabaseUrl}/storage/v1/object/public/fotos-politicos/${matchedCandidate.id}.jpg`;
					initialFotoFallback = `https://www.camara.leg.br/internet/deputado/bandep/${matchedCandidate.id}.jpg`;
				} else if (matchedCandidate.casa === "SENADO") {
					initialFoto = `${supabaseUrl}/storage/v1/object/public/fotos-politicos/${matchedCandidate.id}.jpg`;
					initialFotoFallback = `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${matchedCandidate.id}.jpg`;
				}
			}
		}

		// Exibe um node de PESSOA temporário como "loading card" imediatamente
		const tmpNodeId = `loading-pessoa`;
		setNodes([
			{
				id: tmpNodeId,
				type: "PESSOA",
				position: { x: (window.innerWidth - 320) / 2 - 144, y: 150 },
				data: {
					label: termo.toUpperCase(),
					cargo:
						initialCargo ||
						(currentUf === "FEDERAL"
							? "GOVERNO FEDERAL"
							: currentUf
								? `POLÍTICO (${currentUf})`
								: "POLÍTICO"),
					uf: initialUf || currentUf || undefined,
					urlFoto: initialFoto,
					urlFotoFallback: initialFotoFallback,
					isSearching: true,
					currentStatus: "Iniciando conexão...",
				},
				className: "animate-[customFadeIn_0.5s_ease-out]",
			},
		]);

		setEdges([]);
		setEvidencias([]);
		pessoaNodeIdRef.current = tmpNodeId;
		emendaHubIdRef.current = null;
		emendaRadialCount.current = 0;
		nodesToAddBuffer.current = [];
		edgesToAddBuffer.current = [];
		setCandidatosHomonimos(null);
		setExpandedNodes({});
		setStatusMessage(
			"Estabelecendo conexão segura com bases governamentais...",
		);

		try {
			let apiUrl = `/api/investigar?nome=${encodeURIComponent(termo)}`;
			if (refOverride) {
				apiUrl += `&ref=${encodeURIComponent(refOverride)}`;
			}
			// Passa a UF selecionada (exceto FEDERAL que não filtra por estado)
			if (currentUf && currentUf !== "FEDERAL") {
				apiUrl += `&uf=${encodeURIComponent(currentUf)}`;
			}
			const response = await fetch(apiUrl, { signal: controller.signal });

			if (!response.body) throw new Error("Falha no stream de dados.");

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			let letalNodesCount = 0; // Para espalhar os nós no canvas

			while (true) {
				const { value, done } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const dataStr = line.replace("data: ", "");
						try {
							const event = JSON.parse(dataStr);

							if (event.tipo === "STATUS") {
								setStatusMessage(`> ${event.payload.msg}`);

								// Injeta a mensagem em tempo real para os nós que estão em estado de loading
								setNodes((nds) =>
									nds.map((n) =>
										n.data?.isSearching
											? {
												...n,
												data: { ...n.data, currentStatus: event.payload.msg },
											}
											: n,
									),
								);
							} else if (event.tipo === "ERROR") {
								const msg = event.payload.mensagem || "Erro no pipeline";
								setErrorMsg(msg);
								setStatusMessage(
									"Insira o nome de um político para começar a investigar.",
								);
								setIsLoading(false);
								toast.error(`> [FALHA NA EXTRAÇÃO] ${msg}`);
							} else if (event.tipo === "API_WARNING") {
								setApiWarnings((prev) => {
									// Evita duplicatas pela mesma fonte
									if (prev.some((w) => w.fonte === event.payload.fonte))
										return prev;
									return [
										...prev,
										{
											fonte: event.payload.fonte,
											mensagem: event.payload.mensagem,
										},
									];
								});
							} else if (event.tipo === "CANDIDATOS_ENCONTRADOS") {
								const candidatos = event.payload.candidatos;
								if (candidatos.length === 1) {
									setStatusMessage(
										`> 1 candidato localizado. Iniciando investigação automática...`,
									);
									setSearchTerm(candidatos[0].nome);
									setTimeout(
										() => handleSearch(candidatos[0].ref, candidatos[0].nome),
										100,
									);
									break;
								} else {
									setCandidatosHomonimos(candidatos);
									setIsLoading(false);
									setStatusMessage(
										`> ${candidatos.length} homônimos detectados. Selecione o alvo correto.`,
									);
								}
							} else if (event.tipo === "DONE") {
								setStatusMessage(
									event.payload?.msg
										? `> ${event.payload.msg}`
										: "> [PROCESSO FINALIZADO] Evidências extraídas para a Fila de Auditoria.",
								);
								setIsLoading(false);

								// Mantém a animação holográfica visível por pelo menos 1.5s pra não parecer um bug de carregamento instantâneo
								setTimeout(() => {
									toast.success(
										"> [PROCESSO FINALIZADO] Dossiê completo gerado com sucesso.",
									);
									setNodes((nds) =>
										nds.map((n) =>
											n.type === "PESSOA"
												? {
													...n,
													data: {
														...n.data,
														isSearching: false,
														currentStatus: undefined,
													},
												}
												: n,
										),
									);
									fitView({ padding: 0.2, duration: 800 });
								}, 1500);
							} else if (event.tipo === "NODE_NOVO") {
								const nodeParams = event.payload;

								// GATES DE RENDERIZAÇÃO DO CANVAS
								// Nós estruturais e de alta relevância SEMPRE vão para o Canvas
								const STRUCTURAL_TYPES = [
									"PESSOA",
									"EMPRESA",
									"ORGAO",
									"EMENDA_RESUMO",
									"EMENDA",
									"PROCESSO_JUDICIAL",
									"CONTRATO",
									"RESUMO_GASTOS",
								];
								if (STRUCTURAL_TYPES.includes(nodeParams.type)) {
									if (nodeParams.type === "PESSOA") {
										// Apenas atualiza o nó de loading para o nó real em vez de deletar
										setNodes((nds) =>
											nds.map((n) => {
												if (n.id === "loading-pessoa") {
													return {
														...n,
														id: nodeParams.id, // Atualiza para o ID real (ex: pessoa-1234)
														data: {
															...n.data,
															...nodeParams.data,
															isSearching: true,
														},
														position: {
															x: (window.innerWidth - 320) / 2 - 144,
															y: 150,
														},
														className: "animate-[customFadeIn_0.5s_ease-out]",
													};
												}
												return n;
											}),
										);

										pessoaNodeIdRef.current = nodeParams.id;
										// Adiciona no buffer também para garantir que futuros updates achem o nó pelo ID real
										nodesToAddBuffer.current.push({
											...nodeParams,
											data: { ...nodeParams.data, isSearching: true },
										});
										continue; // Pula a conexão padrão com PESSOA abaixo
									} else if (nodeParams.type === "EMENDA_RESUMO") {
										// Hub de Emendas: Posiciona Ã  direita do político
										const pessoaCenterX = (window.innerWidth - 320) / 2 - 144;
										nodeParams.position = { x: pessoaCenterX + 500, y: 350 };
										emendaHubIdRef.current = nodeParams.id;
										emendaRadialCount.current = 0;
									} else if (nodeParams.type === "RESUMO_GASTOS") {
										// Hub de Gastos: Posiciona Ã  esquerda do político (ou centralizado mais abaixo)
										const pessoaCenterX = (window.innerWidth - 320) / 2 - 144;
										nodeParams.position = { x: pessoaCenterX - 400, y: 350 };
									} else if (
										nodeParams.type === "EMENDA" &&
										emendaHubIdRef.current
									) {
										// Emendas individuais: layout radial no mobile, coluna vertical oculta no desktop
										const hubPos = nodesToAddBuffer.current.find(
											(n: Node) => n.id === emendaHubIdRef.current,
										)?.position || {
											x: (window.innerWidth - 320) / 2 + 356,
											y: 350,
										};
										const idx = emendaRadialCount.current;
										emendaRadialCount.current++;

										let px, py;
										if (isMobile) {
											const angleStep = 30; // graus entre cada emenda
											const startAngle = 60; // começa embaixo-direita
											const radius = 380 + Math.floor(idx / 12) * 200; // expande o raio a cada 12 nós
											const angleDeg = startAngle + idx * angleStep;
											const angleRad = angleDeg * (Math.PI / 180);
											px = hubPos.x + Math.cos(angleRad) * radius;
											py = hubPos.y + Math.sin(angleRad) * radius;
										} else {
											px = hubPos.x;
											py = hubPos.y + 180 + idx * 160;
											nodeParams.hidden = true;
										}
										nodeParams.position = { x: px, y: py };

										// Conecta ao Hub em vez de ao político
										nodesToAddBuffer.current.push(nodeParams);
										edgesToAddBuffer.current.push({
											id: `edge-emenda-hub-${nodeParams.id}`,
											source: emendaHubIdRef.current,
											target: nodeParams.id,
											animated: true,
											style: { stroke: "#14b8a6", strokeWidth: 1.5 },
											hidden: !isMobile ? true : undefined,
										});
										continue; // Pula a conexão padrão com PESSOA abaixo
									} else {
										// Espalhamento radial para outros nós estruturais
										const px =
											(window.innerWidth - 320) / 2 - 300 + Math.random() * 600;
										const py = 350 + Math.random() * 200;
										nodeParams.position = { x: px, y: py };
									}

									nodesToAddBuffer.current.push(nodeParams);

									// Conecta com o nó principal (Pessoa)
									const pessoaId = pessoaNodeIdRef.current;
									if (pessoaId && nodeParams.type !== "PESSOA") {
										const edgeColorMap: Record<string, string> = {
											EMENDA: "#14b8a6", // Teal
											EMENDA_RESUMO: "#14b8a6", // Teal
											ORGAO: "#10b981", // Emerald
											PROCESSO_JUDICIAL: "#ef4444", // Vermelho
											CONTRATO: "#eab308", // Amarelo
											EMPRESA: "#3b82f6", // Azul
											RESUMO_GASTOS: "#6366f1", // Indigo
											DESPESA: "#eab308", // Amarelo
										};
										edgesToAddBuffer.current.push({
											id: `edge-struct-${pessoaId}-${nodeParams.id}`,
											source: pessoaId,
											target: nodeParams.id,
											animated: true,
											style: {
												stroke: edgeColorMap[nodeParams.type] || "#22c55e",
												strokeWidth: 1.5,
											},
										});
									}
								} else if (nodeParams.data?.score_letalidade >= 60) {
									// DESPESAS e outros nós não-estruturais:
									// Só saltam para o Canvas se o Score de Letalidade for Suspeito (> 60)
									// Se for > 85 recebe cor vermelha (Alerta IA)
									const isRedFlag = nodeParams.data?.score_letalidade >= 85;
									const px =
										(window.innerWidth - 320) / 2 -
										144 +
										(letalNodesCount % 3 === 0
											? 0
											: letalNodesCount % 3 === 1
												? -350
												: 350);
									const py = 450 + Math.floor(letalNodesCount / 3) * 300;
									nodeParams.position = { x: px, y: py };
									letalNodesCount++;
									nodesToAddBuffer.current.push(nodeParams);

									const pessoaId = pessoaNodeIdRef.current;
									if (pessoaId) {
										edgesToAddBuffer.current.push({
											id: `edge-ai-${pessoaId}-${nodeParams.id}`,
											source: pessoaId,
											target: nodeParams.id,
											label: isRedFlag ? "ALERTA IA CRÍTICO" : "IA SUSPEITO",
											animated: true,
											style: {
												stroke: isRedFlag ? "#ef4444" : "#ca8a04",
												strokeWidth: isRedFlag ? 3 : 2,
											},
										});
									}
								} else {
									// DESPESAS COM SCORE BAIXO (< 60): Joga silenciosamente na Sidebar
									setEvidencias((prev: any) => {
										const index = prev.findIndex(
											(e: any) => e.id === nodeParams.id,
										);
										if (index > -1) {
											const newPrev = [...prev];
											newPrev[index] = {
												...newPrev[index],
												data: { ...newPrev[index].data, ...nodeParams.data },
											};
											return newPrev;
										}
										return [nodeParams, ...prev];
									});
								}
							} else if (event.tipo === "ADD_ALERT") {
								setNodes((nds) =>
									nds.map((n) => {
										if (n.type === "PESSOA") {
											return {
												...n,
												data: {
													...n.data,
													alertas: [
														...(Array.isArray(n.data.alertas)
															? n.data.alertas
															: []),
														event.payload.msg,
													],
												},
											};
										}
										return n;
									}),
								);
							}
						} catch (e) {
							console.error("Erro ao parsear chunk dinâmico:", e);
						}
					}
				}
			}
		} catch (err: any) {
			if (err.name === "AbortError") {
				setStatusMessage(
					"> [OPERAÇÃO ABORTADA PELO USUÃRIO]. Nós preservados.",
				);
				toast.warning("> Busca principal cancelada pelo operador.");
				setIsLoading(false);
				// Desliga loading globalmente em todos os nós
				setNodes((nds) =>
					nds.map((n) =>
						n.data?.isSearching
							? {
								...n,
								data: {
									...n.data,
									isSearching: false,
									currentStatus: undefined,
								},
							}
							: n,
					),
				);
				return;
			}
			setErrorMsg(err.message);
			setStatusMessage("> [ERRO DE CONEXÃO]");
			toast.error(`> [ERRO DE CONEXÃO] ${err.message}`);
			setIsLoading(false);
		} finally {
			// Removido o setNodes síncrono que desligava o isSearching imediatamente, atropelando o setTimeout de 1.5s do DONE
			// Removido também setIsLoading(false) daqui para ser setado no evento DONE.
		}
	};

	// handleKeyDown foi movido para o SearchBar

	// EXPORTAR DOSSIÊ DOCX
	const [isExporting, setIsExporting] = useState(false);
	const handleExportDossie = async () => {
		setIsExporting(true);
		try {
			// 1. Coleta entidades críticas (score >= 60) e TODOS os Contratos (para compor histórico do PNCP)
			const entidadesRisco = [
				...nodes.filter(
					(n) =>
						(Number(n.data?.score_letalidade) || 0) >= 60 ||
						n.type === "CONTRATO",
				),
				...evidencias.filter(
					(e: any) =>
						(Number(e.data?.score_letalidade) || 0) >= 60 ||
						e.type === "CONTRATO",
				),
			]
				.map((n) => ({ ...n.data, type: n.type }))
				.sort(
					(a: any, b: any) =>
						(b?.score_letalidade || 0) - (a?.score_letalidade || 0),
				);

			// 2. Coleta URLs de evidências
			const urlsEvi = entidadesRisco
				.flatMap((d: any) => {
					const links = [];
					if (d?.urlDocumento) links.push(d.urlDocumento);
					if (d?.link) links.push(d.link);
					if (d?.numeroControlePNCP)
						links.push(
							`https://pncp.gov.br/app/contratos?q=${encodeURIComponent(d.numeroControlePNCP)}`,
						);
					return links;
				})
				.filter((u: string) => u && String(u).startsWith("http"));

			const pessoaNode = nodes.find((n) => n.type === "PESSOA");
			const nomePolitico =
				pessoaNode?.data?.label || searchTerm || "Desconhecido";

			// 3. Chama a API
			const res = await fetch("/api/exportar-dossie", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					nomePolitico,
					despesasCriticas: entidadesRisco,
					urlsNotasFiscais: urlsEvi,
				}),
			});

			if (!res.ok) throw new Error("Falha ao gerar dossiê.");

			// 4. Download automático
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `dossie-${String(nomePolitico).replace(/\s+/g, "_")}.docx`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			toast.success("> [EXPORT] Dossiê DOCX gerado e baixado com sucesso!");
		} catch (err: any) {
			toast.error(`> [EXPORT ERRO] ${err.message}`);
		} finally {
			setIsExporting(false);
		}
	};

	// --- LÓGICA DE DRAG & DROP ---
	const onDragStart = (event: React.DragEvent, nodeData: any) => {
		event.dataTransfer.setData(
			"application/reactflow",
			JSON.stringify(nodeData),
		);
		event.dataTransfer.effectAllowed = "move";
	};

	const onDragOver = useCallback((event: React.DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
	}, []);

	const onDrop = useCallback(
		(event: React.DragEvent) => {
			event.preventDefault();

			const reactFlowData = event.dataTransfer.getData("application/reactflow");
			if (!reactFlowData) return;

			try {
				const nodeData = JSON.parse(reactFlowData);
				const position = screenToFlowPosition({
					x: event.clientX,
					y: event.clientY,
				});

				if (nodes.find((n) => n.id === nodeData.id)) {
					setStatusMessage("> [AVISO] Evidência já anexada ao dossiê.");
					return;
				}

				const newNode: Node = {
					...nodeData,
					position,
				};

				setNodes((nds) => nds.concat(newNode));

				const pessoaRaiz = nodes.find((n) => n.type === "PESSOA");
				if (pessoaRaiz) {
					const score = Number(newNode.data?.score_letalidade || 50);
					let strokeColor = "#22c55e"; // default

					if (newNode.type === "DESPESA") {
						strokeColor =
							score >= 85 ? "#ef4444" : score >= 60 ? "#eab308" : "#64748b";
					} else if (newNode.type === "CONTRATO") {
						strokeColor = "#eab308"; // yellow
					}

					const newEdge: Edge = {
						id: `edge-${pessoaRaiz.id}-${newNode.id}`,
						source: pessoaRaiz.id,
						target: newNode.id,
						label:
							newNode.type === "DESPESA"
								? `EVIDÊNCIA (${score}/100)`
								: "AUTOR_DE",
						animated: true,
						style: { stroke: strokeColor },
					};
					setEdges((eds) => eds.concat(newEdge));
				}

				// Opcional: Remover da lista da Sidebar após dropar (Para não poluir, ou deixar pra manter historico)
				setEvidencias((prev) => prev.filter((e) => e.id !== nodeData.id));
			} catch (e) {
				console.error("Error dropping node:", e);
			}
		},
		[screenToFlowPosition, nodes, setNodes, setEdges],
	);

	// Helpers textuais para a Sidebar
	const getSidebarClasses = (nodeData: any) => {
		if (nodeData.type === "DESPESA") {
			const score = nodeData.data?.score_letalidade || 50;
			if (score >= 85)
				return {
					cardBody:
						"border-red-500 text-red-500 bg-red-950/20 shadow-[0_0_10px_rgba(239,68,68,0.3)]",
					iconCode: <ShieldAlert className="w-3 h-3 text-red-500 shrink-0" />,
					scoreBadge: (
						<Badge className="bg-red-900 absolute top-1 right-2 text-xs rounded-none">
							ðŸ”¥ {score}
						</Badge>
					),
				};
			if (score >= 60)
				return {
					cardBody: "border-yellow-600 text-yellow-500 bg-yellow-950/20",
					iconCode: null,
					scoreBadge: (
						<Badge className="bg-yellow-900 text-yellow-500 absolute top-1 right-2 text-xs rounded-none border border-yellow-700">
							ï¸ {score}
						</Badge>
					),
				};
			return {
				cardBody: "border-slate-700 text-slate-400 bg-slate-900/10",
				iconCode: null,
				scoreBadge: (
					<Badge className="bg-slate-800 text-slate-400 absolute top-1 right-2 text-xs rounded-none border border-slate-700">
						{score}
					</Badge>
				),
			};
		}
		if (nodeData.type === "CONTRATO")
			return {
				cardBody: "border-yellow-500 text-yellow-500 bg-yellow-950/10",
				iconCode: <FileText className="w-3 h-3 text-yellow-500 shrink-0" />,
				scoreBadge: null,
			};
		if (nodeData.type === "EMENDA" || nodeData.type === "EMENDA_RESUMO") {
			const isFantasma =
				nodeData.data?._isFantasma ?? nodeData.data?.isFantasma;
			const risco = nodeData.data?._riscoTipo?.nivel;
			if (isFantasma || risco === "CRÍTICO")
				return {
					cardBody:
						"border-red-500 text-red-500 bg-red-950/20 shadow-[0_0_10px_rgba(239,68,68,0.3)]",
					iconCode: <Landmark className="w-3 h-3 text-teal-500 shrink-0" />,
					scoreBadge: (
						<Badge className="bg-red-900 absolute top-1 right-2 text-xs rounded-none">
							{isFantasma ? "FANTASMA" : "PIX/RP9"}
						</Badge>
					),
				};
			return {
				cardBody: "border-teal-500 text-teal-500 bg-teal-950/10",
				iconCode: <Landmark className="w-3 h-3 text-teal-500 shrink-0" />,
				scoreBadge: (
					<Badge className="bg-teal-900 text-teal-400 absolute top-1 right-2 text-xs rounded-none border border-teal-700">
						{nodeData.data?._percentualExecucao ?? 0}%
					</Badge>
				),
			};
		}
		return { cardBody: "", iconCode: null, scoreBadge: null };
	};

	// SELETOR DE ALÇADA — usado em desktop e mobile
	const ALCADAS_BR = [
		{ sigla: "FEDERAL", nome: "Governo Federal" },
		{ sigla: "_SEP_", nome: "─────────────────" }, // Divider visual
		{ sigla: "AC", nome: "Acre" },
		{ sigla: "AL", nome: "Alagoas" },
		{ sigla: "AM", nome: "Amazonas" },
		{ sigla: "AP", nome: "Amapá" },
		{ sigla: "BA", nome: "Bahia" },
		{ sigla: "CE", nome: "Ceará" },
		{ sigla: "DF", nome: "Distrito Federal" },
		{ sigla: "ES", nome: "Espírito Santo" },
		{ sigla: "GO", nome: "Goiás" },
		{ sigla: "MA", nome: "Maranhão" },
		{ sigla: "MG", nome: "Minas Gerais" },
		{ sigla: "MS", nome: "Mato Grosso do Sul" },
		{ sigla: "MT", nome: "Mato Grosso" },
		{ sigla: "PA", nome: "Pará" },
		{ sigla: "PB", nome: "Paraíba" },
		{ sigla: "PE", nome: "Pernambuco" },
		{ sigla: "PI", nome: "Piauí" },
		{ sigla: "PR", nome: "Paraná" },
		{ sigla: "RJ", nome: "Rio de Janeiro" },
		{ sigla: "RN", nome: "Rio Grande do Norte" },
		{ sigla: "RO", nome: "Rondônia" },
		{ sigla: "RR", nome: "Roraima" },
		{ sigla: "RS", nome: "Rio Grande do Sul" },
		{ sigla: "SC", nome: "Santa Catarina" },
		{ sigla: "SE", nome: "Sergipe" },
		{ sigla: "SP", nome: "São Paulo" },
		{ sigla: "TO", nome: "Tocantins" },
	];

	// Mobile: o MobileView controla tudo (header, loading, resultados, e splash screen inicial).
	const mobileActive = isMobile;

	const clearAll = () => {
		setNodes([]);
		setEdges([]);
		setEvidencias([]);
		setErrorMsg("");
		setApiWarnings([]);
		setSearchTerm("");
		setSelectedUf("");
		setStatusMessage("Insira o nome de um político para começar a investigar.");
	};

	const evidenciasOrdenadas = React.useMemo(() => {
		return [...evidencias].sort((a, b) => {
			const valA = Number(a.data?._empenhado || a.data?.valor || 0);
			const valB = Number(b.data?._empenhado || b.data?.valor || 0);
			return valB - valA; // Maior pro menor (Descending)
		});
	}, [evidencias]);

	return (
		<div className="h-screen w-screen flex flex-col bg-black text-green-500 font-mono overflow-hidden">
			{/* SCRIPT SINCRONO (BLOCKING) PARA EVITAR FLASH DO SITE ANTES DA ANIMAÇÃO GSAP */}
			<script dangerouslySetInnerHTML={{
				__html: `
				if (!sessionStorage.getItem("crt_played")) {
					document.documentElement.classList.add("crt-pending");
				}
			`}} />

			<CrtTurnOn />
			<div className="site-content flex flex-col flex-1 overflow-hidden origin-center h-full w-full opacity-100 in-[.crt-pending]:opacity-0 in-[.crt-pending]:scale-y-0">
				{/* HEADER — só desktop, ou mobile no estado de busca inicial (sem dados/loading) */}
				<SiteHeader
					isMobile={isMobile}
					isLoading={isLoading}
					showClearButton={nodes.length > 0}
					onClearAll={clearAll}
					searchTerm={searchTerm}
					setSearchTerm={setSearchTerm}
					selectedUf={selectedUf}
					setSelectedUf={setSelectedUf}
					onSearch={handleSearch}
					onCancel={() => abortController?.abort()}
				/>

				<div className="flex flex-1 overflow-hidden relative">
					{nodes.length > 0 && !isMobile && (
						<aside className="w-80 bg-[#0a0f0a] border-r border-green-500/50 shrink-0 hidden md:flex flex-col pt-16 z-20 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
							<div className="px-4 py-3 border-b border-green-900 flex justify-between items-center bg-black sticky top-0 shadow-md">
								<h2 className="text-xs font-bold uppercase tracking-widest text-green-600 flex items-center gap-2">
									&gt; DESPESAS
								</h2>
								<Badge
									variant="outline"
									className="bg-black text-green-600 border-green-900 rounded-none text-xs"
								>
									{evidencias.length} Itens
								</Badge>
							</div>

							<div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
								{evidencias.length === 0 && !isLoading && (
									<div className="text-center text-green-900 mt-10 text-xs italic">
										Extrator/IA inativo.
									</div>
								)}

								{evidenciasOrdenadas.map((item, idx) => {
									const styles = getSidebarClasses(item);
									return (
										<div
											key={item.id || idx}
											draggable={true}
											onDragStart={(e) => onDragStart(e, item)}
											className={`relative p-3 border-l-2 cursor-grab active:cursor-grabbing hover:bg-opacity-[0.15] transition-colors overflow-hidden ${styles.cardBody}`}
										>
											{styles.scoreBadge}
											<div className="flex justify-between items-start mb-1">
												<span className="text-xs font-bold tracking-widest uppercase opacity-70">
													[{item.type}]
												</span>
											</div>
											<h3
												className="text-xs font-bold truncate tracking-wide pr-8"
												title={item.data.label}
											>
												{item.data.label || "Unknown"}
											</h3>
											{(item.data.valor || item.data.valor === 0) && (
												<div className="mt-1">
													<p className="text-sm font-bold opacity-90">
														R${" "}
														{Number(item.data.valor).toLocaleString("pt-BR", {
															minimumFractionDigits: 2,
														})}
													</p>
													<p className="text-xs mt-1 opacity-60 uppercase font-mono tracking-wider">
														{formatDateOnly(item.data.dataDocumento)}
													</p>
												</div>
											)}
											{item.data.motivo_ia && (
												<p className="text-xs mt-2 opacity-80 leading-tight line-clamp-2 border-t border-inherit/30 pt-1">
													&gt; {item.data.motivo_ia}
												</p>
											)}
										</div>
									);
								})}
							</div>
						</aside>
					)}

					<main className="flex-1 relative w-full h-full bg-[#050505]">
						{/* DESKTOP e MOBILE: Estado vazio agora substituído pelo Dashboard */}
						{nodes.length === 0 &&
							!isLoading &&
							!errorMsg &&
							(!candidatosHomonimos || candidatosHomonimos.length === 0) && (
								<HomeDashboard />
							)}

						{/* ERRO NO CANVAS */}
						{errorMsg && !isLoading && (
							<div className="absolute inset-0 flex items-center justify-center z-50 bg-black backdrop-blur-[2px] pointer-events-none">
								<div className="border border-red-500/50 bg-black p-6 max-w-md text-center pointer-events-auto shadow-[0_0_40px_rgba(239,68,68,0.25)]">
									<ShieldAlert className="w-8 h-8 text-red-500 mx-auto mb-3" />
									<p className="text-sm text-red-500 mb-2 uppercase tracking-widest font-bold">
										FALHA DE EXTRAÇÃO (OSINT)
									</p>
									<p className="text-xs text-red-500/80 leading-relaxed font-mono">
										&gt; {errorMsg}
									</p>
									<button
										onClick={() => setErrorMsg("")}
										className="mt-6 w-full text-xs bg-red-950/20 text-red-500 hover:bg-red-900/50 hover:text-red-300 uppercase tracking-widest py-3 px-4 border border-red-900 transition-colors"
									>
										[ RECONHECER E FECHAR ]
									</button>
								</div>
							</div>
						)}

						{/* ALERTAS DE API FORA DO AR */}
						{apiWarnings.length > 0 && (
							<div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-2 w-full max-w-lg px-4">
								{apiWarnings.map((w, i) => (
									<div
										key={w.fonte}
										className="border border-yellow-500/60 bg-black backdrop-blur-sm p-4 shadow-[0_0_20px_rgba(234,179,8,0.15)] animate-[customFadeIn_0.3s_ease-out]"
									>
										<div className="flex items-start justify-between gap-3">
											<div className="flex items-start gap-2">
												<AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
												<div>
													<p className="text-xs text-yellow-500 uppercase tracking-widest font-bold mb-1">
														{w.fonte} — FORA DO AR
													</p>
													<p className="text-xs text-yellow-400/80 font-mono leading-relaxed">
														&gt; {w.mensagem}
													</p>
												</div>
											</div>
											<button
												onClick={() =>
													setApiWarnings((prev) =>
														prev.filter((_, idx) => idx !== i),
													)
												}
												className="text-yellow-500/60 hover:text-yellow-400 transition-colors shrink-0"
											>
												<X className="w-3.5 h-3.5" />
											</button>
										</div>
									</div>
								))}
							</div>
						)}

						{/* PAINEL DE DESAMBIGUAÇÃO DE HOMÔNIMOS */}
						{candidatosHomonimos && candidatosHomonimos.length > 0 && (
							<div className="absolute inset-0 flex items-center justify-center z-30 bg-black backdrop-blur-sm">
								<div className="border border-green-500 bg-black p-6 max-w-lg w-full mx-4 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
									<div className="flex items-center gap-2 mb-4 pb-3 border-b border-green-500">
										<ShieldAlert className="text-yellow-500 w-5 h-5" />
										<h2 className="text-sm font-bold tracking-widest uppercase text-yellow-500">
											HOMÔNIMOS DETECTADOS
										</h2>
									</div>
									<p className="text-xs text-green-600 mb-4">
										&gt; A busca retornou {candidatosHomonimos.length} perfis.
										Selecione o alvo correto para iniciar a investigação:
									</p>
									<div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
										{candidatosHomonimos.map((c: any, i: number) => (
											<button
												key={`${c.ref}-${i}`}
												onClick={() => {
													setCandidatosHomonimos(null);
													setSearchTerm(c.nome); // Atualiza o input com o nome completo
													handleSearch(c.ref, c.nome);
												}}
												className="w-full text-left p-3 border border-green-900 hover:border-green-500 hover:bg-green-950/30 transition-all duration-200 group"
											>
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-2">
														<User className="w-4 h-4 text-green-500 shrink-0" />
														<span className="text-sm font-bold text-green-400 uppercase tracking-wider">
															{c.nome}
														</span>
													</div>
													<Badge
														variant="outline"
														className={`rounded-none text-xs uppercase ${c.casa === "CAMARA"
																? "border-green-600 text-green-500"
																: c.casa === "SENADO"
																	? "border-blue-600 text-blue-400"
																	: "border-yellow-600 text-yellow-500"
															}`}
													>
														{c.cargo}
													</Badge>
												</div>
												<p className="text-xs text-green-600 mt-1 font-mono">
													&gt; UF: {c.uf} | ID: {c.id} | REF: {c.ref}
												</p>
											</button>
										))}
									</div>
									<button
										onClick={() => setCandidatosHomonimos(null)}
										className="mt-4 w-full text-center text-xs text-green-700 hover:text-green-500 uppercase tracking-widest py-2 border border-green-900 hover:border-green-500 transition-colors"
									>
										[ CANCELAR ]
									</button>
								</div>
							</div>
						)}

						<div
							className="w-full h-full relative"
							onDragOver={onDragOver}
							onDrop={onDrop}
						>
							{/* MOBILE: MobileView é dono de tudo (loading + resultados + export) */}
							{mobileActive ? (
								<MobileView
									nodes={nodes}
									edges={edges}
									evidencias={evidenciasOrdenadas}
									isLoading={isLoading}
									displayedStatus={displayedStatus}
									isTyping={isTyping}
									handlePivotCNPJ={handlePivotCNPJ}
									handleSocioSearch={handleSocioSearch}
									handleInvestigarContratos={handleInvestigarContratos}
									onNovaBusca={clearAll}
									onExportDossie={handleExportDossie}
									isExporting={isExporting}
									selectedUf={selectedUf}
									setSelectedUf={setSelectedUf}
									alcadas={ALCADAS_BR}
									onSearch={handleSearch}
									searchTerm={searchTerm}
									setSearchTerm={setSearchTerm}
									statusMessage={statusMessage}
								/>
							) : !isMobile ? (
								<ReactFlow
									nodes={nodes}
									edges={edges}
									onNodesChange={onNodesChange}
									onEdgesChange={onEdgesChange}
									onConnect={onConnect}
									onNodeClick={(_, node) => {
										if (node.type === "RESUMO_GASTOS") {
											handleOpenDashboard((node.data as any).nomeVereador || "");
											return;
										}
										if (
											[
												"PESSOA",
												"DESPESA",
												"CONTRATO",
												"EMENDA",
												"EMENDA_RESUMO",
												"EMPRESA",
												"SOCIO",
											].includes(node.type as string)
										) {
											setSelectedNode(node);
										}
									}}
									nodeTypes={nodeTypes}
									edgeTypes={edgeTypes}
									defaultEdgeOptions={{
										style: { strokeWidth: 2 },
										labelBgStyle: {
											fill: "#0f172a",
											fillOpacity: 1,
											stroke: "#334155",
											strokeWidth: 1,
											rx: 6,
											ry: 6,
										},
										labelStyle: {
											fill: "#f8fafc",
											fontWeight: 600,
											fontSize: 11,
										},
										labelBgPadding: [8, 4],
										labelShowBg: true,
									}}
									fitView
									minZoom={0.2}
									maxZoom={2}
									colorMode="dark"
									className="bg-transparent"
								>
									<Background
										color="#002200"
										variant={BackgroundVariant.Dots}
										gap={30}
										size={1.5}
									/>
									<Controls
										className="bg-black! border-green-500! fill-green-500! [&>button]:border-b-green-500! hover:[&>button]:bg-green-900! rounded-none!"
										showInteractive={false}
									/>
									<MiniMap
										className="bg-black! border-green-500! rounded-none! overflow-hidden"
										maskColor="rgba(0, 0, 0, 0.8)"
										nodeColor={(node) => {
											if (node.type === "PESSOA") return "#22c55e";
											if (node.type === "DESPESA") {
												const s = Number(node.data?.score_letalidade || 50);
												if (s >= 85) return "#ef4444";
												if (s >= 60) return "#eab308";
												return "#64748b";
											}
											if (node.type === "CONTRATO") return "#eab308";
											if (node.type === "EMENDA") return "#14b8a6";
											if (node.type === "EMENDA_RESUMO") return "#0d9488";
											if (node.type === "RESUMO_GASTOS") return "#6366f1";
											return "#000000";
										}}
									/>
								</ReactFlow>
							) : (
								<div
									className="absolute inset-0 w-full h-full bg-[#050505] flex items-center justify-center flex-col px-4"
									style={{
										backgroundImage:
											"radial-gradient(circle, #002200 1px, transparent 1px)",
										backgroundSize: "24px 24px",
									}}
								>
									<p className="text-green-500 font-mono text-sm tracking-widest uppercase relative z-10 text-center max-w-lg">
										{displayedStatus}
										<span className="animate-pulse">_</span>
									</p>
								</div>
							)}
							{/* BOTÃO FLUTUANTE: EXPORTAR DOSSIÊ (apenas desktop) */}
							{!isMobile && nodes.length > 0 && !isLoading && (
								<Button
									onClick={handleExportDossie}
									disabled={isExporting}
									className="absolute bottom-6 left-10 z-50 bg-green-600 hover:bg-green-500 text-black font-bold uppercase tracking-widest rounded-none border border-green-400 px-6 py-3 shadow-[0_0_20px_rgba(34,197,94,0.3)] font-mono text-xs"
								>
									{isExporting ? (
										<>
											<Loader2 className="w-4 h-4 mr-2 animate-spin" /> GERANDO
											DOSSIÊ...
										</>
									) : (
										<>
											<Download className="w-4 h-4 mr-2" /> EXPORTAR DOSSIÊ
										</>
									)}
								</Button>
							)}
						</div>
					</main>
				</div>

				<Sheet
					open={!!selectedNode}
					onOpenChange={(open: boolean) => !open && setSelectedNode(null)}
				>
					<SheetContent className="bg-black border-l-2 border-green-500 font-mono text-green-500 overflow-y-auto w-100 sm:w-135 pt-12 pr-6">
						{selectedNode && selectedNode.type === "PESSOA" && (
							<>
								<SheetHeader className="pb-4 mb-4 border-b border-green-900 border-dashed relative">
									<VisuallyHidden>
										<SheetTitle>
											Detalhes do Alvo {selectedNode.data.label}
										</SheetTitle>
										<SheetDescription>
											Informações detalhadas sobre o político selecionado.
										</SheetDescription>
									</VisuallyHidden>
									<Badge
										variant="outline"
										className="w-fit mb-2 text-xs uppercase rounded-none border bg-green-900/30 text-green-500 border-green-500 pr-4"
									>
										{selectedNode.data.cargo} • {selectedNode.data.uf}
									</Badge>
									<div className="text-lg font-bold uppercase tracking-wider text-green-500">
										{selectedNode.data.label}
									</div>
									{selectedNode.data.cpf &&
										selectedNode.data.cpf !== "000.000.000-00" &&
										selectedNode.data.cpf !== "00000000000" ? (
										<div className="text-xs text-green-400/70 font-mono mt-1 mb-1 border-l-2 border-green-900/50 pl-2">
											CPF: {selectedNode.data.cpf}
										</div>
									) : (
										<div className="text-xs text-green-400/50 mt-1 mb-1 italic border-l-2 border-green-900/30 pl-2">
											CPF não disponibilizado publicamente pela casa legislativa.
										</div>
									)}
								</SheetHeader>

								<div className="space-y-6">
									{/* NOVO: Exibição do Patrimônio Declarado (TSE) */}
									{selectedNode.data.patrimonio !== undefined && (
										<div>
											<h3 className="text-xs uppercase font-bold text-yellow-600 mb-2 border-b border-yellow-900/50 pb-1 flex items-center gap-2">
												<DollarSign className="w-4 h-4" /> PATRIMÔNIO DECLARADO
												(TSE)
											</h3>
											<div className="p-3 border bg-yellow-950/10 border-yellow-900/30 text-yellow-500 text-center">
												{selectedNode.data.patrimonio > 0 ? (
													<p className="text-2xl font-bold tracking-widest">
														R${" "}
														{selectedNode.data.patrimonio.toLocaleString(
															"pt-BR",
															{ minimumFractionDigits: 2 },
														)}
													</p>
												) : (
													<p className="text-xs font-bold uppercase tracking-wider text-yellow-700/70">
														Não Encontrado / R$ 0,00
													</p>
												)}
											</div>
										</div>
									)}

									{/* NOVO: Exibição da Ficha Suja / Alertas da CGU */}
									{selectedNode.data.alertasPessoais !== undefined && (
										<div>
											<h3 className="text-xs uppercase font-bold text-red-600 mb-2 border-b border-red-900/50 pb-1 flex items-center gap-2">
												<ShieldAlert className="w-4 h-4" /> CADASTRO DE INIDÔNEOS
												(CGU/TSE)
											</h3>
											<div
												className={`p-3 border ${selectedNode.data.alertasPessoais.length > 0 ? "bg-red-950/10 border-red-900/30 text-red-400" : "bg-slate-900/10 border-slate-800 text-slate-500"}`}
											>
												{selectedNode.data.alertasPessoais.length > 0 ? (
													<ul className="space-y-3">
														{selectedNode.data.alertasPessoais.map(
															(alerta: string, index: number) => (
																<li
																	key={index}
																	className="flex gap-2 text-xs wrap-break-word w-full"
																>
																	<ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-500 animate-pulse" />
																	<span className="leading-tight uppercase tracking-wide">
																		{alerta}
																	</span>
																</li>
															),
														)}
													</ul>
												) : (
													<p className="text-xs uppercase tracking-wider text-center">
														Nenhum Registro de Inidoneidade na Consulta Rápida
													</p>
												)}
											</div>
										</div>
									)}
								</div>
							</>
						)}

						{selectedNode && selectedNode.type === "DESPESA" && (
							<>
								<SheetHeader
									className={`pb-4 mb-4 border-b border-dashed relative ${selectedNode.data.score_letalidade >= 85 ? "border-red-900" : selectedNode.data.score_letalidade >= 60 ? "border-yellow-900" : "border-slate-800"}`}
								>
									<VisuallyHidden>
										<SheetTitle>Detalhes da Despesa</SheetTitle>
										<SheetDescription>
											Informações detalhadas sobre o gasto parlamentar.
										</SheetDescription>
									</VisuallyHidden>
									<Badge
										variant="outline"
										className={`w-fit mb-2 text-xs uppercase rounded-none border pr-4 ${selectedNode.data.score_letalidade >= 85 ? "bg-red-900/30 text-red-500 border-red-500" : selectedNode.data.score_letalidade >= 60 ? "bg-yellow-900/30 text-yellow-500 border-yellow-500" : "bg-slate-900/50 text-slate-400 border-slate-700"}`}
									>
										{selectedNode.data.tipo || "Despesa CEAP"}
									</Badge>
									<div
										className={`text-lg font-bold pr-6 uppercase tracking-wider ${selectedNode.data.score_letalidade >= 85 ? "text-red-500" : selectedNode.data.score_letalidade >= 60 ? "text-yellow-500" : "text-slate-400"}`}
									>
										R${" "}
										{Number(selectedNode.data.valor).toLocaleString("pt-BR", {
											minimumFractionDigits: 2,
										})}
									</div>
									<div
										className={`text-xs mt-1 mb-1 ${selectedNode.data.score_letalidade >= 85 ? "text-red-400/70" : selectedNode.data.score_letalidade >= 60 ? "text-yellow-400/70" : "text-slate-500"}`}
									>
										Fornecedor: {selectedNode.data.label}
									</div>
									<div
										className={`text-xs font-mono ${selectedNode.data.score_letalidade >= 85 ? "text-red-400/70" : selectedNode.data.score_letalidade >= 60 ? "text-yellow-400/70" : "text-slate-500"}`}
									>
										CNPJ: {selectedNode.data.documento}
									</div>
									{selectedNode.data.dataDocumento && (
										<div
											className={`text-xs font-mono mt-1 ${selectedNode.data.score_letalidade >= 85 ? "text-red-400/70" : selectedNode.data.score_letalidade >= 60 ? "text-yellow-400/70" : "text-slate-500"}`}
										>
											Data: {formatDateOnly(selectedNode.data.dataDocumento)}
										</div>
									)}
								</SheetHeader>

								<div className="space-y-6">
									{/* Lógica do Botão da Nota Fiscal (Câmara vs Senado) */}
									<div>
										<h3 className="text-xs uppercase font-bold text-slate-400 mb-2 border-b border-slate-800 pb-1">
											Comprovação Fiscal
										</h3>
										{selectedNode.data.urlDocumento ? (
											<a
												href={selectedNode.data.urlDocumento}
												target="_blank"
												rel="noopener noreferrer"
												className="flex w-full items-center justify-center p-3 mt-2 border bg-blue-950/20 border-blue-900 text-blue-400 hover:bg-blue-900/40 hover:text-blue-300 transition-colors text-xs font-bold uppercase tracking-widest rounded-sm"
											>
												Ver Nota Digitalizada
											</a>
										) : (
											<div className="space-y-2 mt-2">
												{(() => {
													const pessoaNode = nodes.find(
														(n: any) => n.type === "PESSOA",
													);
													const fallback = getPortalTransparenciaFallback(
														pessoaNode?.data?.casa as string | undefined,
														pessoaNode?.data?.uri as string | undefined,
													);

													return (
														<>
															<p className="text-xs text-slate-500 leading-relaxed">
																{fallback.mensagem}
															</p>
															{fallback.link !== "#" && (
																<a
																	href={fallback.link}
																	target="_blank"
																	rel="noopener noreferrer"
																	className="flex w-full items-center justify-center p-3 border bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors text-xs font-bold uppercase tracking-widest rounded-sm"
																>
																	{fallback.textoLink}
																</a>
															)}
														</>
													);
												})()}
											</div>
										)}
									</div>

									{/* Inteligência Artificial Score */}
									{selectedNode.data.motivo_ia && (
										<div className="mb-6">
											<AIProgressBar
												score={selectedNode.data.score_letalidade}
												motivo={selectedNode.data.motivo_ia}
											/>
										</div>
									)}

									{/* O Risco do The Full OSINT vai aqui se existir */}
									{selectedNode.data.risco?.alertas &&
										selectedNode.data.risco.alertas.length > 0 && (
											<div>
												<h3 className="text-xs uppercase font-bold text-red-600 mb-2 border-b border-red-900 pb-1">
													&gt; CRUZAMENTO DE DADOS OFICIAIS (CGU/TCU/RECEITA)
												</h3>
												<ul className="space-y-2">
													{selectedNode.data.risco.alertas.map(
														(alerta: string, idx: number) => (
															<li
																key={idx}
																className="flex gap-2 text-xs text-red-400 wrap-break-word w-full"
															>
																<ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
																<span className="leading-tight">{alerta}</span>
															</li>
														),
													)}
												</ul>
											</div>
										)}

									{/* Botão para Street View / Google Maps para checagem de Fachada */}
									{(selectedNode.data.documento ||
										selectedNode.data.cnpjCpfFornecedor) &&
										String(
											selectedNode.data.documento ||
											selectedNode.data.cnpjCpfFornecedor,
										).length > 11 &&
										!(
											selectedNode.data.label
												?.toUpperCase()
												.includes("ELEICAO") ||
											selectedNode.data.label
												?.toUpperCase()
												.includes("CAMPANHA") ||
											selectedNode.data.cnae?.toUpperCase().includes("CAMPANHA")
										) && (
											<div className="mt-6 pt-4 border-t border-slate-800">
												<h3 className="text-xs uppercase font-bold text-blue-500 mb-2 border-b border-blue-900/50 pb-1 flex items-center gap-2">
													<MapPin className="w-4 h-4" /> Inteligência Geográfica
												</h3>
												<p className="text-xs text-slate-500 mb-3 leading-relaxed">
													Verificar possível empresa de fachada via Google Street
													View pelo registro de CNPJ / Nome.
												</p>
												<a
													href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
														[
															selectedNode.data.label,
															selectedNode.data.municipio,
															selectedNode.data.uf,
															`CNPJ ${selectedNode.data.documento || selectedNode.data.cnpjCpfFornecedor}`,
															"Brasil",
														]
															.filter(Boolean)
															.join(" "),
													)}`}
													target="_blank"
													rel="noopener noreferrer"
													className="flex w-full items-center justify-center p-3 border bg-blue-950/20 text-blue-400 border-blue-900 hover:bg-blue-900 hover:text-blue-300 rounded-none text-xs font-bold uppercase tracking-widest transition-all duration-300 group"
												>
													<MapIcon className="mr-2 h-4 w-4" /> Analisar Endereço
												</a>
											</div>
										)}

									{/* Botão para expandir malha societária (Pivot) */}
									{selectedNode.data.documento &&
										selectedNode.data.documento.length > 11 &&
										!(
											selectedNode.data.label
												?.toUpperCase()
												.includes("ELEICAO") ||
											selectedNode.data.label
												?.toUpperCase()
												.includes("CAMPANHA") ||
											selectedNode.data.cnae?.toUpperCase().includes("CAMPANHA")
										) && (
											<div className="mt-8 pt-6 border-t border-slate-800">
												<h3 className="text-xs uppercase font-bold text-blue-500 mb-2 border-b border-blue-900/50 pb-1 flex items-center gap-2">
													<Briefcase className="w-4 h-4" /> Dossiê Societário
												</h3>
												<p className="text-xs text-slate-500 mb-3 leading-relaxed">
													Deseja extrair os vínculos empresariais, sócios (QSA) e
													o histórico de contratos públicos deste fornecedor?
												</p>
												{!expandedNodes[selectedNode.id] ? (
													<Button
														variant="outline"
														className="w-full bg-blue-950/20 text-blue-400 border-blue-900 hover:bg-blue-900 hover:text-blue-300 rounded-none text-xs font-bold uppercase tracking-widest transition-all duration-300 group"
														onClick={() => {
															setExpandedNodes((prev) => ({
																...prev,
																[selectedNode.id]: true,
															}));
															handlePivotCNPJ(
																selectedNode.data.documento,
																selectedNode.id,
															);
														}}
													>
														<Search className="mr-2 h-4 w-4" /> Aprofundar
														Investigação
													</Button>
												) : (
													<div className="w-full text-center p-3 border border-green-900/50 bg-green-950/10 text-green-500/80 text-xs font-mono uppercase tracking-widest">
														[ DRILLDOWN CONCLUÍDO NO CANVAS ]
													</div>
												)}
											</div>
										)}
								</div>
							</>
						)}

						{selectedNode &&
							(selectedNode.type === "CONTRATO" ||
								selectedNode.type === "EMENDA") && (
								<>
									<SheetHeader className="pb-4 mb-4 border-b border-yellow-900 border-dashed relative">
										<VisuallyHidden>
											<SheetTitle>Detalhes do Contrato/Emenda</SheetTitle>
											<SheetDescription>Informações detalhadas.</SheetDescription>
										</VisuallyHidden>
										<Badge
											variant="outline"
											className="w-fit mb-2 text-xs uppercase rounded-none border bg-yellow-900/30 text-yellow-500 border-yellow-500 pr-4"
										>
											{selectedNode.data.label?.startsWith("EMENDA")
												? "EMENDA PARLAMENTAR"
												: "CONTRATO FEDERAL"}
										</Badge>
										<div className="text-lg font-bold uppercase tracking-wider text-yellow-500">
											{selectedNode.data.label}
										</div>
										{selectedNode.data.codigo && (
											<div className="text-xs font-mono mt-1 text-yellow-400/70 border-l-2 border-yellow-900/50 pl-2 mb-1">
												Código/Ref: {selectedNode.data.codigo}
											</div>
										)}
									</SheetHeader>
									<div className="space-y-6">
										<div>
											<h3 className="text-xs uppercase font-bold text-yellow-600 mb-2 border-b border-yellow-900/50 pb-1 flex items-center gap-2">
												<DollarSign className="w-4 h-4" /> Valor Associado
											</h3>
											<div className="p-3 border bg-yellow-950/10 border-yellow-900/30 text-yellow-500 text-center">
												<p className="text-2xl font-bold tracking-widest">
													R${" "}
													{Number(selectedNode.data.valor).toLocaleString(
														"pt-BR",
														{ minimumFractionDigits: 2 },
													)}
												</p>
												{selectedNode.data.label?.startsWith("EMENDA") &&
													selectedNode.data.valorPago !== undefined && (
														<p className="text-xs mt-2 opacity-80 uppercase tracking-widest pt-2 border-t border-yellow-900/30">
															STATUS:{" "}
															{selectedNode.data.valorPago > 0
																? `Pagamento de R$ ${Number(selectedNode.data.valorPago).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
																: "Apenas Empenhado / Sem Pagamento"}
														</p>
													)}
											</div>
										</div>

										{selectedNode.data.label?.startsWith("EMENDA") &&
											selectedNode.data.tipo && (
												<div>
													<h3 className="text-xs uppercase font-bold text-yellow-600 mb-2 border-b border-yellow-900/50 pb-1 flex items-center gap-2">
														<FileText className="w-4 h-4" /> Dados da Proposição
													</h3>
													<div className="p-3 border bg-yellow-950/10 border-yellow-900/30 text-yellow-400 text-xs leading-relaxed uppercase tracking-wide">
														<span className="opacity-60">TIPO:</span>{" "}
														{selectedNode.data.tipo}
														<br />
														<span className="opacity-60">ANO/EXERCÍCIO:</span>{" "}
														{selectedNode.data.ano || "N/A"}
														<br />
														{selectedNode.data.programa && (
															<>
																<span className="opacity-60">PROGRAMA:</span>{" "}
																{selectedNode.data.programa}
															</>
														)}
													</div>
												</div>
											)}

										<div>
											<h3 className="text-xs uppercase font-bold text-yellow-600 mb-2 border-b border-yellow-900/50 pb-1 flex items-center gap-2">
												<FileText className="w-4 h-4" />{" "}
												{selectedNode.data.label?.startsWith("EMENDA")
													? "Destinação / Função"
													: "Objeto / Destinação"}
											</h3>
											<div className="p-3 border bg-yellow-950/10 border-yellow-900/30 text-yellow-400 text-xs leading-relaxed uppercase tracking-wide">
												{selectedNode.data.objeto || "N/A"}
												{selectedNode.data.subfuncao && (
													<>
														<br />
														<span className="opacity-60">SUBFUNÇÃO:</span>{" "}
														{selectedNode.data.subfuncao}
													</>
												)}
											</div>
										</div>

										{selectedNode.type === "EMENDA" &&
											selectedNode.data.beneficiario && (
												<div className="mt-6 pt-6 border-t border-slate-800">
													<h3 className="text-xs uppercase font-bold text-teal-500 mb-2 border-b border-teal-900/50 pb-1 flex items-center gap-2">
														<Building2 className="w-4 h-4" /> Beneficiário
														Recebedor
													</h3>
													<div className="p-3 border bg-teal-950/10 border-teal-900/30 text-teal-400 text-xs leading-relaxed uppercase tracking-wide mb-3">
														<span className="opacity-60">NOME:</span>{" "}
														{selectedNode.data.beneficiario.nome}
														<br />
														<span className="opacity-60">CNPJ:</span>{" "}
														{selectedNode.data.beneficiario.cnpj}
														<br />
														<span className="opacity-60">UF:</span>{" "}
														{selectedNode.data.beneficiario.uf}
														<br />
														{selectedNode.data.beneficiario.area && (
															<>
																<span className="opacity-60">
																	POLÍTICA PÚBLICA:
																</span>{" "}
																{selectedNode.data.beneficiario.area}
																<br />
															</>
														)}
														{selectedNode.data.beneficiario.situacao && (
															<>
																<span className="opacity-60">SITUAÇÃO:</span>{" "}
																{selectedNode.data.beneficiario.situacao}
															</>
														)}
													</div>

													{beneficiaryContracts.length === 0 ? (
														<Button
															variant="outline"
															disabled={loadingBeneficiaryContracts}
															className="w-full bg-teal-950/20 text-teal-400 border border-teal-850 hover:bg-teal-900 hover:text-teal-300 rounded-none text-xs font-bold uppercase tracking-widest transition-all duration-300"
															onClick={async () => {
																setLoadingBeneficiaryContracts(true);
																try {
																	const res = await fetch(
																		`/api/investigar/contratos-beneficiario?cnpj=${selectedNode.data.beneficiario.cnpj}`,
																	);
																	if (res.ok) {
																		const json = await res.json();
																		setBeneficiaryContracts(json.contracts || []);
																		if (
																			!json.contracts ||
																			json.contracts.length === 0
																		) {
																			toast.info(
																				"Nenhum contrato encontrado para este CNPJ no PNCP.",
																			);
																		}
																	} else {
																		toast.error(
																			"Erro ao buscar contratos do beneficiário.",
																		);
																	}
																} catch (_e) {
																	toast.error(
																		"Falha de rede ao consultar contratos.",
																	);
																} finally {
																	setLoadingBeneficiaryContracts(false);
																}
															}}
														>
															{loadingBeneficiaryContracts ? (
																<Loader2 className="mr-2 h-4 w-4 animate-spin" />
															) : (
																<Search className="mr-2 h-4 w-4" />
															)}
															Investigar Contratos do Recebedor (PNCP)
														</Button>
													) : (
														<div className="space-y-3">
															<h4 className="text-[11px] font-bold uppercase text-teal-500 flex items-center gap-1">
																<Briefcase className="w-3.5 h-3.5" /> Últimos
																Contratos PNCP ({beneficiaryContracts.length})
															</h4>
															<div className="space-y-2 max-h-55 overflow-y-auto pr-1">
																{beneficiaryContracts.map(
																	(c: any, idx: number) => (
																		<div
																			key={idx}
																			className="p-2 border border-slate-800 bg-slate-950/50 text-[11px] leading-relaxed font-mono"
																		>
																			<div className="flex justify-between items-start mb-1">
																				<span className="font-bold text-teal-400 text-[9px] bg-teal-950/50 px-1 border border-teal-900">
																					{c.tipo === "COMPRADOR"
																						? "COMPRADOR/ÓRGÃO"
																						: "FORNECEDOR"}
																				</span>
																				<span className="text-slate-500 text-[9px]">
																					{c.data
																						? new Date(c.data).toLocaleDateString(
																							"pt-BR",
																						)
																						: ""}
																				</span>
																			</div>
																			<p className="text-slate-300 font-bold uppercase tracking-wider line-clamp-1">
																				{c.orgao}
																			</p>
																			<p className="text-slate-400 mt-1 uppercase text-[10px] line-clamp-2">
																				{c.objeto}
																			</p>
																			<p className="text-right text-green-400 font-bold mt-1 text-[10px]">
																				R${" "}
																				{Number(c.valor).toLocaleString("pt-BR", {
																					minimumFractionDigits: 2,
																				})}
																			</p>
																		</div>
																	),
																)}
															</div>
														</div>
													)}
												</div>
											)}
									</div>
								</>
							)}

						{selectedNode && selectedNode.type === "EMENDA_RESUMO" && (
							<>
								<SheetHeader className="pb-4 mb-4 border-b border-teal-900 border-dashed relative">
									<VisuallyHidden>
										<SheetTitle>Resumo das Emendas</SheetTitle>
										<SheetDescription>
											Visão geral de todas as emendas.
										</SheetDescription>
									</VisuallyHidden>
									<Badge
										variant="outline"
										className="w-fit mb-2 text-xs uppercase rounded-none border bg-teal-900/30 text-teal-500 border-teal-500 pr-4"
									>
										BALANÇO GERAL DE EMENDAS
									</Badge>
									<div className="text-lg font-bold uppercase tracking-wider text-teal-400">
										{selectedNode.data.label}
									</div>
								</SheetHeader>
								<div className="space-y-6">
									<div className="pb-2 border-b border-teal-900/50">
										<Button
											onClick={() => {
												handleToggleEmendas(selectedNode.id);
												setSelectedNode((prev: any) => ({
													...prev,
													data: {
														...prev.data,
														isExpanded: !prev.data?.isExpanded,
													},
												}));
											}}
											className="w-full bg-teal-950/20 text-teal-400 border border-teal-800 hover:bg-teal-900 hover:text-teal-300 rounded-none text-xs font-bold uppercase tracking-widest transition-all duration-300"
										>
											{selectedNode.data?.isExpanded
												? "Recolher Emendas no Canvas"
												: "Ver Todas as Emendas no Canvas"}
										</Button>
									</div>
									<div>
										<h3 className="text-xs uppercase font-bold text-teal-600 mb-2 border-b border-teal-900/50 pb-1 flex items-center gap-2">
											<DollarSign className="w-4 h-4" /> Valores Consolidados
										</h3>
										<div className="p-3 border bg-teal-950/10 border-teal-900/30 text-teal-400">
											<div className="flex justify-between items-end mb-2">
												<span className="text-xs uppercase opacity-70">
													Total Empenhado
												</span>
												<span className="text-lg font-bold tracking-widest">
													R${" "}
													{Number(
														selectedNode.data.totalEmpenhado || 0,
													).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
												</span>
											</div>
											<div className="flex justify-between items-end mb-3">
												<span className="text-xs uppercase opacity-70">
													Total Pago
												</span>
												<span className="text-md font-bold text-teal-300">
													R${" "}
													{Number(
														selectedNode.data.totalPago || 0,
													).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
												</span>
											</div>

											<div className="w-full bg-teal-950 h-2 mt-4 relative">
												<div
													className="absolute top-0 left-0 h-full bg-teal-500"
													style={{
														width: `${selectedNode.data.percentualExecucao || 0}%`,
													}}
												></div>
											</div>
											<p className="text-xs mt-2 uppercase tracking-widest text-right">
												TAXA DE EXECUÇÃO:{" "}
												{selectedNode.data.percentualExecucao || 0}%
											</p>
										</div>
									</div>

									{(selectedNode.data.fantasmas > 0 ||
										selectedNode.data.emendasPIX > 0) && (
											<div>
												<h3 className="text-xs uppercase font-bold text-orange-600 mb-2 border-b border-orange-900/50 pb-1 flex items-center gap-2">
													<ShieldAlert className="w-4 h-4" /> Fatores de Risco
													Detectados
												</h3>
												<div className="p-3 border bg-orange-950/10 border-orange-900/30 text-orange-400 text-xs leading-relaxed uppercase tracking-wide">
													{selectedNode.data.fantasmas > 0 && (
														<span className="block mb-1">
															{selectedNode.data.fantasmas} Emenda(s) Fantasma(s) -
															Sem Pagamentos
														</span>
													)}
													{selectedNode.data.emendasPIX > 0 && (
														<span className="block text-red-400">
															{selectedNode.data.emendasPIX} Emenda(s) PIX/Orçamento
															Secreto
														</span>
													)}
												</div>
											</div>
										)}

									{Object.keys(selectedNode.data.porTipo || {}).length > 0 && (
										<div>
											<h3 className="text-xs uppercase font-bold text-teal-600 mb-2 border-b border-teal-900/50 pb-1">
												Distribuição por Tipo
											</h3>
											<ul className="text-xs space-y-1">
												{Object.entries(selectedNode.data.porTipo).map(
													([tipo, qtd]) => (
														<li
															key={tipo}
															className="flex justify-between text-teal-400/80"
														>
															<span>{tipo.toUpperCase()}</span>
															<span className="font-bold">{String(qtd)}x</span>
														</li>
													),
												)}
											</ul>
										</div>
									)}

									{selectedNode.data.topLocalidades &&
										selectedNode.data.topLocalidades.length > 0 && (
											<div>
												<h3 className="text-xs uppercase font-bold text-teal-600 mb-2 border-b border-teal-900/50 pb-1">
													Principais Localidades (Valores)
												</h3>
												<ul className="text-xs space-y-2">
													{selectedNode.data.topLocalidades.map(
														(loc: any, idx: number) => (
															<li
																key={idx}
																className="flex flex-col text-teal-400/70 border-b border-teal-900/20 pb-1"
															>
																<span className="font-bold">
																	{loc.localidade}
																</span>
																<span>
																	R${" "}
																	{Number(loc.valor || 0).toLocaleString("pt-BR")}
																</span>
															</li>
														),
													)}
												</ul>
											</div>
										)}
								</div>
							</>
						)}

						{selectedNode && selectedNode.type === "EMPRESA" && (
							<>
								<SheetHeader className="pb-4 mb-4 border-b border-blue-900 border-dashed relative">
									<VisuallyHidden>
										<SheetTitle>Detalhes da Empresa</SheetTitle>
										<SheetDescription>
											Informações detalhadas sobre a pessoa jurídica.
										</SheetDescription>
									</VisuallyHidden>
									<Badge
										variant="outline"
										className="w-fit mb-2 text-xs uppercase rounded-none border bg-blue-900/30 text-blue-500 border-blue-500 pr-4"
									>
										PESSOA JURÍDICA
									</Badge>
									<div className="text-lg font-bold uppercase tracking-wider text-blue-500">
										{selectedNode.data.label}
									</div>
									<div className="text-xs font-mono mt-1 text-blue-400/70">
										CNPJ: {selectedNode.data.cnpj}
									</div>
									{selectedNode.data.situacao && (
										<div className="text-xs font-mono text-blue-400/70">
											Situação: {selectedNode.data.situacao}
										</div>
									)}
								</SheetHeader>

								<div className="space-y-6">
									{selectedNode.data.cnae && (
										<div>
											<h3 className="text-xs uppercase font-bold text-slate-400 mb-2 border-b border-slate-800 pb-1">
												CNAE Principal
											</h3>
											<p className="text-xs text-slate-300">
												{selectedNode.data.cnae}
											</p>
										</div>
									)}

									{!(
										selectedNode.data.label?.toUpperCase().includes("ELEICAO") ||
										selectedNode.data.label?.toUpperCase().includes("CAMPANHA") ||
										selectedNode.data.cnae?.toUpperCase().includes("CAMPANHA")
									) && (
											<>
												<div className="mt-8 pt-6 border-t border-slate-800">
													<h3 className="text-xs uppercase font-bold text-blue-500 mb-2 border-b border-blue-900/50 pb-1 flex items-center gap-2">
														<MapPin className="w-4 h-4" /> Inteligência Geográfica
													</h3>
													<p className="text-xs text-slate-500 mb-3 leading-relaxed">
														Verifique indícios de empresa de fachada através do
														endereço de registro.
													</p>
													<a
														href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
															[
																selectedNode.data.label,
																selectedNode.data.municipio,
																selectedNode.data.uf,
																selectedNode.data.cnpj
																	? `CNPJ ${selectedNode.data.cnpj}`
																	: null,
																"Brasil",
															]
																.filter(Boolean)
																.join(" "),
														)}`}
														target="_blank"
														rel="noopener noreferrer"
														className="flex w-full items-center justify-center p-3 border bg-blue-950/20 text-blue-400 border-blue-900 hover:bg-blue-900 hover:text-blue-300 rounded-none text-xs font-bold uppercase tracking-widest transition-all duration-300 group"
													>
														<MapIcon className="mr-2 h-4 w-4" /> Analisar Endereço
														(Street View)
													</a>
												</div>

												<div className="mt-8 pt-6 border-t border-slate-800">
													<h3 className="text-xs uppercase font-bold text-blue-500 mb-2 border-b border-blue-900/50 pb-1 flex items-center gap-2">
														<Briefcase className="w-4 h-4" /> Dossiê Societário
													</h3>
													<p className="text-xs text-slate-500 mb-3 leading-relaxed">
														Extrair o Quadro de Sócios (QSA) e conexões desta
														empresa.
													</p>
													{!expandedNodes[selectedNode.id] ? (
														<Button
															variant="outline"
															className="w-full bg-blue-950/20 text-blue-400 border-blue-900 hover:bg-blue-900 hover:text-blue-300 rounded-none text-xs font-bold uppercase tracking-widest transition-all duration-300 group"
															onClick={() => {
																setExpandedNodes((prev) => ({
																	...prev,
																	[selectedNode.id]: true,
																}));
																handlePivotCNPJ(
																	selectedNode.data.cnpj,
																	selectedNode.id,
																);
															}}
														>
															<Search className="mr-2 h-4 w-4" /> Expandir Teia
															Societária
														</Button>
													) : (
														<div className="w-full text-center p-3 border border-green-900/50 bg-green-950/10 text-green-500/80 text-xs font-mono uppercase tracking-widest">
															[ DRILLDOWN CONCLUÍDO NO CANVAS ]
														</div>
													)}
												</div>
											</>
										)}
								</div>
							</>
						)}

						{selectedNode && selectedNode.type === "SOCIO" && (
							<>
								<SheetHeader className="pb-4 mb-4 border-b border-purple-900 border-dashed relative">
									<VisuallyHidden>
										<SheetTitle>Detalhes do Sócio</SheetTitle>
										<SheetDescription>
											Informações detalhadas sobre a pessoa física listada no QSA.
										</SheetDescription>
									</VisuallyHidden>
									<Badge
										variant="outline"
										className="w-fit mb-2 text-xs uppercase rounded-none border bg-purple-900/30 text-purple-400 border-purple-500 pr-4"
									>
										PESSOA FÍSICA (QSA)
									</Badge>
									<div className="text-lg font-bold uppercase tracking-wider text-purple-400">
										{selectedNode.data.label}
									</div>
									{selectedNode.data.cargo && (
										<div className="text-xs font-mono mt-1 text-purple-400/70 border-l-2 border-purple-900/50 pl-2 mb-1">
											Qualificação: {selectedNode.data.cargo}
										</div>
									)}
								</SheetHeader>

								<div className="space-y-6">
									<div className="mt-8 pt-6 border-t border-slate-800">
										<h3 className="text-xs uppercase font-bold text-purple-500 mb-2 border-b border-purple-900/50 pb-1 flex items-center gap-2">
											<Users className="w-4 h-4" /> Busca Reversa
										</h3>
										<p className="text-xs text-slate-500 mb-3 leading-relaxed">
											Rodar script de busca para localizar outras empresas onde{" "}
											{selectedNode.data.label} também é sócio(a).
										</p>
										{!expandedNodes[selectedNode.id] ? (
											<Button
												variant="outline"
												className="w-full bg-purple-950/20 text-purple-400 border-purple-900 hover:bg-purple-900 hover:text-purple-300 rounded-none text-xs font-bold uppercase tracking-widest transition-all duration-300 group"
												onClick={() => {
													setExpandedNodes((prev) => ({
														...prev,
														[selectedNode.id]: true,
													}));
													handleSocioSearch(
														selectedNode.data.label,
														selectedNode.id,
													);
												}}
											>
												<Search className="mr-2 h-4 w-4" /> Rodar Busca Reversa
											</Button>
										) : (
											<div className="w-full text-center p-3 border border-purple-900/50 bg-purple-950/10 text-purple-500/80 text-xs font-mono uppercase tracking-widest">
												[ BUSCA REVERSA EXECUTADA ]
											</div>
										)}
										<p className="text-xs text-purple-900/40 mt-2 text-center">
											* Essa ação quebra sigilo através de cruzamentos com fontes
											governamentais externas.
										</p>
									</div>
								</div>
							</>
						)}
					</SheetContent>
				</Sheet>

				{/* ============================================= */}
				{/* DASHBOARD DE GASTOS: Cota de Gabinete CMRJ  */}
				{/* Desktop: Sheet lateral | Mobile: Drawer vaul */}
				{/* ============================================= */}
				{!isMobile ? (
					<Sheet open={dashboardOpen} onOpenChange={setDashboardOpen}>
						<SheetContent className="bg-black border-l-2 border-indigo-500 font-mono text-indigo-300 overflow-y-auto w-120 sm:w-140 pt-12 pr-6">
							<VisuallyHidden>
								<SheetTitle>Raio-X de Gastos</SheetTitle>
								<SheetDescription>Dashboard de Cota de Gabinete</SheetDescription>
							</VisuallyHidden>
							<DashboardCotaConteudo
								nome={dashboardNome}
								data={dashboardData}
								loading={dashboardLoading}
							/>
						</SheetContent>
					</Sheet>
				) : (
					<Drawer.Root open={dashboardOpen} onOpenChange={setDashboardOpen}>
						<Drawer.Portal>
							<Drawer.Overlay className="fixed inset-0 bg-black z-40" />
							<Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-black border-t-2 border-indigo-500 font-mono text-indigo-300 max-h-[90vh] rounded-t-2xl">
								<div className="flex justify-center py-3">
									<div className="w-12 h-1 rounded-full bg-indigo-700" />
								</div>
								<div className="overflow-y-auto px-4 pb-8">
									<DashboardCotaConteudo
										nome={dashboardNome}
										data={dashboardData}
										loading={dashboardLoading}
									/>
								</div>
							</Drawer.Content>
						</Drawer.Portal>
					</Drawer.Root>
				)}

				<ShareDialog
					open={isShareOpen}
					onOpenChange={setIsShareOpen}
					data={shareData}
					isMobile={false}
				/>
			</div>
		</div>
	);
}

export default function PoligrafoDashboardRoot() {
	return (
		<ReactFlowProvider>
			<DashboardArea />
		</ReactFlowProvider>
	);
}
