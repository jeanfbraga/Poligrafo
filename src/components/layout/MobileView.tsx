import {
	Briefcase,
	Building2,
	ChevronLeft,
	ChevronRight,
	DollarSign,
	Download,
	ExternalLink,
	FileText,
	Landmark,
	Loader2,
	Scale,
	Search,
	Share2,
	ShieldAlert,
	Terminal,
	User,
	Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { toast } from "sonner";
import {
	AIProgressBar,
	ENTITY_THEME,
	getVisual,
	NodeLoadingBar,
	resolveRisk,
	ContratoNode,
	DespesaNode,
	EmendaNode,
	EmendaResumoNode,
	EmpresaNode,
	OrgaoNode,
	PessoaNode,
	ProcessoJudicialNode,
	RaioXGastosNode,
	SocioNode
} from "@/components/nodes";
import SearchBar from "@/components/search/SearchBar";
import { type ShareData, ShareDialog } from "@/components/shared/ShareDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CyberLabel } from "@/components/ui/cyber-label";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { getPortalTransparenciaFallback } from "@/lib/utils";

/* ================================================================
   DESIGN SYSTEM — REGRAS GLOBAIS
   - Font mínima: 12px (em uppercase ou bold)
   - Escalas de font: 12 / 16 / 20 / 24px
   - Touch target mínimo: 36px (idealmente 44px)
   - Cores: score>=85 RED | score>=60 YELLOW | score<60 SLATE
   - Outros tipos: EMENDA=teal, EMPRESA=blue, SOCIO=purple, CONTRATO=yellow
   ================================================================ */

const MobileAvatar = ({ rootNode, className = "h-10 w-10" }: { rootNode: any; className?: string }) => {
	const [useFallback, setUseFallback] = useState(false);
	const [error, setError] = useState(false);

	const imgSrc = useFallback && rootNode.data?.urlFotoFallback ? rootNode.data.urlFotoFallback : rootNode.data?.urlFoto;

	if ((!rootNode.data?.urlFoto && !rootNode.data?.urlFotoFallback) || error) {
		return <User className={`${className} text-green-500 shrink-0`} />;
	}

	return (
		<img
			src={imgSrc || rootNode.data?.urlFotoFallback}
			alt={rootNode.data?.label || "Avatar"}
			className={`${className} object-cover rounded-sm border border-green-500 shrink-0 bg-green-950/30`}
			onError={() => {
				if (!useFallback && rootNode.data?.urlFotoFallback) {
					setUseFallback(true);
				} else {
					setError(true);
				}
			}}
		/>
	);
};



function getCardStyles(type: string, score: number) {
	if (type === "DESPESA") {
		if (score >= 85)
			return {
				variant: "cyber-red" as const,
				bg: "bg-red-950/20",
				text: "text-red-500",
				border: "border-red-500",
				icon: <ShieldAlert className="w-5 h-5 text-red-500" />,
				riskLabel: "CRÍTICO",
			};
		return {
			variant: "cyber-yellow" as const,
			bg: "bg-yellow-950/20",
			text: "text-yellow-500",
			border: "border-yellow-500",
			icon: <DollarSign className="w-5 h-5 text-yellow-500" />,
			riskLabel: "ALERTA",
		};
	}
	if (type === "CONTRATO")
		return {
			variant: "cyber-yellow" as const,
			bg: "bg-yellow-950/10",
			text: "text-yellow-500",
			border: "border-yellow-500",
			icon: <FileText className="w-5 h-5 text-yellow-500" />,
			riskLabel: "",
		};
	if (type === "EMENDA" || type === "EMENDA_RESUMO") {
		if (score >= 85)
			return {
				variant: "cyber-red" as const,
				bg: "bg-red-950/20",
				text: "text-red-500",
				border: "border-red-500",
				icon: <ShieldAlert className="w-5 h-5 text-red-500" />,
				riskLabel: "CRÍTICO",
			};
		return {
			variant: "cyber-green" as const,
			bg: "bg-green-950/10",
			text: "text-green-500",
			border: "border-green-500",
			icon: <Landmark className="w-5 h-5 text-green-500" />,
			riskLabel: "REGULAR",
		};
	}
	if (type === "EMPRESA") {
		if (score >= 85)
			return {
				variant: "cyber-red" as const,
				bg: "bg-red-950/20",
				text: "text-red-500",
				border: "border-red-500",
				icon: <ShieldAlert className="w-5 h-5 text-red-500" />,
				riskLabel: "CRÍTICO",
			};
		return {
			variant: "cyber-slate" as const,
			bg: "bg-slate-900",
			text: "text-slate-300",
			border: "border-slate-700",
			icon: <Briefcase className="w-5 h-5 text-slate-400" />,
			riskLabel: "INFO",
		};
	}
	if (type === "SOCIO")
		return {
			variant: "cyber-purple" as const,
			bg: "bg-purple-950/20",
			text: "text-purple-400",
			border: "border-purple-500",
			icon: <Users className="w-5 h-5 text-purple-400" />,
			riskLabel: "",
		};
	if (type === "PROCESSO_JUDICIAL")
		return {
			variant: "cyber-red" as const,
			bg: "bg-red-950/20",
			text: "text-red-500",
			border: "border-red-600",
			icon: <Scale className="w-5 h-5 text-red-500" />,
			riskLabel: "",
		};
	return {
		variant: "cyber-green" as const,
		bg: "bg-green-950/20",
		text: "text-green-500",
		border: "border-green-500/50",
		icon: <FileText className="w-5 h-5 text-green-500" />,
		riskLabel: "",
	};
}

const dotBg = {
	backgroundImage: "radial-gradient(circle, #002200 1.5px, transparent 1.5px)",
	backgroundSize: "30px 30px",
};

type TabKey = "TODOS" | "CRITICO" | "ATENCAO" | "NORMAL" | "OUTROS";
const TABS: {
	key: TabKey;
	label: string;
	color: string;
	activeColor: string;
}[] = [
	{
		key: "TODOS",
		label: "TODOS",
		color: "text-green-600 border-green-900",
		activeColor: "text-green-400 border-green-500 bg-green-500/10",
	},
	{
		key: "CRITICO",
		label: "CRÍTICO",
		color: "text-red-700 border-red-900",
		activeColor: "text-red-400 border-red-500 bg-red-500/10",
	},
	{
		key: "ATENCAO",
		label: "ATENÇÃO",
		color: "text-yellow-700 border-yellow-900",
		activeColor: "text-yellow-400 border-yellow-500 bg-yellow-500/10",
	},
	{
		key: "NORMAL",
		label: "NORMAL",
		color: "text-slate-600 border-slate-800",
		activeColor: "text-slate-300 border-slate-500 bg-slate-500/10",
	},
	{
		key: "OUTROS",
		label: "OUTROS",
		color: "text-teal-700 border-teal-900",
		activeColor: "text-teal-400 border-teal-500 bg-teal-500/10",
	},
];

function classifyNode(node: any): TabKey {
	const scoreVal =
		node.data?.score_letalidade !== undefined
			? node.data.score_letalidade
			: node.data?.score;
	const score = Number(scoreVal || 0);
	// Para despesas e emendas, aplicamos a régua dura
	if (score >= 85) return "CRITICO";
	// Match Desktop: Despesa always yellow/alerta se não crítico
	if (score >= 60 || node.type === "DESPESA") return "ATENCAO";
	if (node.type === "EMENDA" || node.type === "EMENDA_RESUMO") return "NORMAL";
	return "OUTROS";
}

interface MobileViewProps {
	nodes: any[];
	edges: any[];
	evidencias: any[];
	isLoading: boolean;
	displayedStatus: string;
	isTyping: boolean;
	handlePivotCNPJ: (cnpj: string, parentId: string) => void;
	handleSocioSearch: (nome: string, parentId: string) => void;
	handleInvestigarContratos?: (cnpj: string, parentId: string) => void;
	onNovaBusca: () => void;
	onExportDossie: () => void;
	isExporting: boolean;
	// Seletor de alçada
	selectedUf: string;
	setSelectedUf: (uf: string) => void;
	alcadas: { sigla: string; nome: string }[];
	onSearch: () => void;
	searchTerm: string;
	setSearchTerm: (v: string) => void;
	statusMessage: string;
}

const NODE_COMPONENTS: Record<string, any> = {
	PESSOA: PessoaNode,
	EMPRESA: EmpresaNode,
	DESPESA: DespesaNode,
	EMENDA: EmendaNode,
	EMENDA_RESUMO: EmendaResumoNode,
	CONTRATO: ContratoNode,
	PROCESSO_JUDICIAL: ProcessoJudicialNode,
	ORGAO: OrgaoNode,
	SOCIO: SocioNode,
	RESUMO_GASTOS: RaioXGastosNode,
};

function MobileResultCard({ node, onSelect, onShare, footer }: { node: any; onSelect: () => void; onShare: (data: any, type: string) => void; footer?: React.ReactNode; }) {
	const Component = NODE_COMPONENTS[node.type];
	if (!Component) return <div className="text-red-500 p-4 font-mono text-xs">Desconhecido: {node.type}</div>;
	
	return (
		<div onClick={onSelect} className="snap-center shrink-0 cursor-pointer w-[80vw] max-w-[320px]">
			<Component data={{ ...node.data, onShare, mobileFooter: footer, mobileOnClick: onSelect }} isMobile={true} />
		</div>
	);
}

export default function MobileView({
	nodes,
	edges,
	evidencias,
	isLoading,
	displayedStatus,
	isTyping,
	handlePivotCNPJ,
	handleSocioSearch,
	handleInvestigarContratos,
	onNovaBusca,
	onExportDossie,
	isExporting,
	selectedUf,
	setSelectedUf,
	alcadas,
	onSearch,
	searchTerm,
	setSearchTerm,
	statusMessage,
}: MobileViewProps) {
	const [selectedCard, setSelectedCard] = useState<any | null>(null);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [searchDrawerOpen, setSearchDrawerOpen] = useState(false);
	const [beneficiaryContracts, setBeneficiaryContracts] = useState<any[]>([]);
	const [loadingBeneficiaryContracts, setLoadingBeneficiaryContracts] =
		useState<boolean>(false);

	useEffect(() => {
		setBeneficiaryContracts([]);
		setLoadingBeneficiaryContracts(false);
	}, []);

	// Nível 2 - Sub Galeria
	const [subGalleryOwnerId, setSubGalleryOwnerId] = useState<string | null>(
		null,
	);
	const [subGalleryDrawerOpen, setSubGalleryDrawerOpen] = useState(false);
	const [_activeSubIndex, setActiveSubIndex] = useState(0);
	const subGalleryRef = useRef<HTMLDivElement>(null);
	const subGalleryNodes = useMemo(() => {
		if (!subGalleryOwnerId) return [];
		return edges
			.filter((e) => e.source === subGalleryOwnerId)
			.map((e) => nodes.find((n) => n.id === e.target))
			.filter((n) => Boolean(n) && n.type !== "PESSOA" && n.type !== "ORGAO");
	}, [edges, nodes, subGalleryOwnerId]);
	const subGalleryOwnerCard = useMemo(() => {
		return nodes.find((n) => n.id === subGalleryOwnerId);
	}, [nodes, subGalleryOwnerId]);

	const [activeIndex, setActiveIndex] = useState(0);
	const [activeTab, setActiveTab] = useState<TabKey>("TODOS");
	const galleryRef = useRef<HTMLDivElement>(null);
	const [isShareOpen, setIsShareOpen] = useState(false);
	const [shareData, setShareData] = useState<ShareData | null>(null);

	const rootNode = nodes.find((n: any) => n.type === "PESSOA");

	const handleShareClick = (nodeData: any, type: string) => {
		setShareData({
			politicoNome:
				rootNode?.data?.nomeCivil || rootNode?.data?.label || "Desconhecido",
			politicoCargo: rootNode?.data?.cargo || "Cargo",
			politicoUf: rootNode?.data?.uf || "UF",
			politicoFoto: rootNode?.data?.urlFoto || undefined,
			achadoTipo: type === "EMENDA_RESUMO" ? "EMENDA" : type,
			achadoTitulo: nodeData?.label || "Sem título",
			achadoValor:
				nodeData?.valor !== undefined ? Number(nodeData.valor) : undefined,
			achadoScore: Number(nodeData?.score_letalidade || 0),
			achadoData: nodeData?.dataDocumento || undefined,
			achadoMotivo: nodeData?.motivo_ia || undefined,
			achadoAlerta: nodeData?.risco?.alertas?.[0] || undefined,
			achadoFonteUrl:
				nodeData?.urlDocumento ||
				nodeData?.url_documento ||
				nodeData?.link_documento ||
				undefined,
		});
		setIsShareOpen(true);
	};

	// Merge nodes + evidencias (sem PESSOA/ORGAO, sem duplicatas)
	const allResults = useMemo(() => {
		const fromNodes = nodes.filter(
			(n: any) => n.type !== "PESSOA" && n.type !== "ORGAO",
		);
		const seen = new Set(fromNodes.map((n: any) => n.id));
		const fromEvidencias = evidencias.filter((e: any) => !seen.has(e.id));
		return [...fromNodes, ...fromEvidencias];
	}, [nodes, evidencias]);

	const filteredResults = useMemo(() => {
		if (activeTab === "TODOS") return allResults;
		return allResults.filter((n) => classifyNode(n) === activeTab);
	}, [allResults, activeTab]);

	const tabCounts = useMemo(() => {
		const c: Record<TabKey, number> = {
			TODOS: allResults.length,
			CRITICO: 0,
			ATENCAO: 0,
			NORMAL: 0,
			OUTROS: 0,
		};
		allResults.forEach((n) => {
			c[classifyNode(n)]++;
		});
		return c;
	}, [allResults]);


	// Scroll tracking e centralização fluida para larguras variáveis
	const handleScroll = useCallback(() => {
		if (!galleryRef.current) return;
		const el = galleryRef.current;
		
		// Encontra qual filho está mais próximo do centro do scroll
		const center = el.scrollLeft + el.clientWidth / 2;
		let closestIndex = 0;
		let minDiff = Infinity;
		
		Array.from(el.children).forEach((child, index) => {
			const childCenter = (child as HTMLElement).offsetLeft + child.clientWidth / 2;
			const diff = Math.abs(childCenter - center);
			if (diff < minDiff) {
				minDiff = diff;
				closestIndex = index;
			}
		});
		
		setActiveIndex(closestIndex);
	}, []);

	// Setas de navegação usando o cálculo exato e scroll nativo (evita conflito com snap)
	const scrollTo = useCallback(
		(direction: "prev" | "next") => {
			if (!galleryRef.current) return;
			const el = galleryRef.current;
			const newIndex =
				direction === "next"
					? Math.min(activeIndex + 1, filteredResults.length - 1)
					: Math.max(activeIndex - 1, 0);
			
			const targetChild = el.children[newIndex] as HTMLElement;
			if (targetChild) {
				el.scrollTo({
					left: targetChild.offsetLeft - el.clientWidth / 2 + targetChild.clientWidth / 2,
					behavior: "smooth"
				});
			}
			
			setActiveIndex(newIndex);
		},
		[activeIndex, filteredResults.length],
	);

	useEffect(() => {
		setActiveIndex(0);
		if (galleryRef.current)
			galleryRef.current.scrollTo({ left: 0, behavior: "smooth" });
	}, []);

	useEffect(() => {
		if (nodes.length === 0) {
			setDrawerOpen(false);
			setActiveIndex(0);
			setActiveTab("TODOS");
		}
	}, [nodes.length]);

	const renderSearchDrawer = () => (
		<Drawer open={searchDrawerOpen} onOpenChange={setSearchDrawerOpen}>
			<DrawerContent className="bg-black border-t-2 border-green-500 rounded-none px-5 pb-8 pt-4 z-100 max-h-[90vh]">
				<div className="text-center mb-6 mt-6">
					<CyberLabel>Sistema de Investigação Política</CyberLabel>
					<DrawerTitle className="text-xl font-bold text-green-400 tracking-widest">
						Nova busca
					</DrawerTitle>
				</div>
				<div className="w-full">
					<SearchBar
						searchTerm={searchTerm}
						setSearchTerm={setSearchTerm}
						selectedUf={selectedUf}
						setSelectedUf={setSelectedUf}
						onSearch={(...args: any[]) => {
							setSearchDrawerOpen(false);
							// @ts-expect-error
							onSearch(...args);
						}}
						isLoading={isLoading}
						isMobile={true}
						alcadas={alcadas}
					/>
				</div>
				{statusMessage && !statusMessage.includes("Insira o nome") && (
					<p className="text-xs font-bold font-mono text-yellow-400 tracking-wider leading-tight text-center mt-4">
						{statusMessage}
					</p>
				)}
			</DrawerContent>
		</Drawer>
	);

	/* ================================================================
       TELA 0: BUSCA INICIAL (sem nodes, sem loading)
       ================================================================ */
	if (!isLoading && nodes.length === 0) {
		return (
			<>
				{/* FAB */}
				<div className="fixed bottom-6 left-0 right-0 z-60 flex justify-center pointer-events-none">
					<Button
						variant="cyber"
						onClick={() => setSearchDrawerOpen(true)}
						className="h-14 px-8 pointer-events-auto"
					>
						<Search className="w-5 h-5 mr-2" /> Investigar Político
					</Button>
				</div>

				{renderSearchDrawer()}
			</>
		);
	}

	/* ================================================================
       TELA 1: LOADING
       ================================================================ */
	if (isLoading) {
		return (
			<div
				className="w-full h-full flex flex-col items-center justify-center relative z-20 px-6"
				style={dotBg}
			>
				<div className="absolute top-0 left-0 w-full h-12 border-b border-green-500/30 bg-black flex items-center px-4 gap-2 z-30">
					<div className="flex items-center gap-2 cursor-pointer" onClick={onNovaBusca}>
						<Terminal className="w-5 h-5 text-green-500" />
						<span className="text-base font-bold tracking-widest text-green-500 uppercase">
							POLÍGRAFO
						</span>
					</div>
					<Badge variant="cyber-green" className="ml-1">
						IA
					</Badge>
					<div className="ml-auto">
						<Loader2 className="w-5 h-5 text-green-500 animate-spin" />
					</div>
				</div>

				{rootNode ? (
					<div className="w-full max-w-sm flex flex-col items-center gap-5">
						<div className="w-full border border-green-500 bg-black p-5 font-mono text-green-400 shadow-[0_0_25px_rgba(34,197,94,0.35)] animate-pulse">
							<div className="flex items-center justify-between mb-3 border-b border-green-500/50 pb-2">
								<Badge
									variant="outline"
									className="bg-black text-green-400 border-green-500 rounded-none uppercase text-xs tracking-widest"
								>
									{rootNode.data.cargo || "POLÍTICO"} —{" "}
									{rootNode.data.uf || "??"}
								</Badge>
								<Loader2 className="w-4 h-4 text-green-500 animate-spin" />
							</div>
							<div className="flex items-center gap-3 mb-4">
								<MobileAvatar rootNode={rootNode} className="h-10 w-10" />
								<div>
									<h2 className="text-base font-bold uppercase tracking-widest text-green-400">
										{rootNode.data.label}
									</h2>
									{rootNode.data.nomeCivil && (
										<p className="text-xs text-green-600 uppercase mt-0.5 font-bold">
											{rootNode.data.nomeCivil}
										</p>
									)}
								</div>
							</div>
							{(rootNode.data.documentoPrincipal || rootNode.data.cpf) && (
								<div className="border-t border-green-900/50 pt-3">
									<p className="text-xs uppercase font-bold text-green-500 mb-1">
										DOCUMENTO RAIZ
									</p>
									<span className="text-xs text-green-300 bg-green-500/20 px-2 py-1 font-bold">
										{String(
											rootNode.data.documentoPrincipal || rootNode.data.cpf,
										)}
									</span>
								</div>
							)}
							<div className="mt-5 pt-3 border-t border-green-900/50">
								<div className="flex justify-between text-xs text-green-500 mb-1.5 uppercase font-bold">
									<span>PROCESSANDO DOSSIÊ...</span>
									<span className="animate-pulse">[■■■■■■■■■]</span>
								</div>
								<div className="w-full h-1.5 bg-green-950 overflow-hidden">
									<div
										className="h-full bg-green-500 animate-[slideRight_1.5s_ease-in-out_infinite]"
										style={{ width: "40%" }}
									/>
								</div>
							</div>
						</div>

						{allResults.length > 0 && (
							<div className="w-full border border-green-500/30 bg-black px-3 py-2 flex items-center justify-between">
								<span className="text-xs text-green-500 font-bold uppercase">
									{allResults.length} ACHADOS
								</span>
								<div className="flex gap-1">
									{tabCounts.CRITICO > 0 && (
										<Badge className="bg-red-500/20 text-red-400 border-red-500 rounded-none text-xs px-1.5">
											{tabCounts.CRITICO} 🔴
										</Badge>
									)}
									{tabCounts.ATENCAO > 0 && (
										<Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500 rounded-none text-xs px-1.5">
											{tabCounts.ATENCAO} 🟡
										</Badge>
									)}
								</div>
							</div>
						)}

						<div className="w-full border border-green-900/50 bg-black p-3 font-mono">
							<p className="text-xs text-green-400 leading-tight flex items-start gap-2 font-bold uppercase">
								<span className="text-green-600 shrink-0">{">"}</span>
								<span className="normal-case">
									{displayedStatus || "Iniciando investigação..."}
								</span>
								<span
									className={`inline-block w-2 h-4 ml-1 shrink-0 ${isTyping ? "bg-green-400" : "bg-green-400/50 animate-pulse"}`}
								/>
							</p>
						</div>
					</div>
				) : (
					<div className="w-full max-w-sm flex flex-col items-center gap-5">
						<div className="w-full border border-green-500/30 bg-black p-5 animate-pulse">
							<div className="h-4 w-32 bg-green-900/40 mb-4" />
							<div className="h-6 w-48 bg-green-900/30 mb-2" />
							<div className="h-3 w-24 bg-green-900/20" />
						</div>
						<div className="w-full border border-green-900/50 bg-black p-3">
							<p className="text-xs text-green-400 flex items-center gap-2 font-bold">
								<span className="text-green-600">{">"}</span>
								<span>{displayedStatus || "Conectando às fontes..."}</span>
								<span className="inline-block w-2 h-4 ml-1 bg-green-400/50 animate-pulse" />
							</p>
						</div>
					</div>
				)}
			</div>
		);
	}

	/* ================================================================
       TELA 2: RESULTADOS
       ================================================================ */

	// Cores do drawer baseadas no score (corrigidas: <60 = slate, NÃO red)
	const getDrawerColors = (sc: any) => {
		const score = Number(sc.data?.score_letalidade || 0);
		if (sc.type === "DESPESA") {
			if (score >= 85)
				return {
					variant: "cyber-red" as const,
					text: "text-red-500",
					border: "border-red-900",
					label: "text-red-400/70",
					valueBg: "border-red-900/30",
				};
			if (score >= 60)
				return {
					variant: "cyber-yellow" as const,
					text: "text-yellow-500",
					border: "border-yellow-900",
					label: "text-yellow-400/70",
					valueBg: "border-yellow-900/30",
				};
			return {
				variant: "cyber-slate" as const,
				text: "text-slate-400",
				border: "border-slate-800",
				label: "text-slate-500",
				valueBg: "border-slate-800",
			};
		}
		if (sc.type === "EMPRESA")
			return {
				variant: "cyber-blue" as const,
				text: "text-blue-500",
				border: "border-blue-900",
				label: "text-blue-400/70",
				valueBg: "border-blue-900/30",
			};
		if (sc.type.startsWith("EMENDA"))
			return {
				variant: "cyber-teal" as const,
				text: "text-teal-500",
				border: "border-teal-900",
				label: "text-teal-400/70",
				valueBg: "border-teal-900/30",
			};
		if (sc.type === "CONTRATO")
			return {
				variant: "cyber-yellow" as const,
				text: "text-yellow-500",
				border: "border-yellow-900",
				label: "text-yellow-400/70",
				valueBg: "border-yellow-900/30",
			};
		if (sc.type === "SOCIO")
			return {
				variant: "cyber-purple" as const,
				text: "text-purple-400",
				border: "border-purple-900",
				label: "text-purple-400/70",
				valueBg: "border-purple-900/30",
			};
		return {
			variant: "cyber-green" as const,
			text: "text-green-500",
			border: "border-green-900",
			label: "text-green-400/70",
			valueBg: "border-green-900/30",
		};
	};

	return (
		<div className="w-full h-full flex flex-col relative z-20" style={dotBg}>
			{/* HEADER: h-12 min, touch-friendly */}
			<div className="h-12 border-b border-green-500/50 bg-black backdrop-blur shrink-0 flex items-center justify-between px-4 z-30">
				<div className="flex items-center gap-2 cursor-pointer" onClick={onNovaBusca}>
					<Terminal className="w-5 h-5 text-green-500" />
					<span className="text-base font-bold tracking-widest text-green-500 uppercase">
						POLÍGRAFO
					</span>
				</div>
				<Button
					variant="outline"
					className="border-green-500 bg-black text-green-500 rounded-none font-bold uppercase text-xs h-9 px-4"
					onClick={() => setSearchDrawerOpen(true)}
				>
					<Search className="w-4 h-4 mr-1.5" />
					NOVA BUSCA
				</Button>
			</div>
			{renderSearchDrawer()}

			{/* HERO: Político */}
			{rootNode && (
				<div className="shrink-0 border-b border-green-500/30 bg-black px-4 py-3">
					<div className="flex items-center gap-3">
						<MobileAvatar rootNode={rootNode} className="h-10 w-10" />
						<div className="flex-1 min-w-0">
							<h2 className="text-xs font-bold uppercase tracking-widest text-green-400 truncate">
								{rootNode.data.label}
							</h2>
							<p className="text-xs text-green-600 uppercase font-bold">
								{rootNode.data.cargo || "POLÍTICO"} — {rootNode.data.uf || "??"}
							</p>
						</div>
					</div>
				</div>
			)}

			{/* ABAS: min h-10, font-bold 12px */}
			<div
				className="shrink-0 border-b border-green-900/50 bg-black flex overflow-x-auto"
				style={{ scrollbarWidth: "none" }}
			>
				{TABS.map((tab) => {
					const count = tabCounts[tab.key];
					if (tab.key !== "TODOS" && count === 0) return null;
					const isActive = activeTab === tab.key;
					return (
						<button
							key={tab.key}
							onClick={() => setActiveTab(tab.key)}
							className={`shrink-0 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors min-h-10 ${isActive ? tab.activeColor : `${tab.color} border-transparent`}`}
						>
							{tab.label} <span className="opacity-60">({count})</span>
						</button>
					);
				})}
			</div>

			{/* GALERIA COM SETAS */}
			<div className="flex-1 flex flex-col justify-center overflow-hidden relative">
				{filteredResults.length === 0 ? (
					<div className="text-center font-mono text-green-700 uppercase tracking-widest text-xs px-6">
						<ShieldAlert className="w-8 h-8 text-green-700/50 mx-auto mb-3" />
						<p className="text-xs font-bold">
							&gt;{" "}
							{allResults.length === 0
								? "NENHUM VÍNCULO ENCONTRADO"
								: "NENHUM ITEM NESTA CATEGORIA"}
						</p>
					</div>
				) : (
					<>
						{/* Seta esquerda */}
						{activeIndex > 0 && (
							<button
								onClick={() => scrollTo("prev")}
								className="absolute left-1 top-1/2 -translate-y-1/2 z-20 w-9 h-9 flex items-center justify-center border border-green-500/50 bg-black text-green-500 active:bg-green-900"
							>
								<ChevronLeft className="w-5 h-5" />
							</button>
						)}
						{/* Seta direita */}
						{activeIndex < filteredResults.length - 1 && (
							<button
								onClick={() => scrollTo("next")}
								className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-9 h-9 flex items-center justify-center border border-green-500/50 bg-black text-green-500 active:bg-green-900"
							>
								<ChevronRight className="w-5 h-5" />
							</button>
						)}

						<div
							ref={galleryRef}
							onScroll={handleScroll}
							className="w-full flex gap-4 overflow-x-auto snap-x snap-mandatory py-4 items-center h-full scroll-smooth before:content-[''] before:shrink-0 before:w-[10vw] sm:before:w-[calc(50vw-160px)] after:content-[''] after:shrink-0 after:w-[10vw] sm:after:w-[calc(50vw-160px)]"
							style={{
								scrollbarWidth: "none",
								msOverflowStyle: "none",
								WebkitOverflowScrolling: "touch",
							}}
						>
							{filteredResults.map((node: any) => {
								const cardEdges = edges.filter((e: any) => e.source === node.id);
								const s = getCardStyles(node.type, Number(node.data?.score_letalidade || 0));
								
								let footer = null;
								if (cardEdges.length > 0) {
									footer = (
										<Button
											variant="outline"
											className={`w-full bg-black ${s.text} ${s.border} active:scale-95 transition-all text-xs font-bold uppercase tracking-widest h-10 mt-3`}
											onClick={(e) => {
												e.stopPropagation();
												setSubGalleryOwnerId(node.id);
												setActiveSubIndex(0);
												setSubGalleryDrawerOpen(true);
											}}
										>
											ITEM COM CONEXÕES ({cardEdges.length})
										</Button>
									);
								} else if (node.type === "EMPRESA" && handleInvestigarContratos && !node.data.isSearching) {
									footer = (
										<Button
											variant="outline"
											className={`w-full bg-blue-950/20 text-blue-400 border-blue-900 active:bg-blue-900 transition-all text-[10px] font-bold uppercase tracking-widest h-10 mt-3`}
											onClick={(e) => {
												e.stopPropagation();
												handleInvestigarContratos(node.data.cnpj || node.data.documento, node.id);
											}}
										>
											<Search className="w-3 h-3 mr-1.5" /> INVESTIGAR CONTRATOS (PNCP)
										</Button>
									);
								}

								return (
									<MobileResultCard
										key={node.id}
										node={node}
										onSelect={() => {
											setSelectedCard(node);
											setDrawerOpen(true);
										}}
										onShare={handleShareClick}
										footer={footer}
									/>
								);
							})}
						</div>
					</>
				)}
			</div>

			{/* PAGINATOR */}
			{filteredResults.length > 0 && (
				<div className="h-6 shrink-0 flex justify-center items-center">
					{filteredResults.length <= 20 ? (
						<div className="flex gap-1.5">
							{filteredResults.map((_: any, i: number) => (
								<div
									key={i}
									className={`w-2 h-2 border border-black transition-all duration-300 ${i === activeIndex ? "bg-green-400 scale-150" : "bg-green-800"}`}
								/>
							))}
						</div>
					) : (
						<span className="text-xs text-green-700 font-mono uppercase font-bold">
							{activeIndex + 1} / {filteredResults.length}
						</span>
					)}
				</div>
			)}

			{/* FAB: Exportar */}
			{allResults.length > 0 && (
				<div className="shrink-0 px-4 py-3 bg-black border-t border-green-500/30">
					<Button
						onClick={onExportDossie}
						disabled={isExporting}
						className="w-full bg-green-600 hover:bg-green-500 text-black font-bold uppercase tracking-widest rounded-none border border-green-400 h-12 text-xs shadow-[0_0_20px_rgba(34,197,94,0.3)]"
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
				</div>
			)}

			{/* NÍVEL 2: SUB-GALERIA DE CONEXÕES */}
			<Drawer
				open={subGalleryDrawerOpen}
				onOpenChange={setSubGalleryDrawerOpen}
			>
				<DrawerContent className="h-[90vh]">
					<div className="p-4 border-b border-green-900 border-dashed relative">
						<Badge variant="cyber-green" className="w-fit mb-2">
							NÍVEL 2 • CONEXÕES
						</Badge>
						<DrawerTitle className="text-sm font-bold uppercase tracking-widest text-green-400">
							{subGalleryOwnerCard?.data?.label}
						</DrawerTitle>
						<DrawerDescription className="text-xs mt-1 text-green-500/70">
							{subGalleryNodes.length} Item(s) Encontrado(s)
						</DrawerDescription>
					</div>

					<div className="flex-1 relative w-full h-full flex items-center justify-center overflow-hidden bg-black py-4">
						<div
							ref={subGalleryRef}
							className="w-full flex gap-4 overflow-x-auto snap-x snap-mandatory py-4 items-center h-full pb-8 scroll-smooth before:content-[''] before:shrink-0 before:w-[10vw] sm:before:w-[calc(50vw-160px)] after:content-[''] after:shrink-0 after:w-[10vw] sm:after:w-[calc(50vw-160px)]"
							style={{
								scrollbarWidth: "none",
								msOverflowStyle: "none",
								WebkitOverflowScrolling: "touch",
							}}
						>
							{subGalleryNodes.map((node: any) => {
								return (
									<MobileResultCard
										key={`sub-${node.id}`}
										node={node}
										onSelect={() => {
											setSelectedCard(node);
										}}
										onShare={handleShareClick}
									/>
								);
							})}
						</div>
					</div>
				</DrawerContent>
			</Drawer>

			{/* NÍVEL 3 (E Detalhes de Nivel 1): BOTTOM SHEET — Com ações do desktop (Nota Fiscal, IA, Pivot) */}
			<Drawer
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
				nested={subGalleryDrawerOpen}
			>
				<DrawerContent>
					<DrawerTitle className="sr-only">
						Detalhes da Investigação
					</DrawerTitle>
					{selectedCard &&
						(() => {
							const sc = selectedCard;
							const scScore = Number(sc.data?.score_letalidade || 0);
							const dc = getDrawerColors(sc);

							return (
								<div
									className="p-5 overflow-y-auto max-h-[85vh] font-mono"
									style={{ scrollbarWidth: "none" }}
								>
									<DrawerHeader
										className={`px-0 pt-0 border-b border-dashed ${dc.border} pb-4 mb-4 text-left`}
									>
										<Badge variant={dc.variant} className="w-fit mb-2">
											{sc.type === "EMENDA_RESUMO" ? "EMENDA" : sc.type}{" "}
											{sc.type === "DESPESA" ? `• SCORE ${scScore}/100` : ""}
										</Badge>
										<h2
											className={`text-base font-bold uppercase tracking-widest ${dc.text} m-0`}
										>
											{sc.data?.label}
										</h2>
										{sc.data?.documento && (
											<DrawerDescription
												className={`font-mono text-xs mt-1 font-bold ${dc.label}`}
											>
												CNPJ/CPF: {sc.data.documento}
											</DrawerDescription>
										)}
									</DrawerHeader>

									<div className="space-y-5">
										{/* VALOR */}
										{(sc.data?.valor || sc.data?.valor === 0) && (
											<div
												className={`p-3 border ${dc.valueBg} bg-black text-center`}
											>
												<p className="text-xs uppercase font-bold opacity-50 mb-1">
													VALOR / MONTANTE
												</p>
												<p
													className={`text-xl font-bold tracking-widest ${dc.text}`}
												>
													R${" "}
													{Number(sc.data.valor).toLocaleString("pt-BR", {
														minimumFractionDigits: 2,
													})}
												</p>
											</div>
										)}

										{/* FORNECEDOR */}
										{sc.data?.nomeFornecedor && (
											<div>
												<p className="text-xs uppercase font-bold opacity-50 mb-1">
													FORNECEDOR
												</p>
												<p className={`text-xs font-bold ${dc.text}`}>
													{sc.data.nomeFornecedor}
												</p>
											</div>
										)}

										{/* TIPO DE DESPESA */}
										{sc.data?.tipoDespesa && (
											<div>
												<p className="text-xs uppercase font-bold opacity-50 mb-1">
													TIPO
												</p>
												<p className={`text-xs font-bold ${dc.text}`}>
													{sc.data.tipoDespesa}
												</p>
											</div>
										)}
										{sc.data?.tipo && !sc.data?.tipoDespesa && (
											<div>
												<p className="text-xs uppercase font-bold opacity-50 mb-1">
													TIPO
												</p>
												<p className={`text-xs font-bold ${dc.text}`}>
													{sc.data.tipo}
												</p>
											</div>
										)}

										{/* DATA */}
										{sc.data?.dataDocumento && (
											<div>
												<p className="text-xs uppercase font-bold opacity-50 mb-1">
													DATA
												</p>
												<p className={`text-xs font-bold ${dc.text}`}>
													{sc.data.dataDocumento}
												</p>
											</div>
										)}

										{/* ===== AÇÃO: NOTA FISCAL (igual ao desktop) ===== */}
										{sc.type === "DESPESA" && (
											<div>
												<p
													className={`text-xs uppercase font-bold mb-2 border-b pb-1 ${dc.border} ${dc.label}`}
												>
													COMPROVAÇÃO FISCAL
												</p>
												{sc.data?.urlDocumento ? (
													<a
														href={sc.data.urlDocumento}
														target="_blank"
														rel="noopener noreferrer"
														className="flex w-full items-center justify-center p-3 border bg-blue-950/20 border-blue-900 text-blue-400 active:bg-blue-900/40 text-xs font-bold uppercase tracking-widest min-h-11"
													>
														<ExternalLink className="w-4 h-4 mr-2" /> VER NOTA
														DIGITALIZADA
													</a>
												) : (
													<div className="space-y-2">
														{(() => {
															const fallback = getPortalTransparenciaFallback(
																rootNode?.data?.casa as string | undefined,
																rootNode?.data?.uri as string | undefined,
															);
															return (
																<>
																	<p className="text-[11px] text-slate-500 leading-tight mb-2">
																		{fallback.mensagem}
																	</p>
																	{fallback.link !== "#" && (
																		<a
																			href={fallback.link}
																			target="_blank"
																			rel="noopener noreferrer"
																			className="flex w-full items-center justify-center p-3 border bg-slate-900/50 border-slate-700 text-slate-300 active:bg-slate-800 text-xs font-bold uppercase tracking-widest min-h-11"
																		>
																			<ExternalLink className="w-4 h-4 mr-2" />{" "}
																			{fallback.textoLink}
																		</a>
																	)}
																</>
															);
														})()}
													</div>
												)}
											</div>
										)}

										{/* SITUAÇÃO EMPRESA */}
										{sc.type === "EMPRESA" && sc.data?.situacao && (
											<div>
												<p className="text-xs uppercase font-bold opacity-50 mb-1">
													SITUAÇÃO
												</p>
												<p className="text-xs text-blue-400 font-bold">
													{sc.data.situacao}
												</p>
											</div>
										)}

										{/* ===== AÇÃO: PIVOT CNPJ (EMPRESA) ===== */}
										{sc.type === "EMPRESA" && (
											<Button
												variant="outline"
												className="w-full bg-blue-950/20 text-blue-400 border-blue-900 active:bg-blue-900 rounded-none text-xs font-bold uppercase h-12"
												onClick={() => {
													handlePivotCNPJ(
														sc.data?.cnpj || sc.data?.documento,
														sc.id,
													);
													setDrawerOpen(false);
												}}
											>
												<Briefcase className="mr-2 h-4 w-4" /> APROFUNDAR DOSSIÊ
												(QSA)
											</Button>
										)}

										{/* ===== AÇÃO: BUSCA REVERSA (SÓCIO) ===== */}
										{sc.type === "SOCIO" && (
											<Button
												variant="outline"
												className="w-full bg-purple-950/20 text-purple-400 border-purple-900 active:bg-purple-900 rounded-none text-xs font-bold uppercase h-12"
												onClick={() => {
													handleSocioSearch(sc.data?.label, sc.id);
													setDrawerOpen(false);
												}}
											>
												<Users className="mr-2 h-4 w-4" /> BUSCA REVERSA
											</Button>
										)}

										{/* ===== IA ANALYSIS ===== */}
										{sc.data?.motivo_ia && (
											<div className="mt-4">
												<AIProgressBar
													score={Number(sc.data?.score_letalidade || 0)}
													motivo={sc.data.motivo_ia}
												/>
											</div>
										)}

										{/* ===== ALERTAS OSINT (CGU/TCU/RECEITA) ===== */}
										{sc.data?.risco?.alertas?.length > 0 && (
											<div>
												<p className="text-xs uppercase font-bold text-red-600 mb-2 border-b border-red-900 pb-1">
													&gt; CRUZAMENTO DE DADOS OFICIAIS
												</p>
												<ul className="space-y-2">
													{sc.data.risco.alertas.map(
														(alerta: string, idx: number) => (
															<li
																key={idx}
																className="flex gap-2 text-xs text-red-400 wrap-break-word w-full font-bold"
															>
																<ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
																<span className="leading-tight">{alerta}</span>
															</li>
														),
													)}
												</ul>
											</div>
										)}

										{/* BENEFICIÁRIO E CONTRATOS DO RECEBEDOR (PNCP) MOBILE */}
										{sc.type === "EMENDA" && sc.data?.beneficiario && (
											<div className="mt-4 pt-4 border-t border-slate-800">
												<p className="text-xs uppercase font-bold text-teal-500 mb-2 border-b border-teal-900 pb-1 flex items-center gap-1 font-mono">
													<Building2 className="w-4 h-4" /> BENEFICIÁRIO
													RECEBEDOR
												</p>
												<div className="p-3 border bg-teal-950/10 border-teal-900/30 text-teal-400 text-xs leading-relaxed uppercase tracking-wide mb-3">
													<span className="opacity-60 font-bold">NOME:</span>{" "}
													{sc.data.beneficiario.nome}
													<br />
													<span className="opacity-60 font-bold">CNPJ:</span>{" "}
													{sc.data.beneficiario.cnpj}
													<br />
													<span className="opacity-60 font-bold">UF:</span>{" "}
													{sc.data.beneficiario.uf}
													<br />
													{sc.data.beneficiario.area && (
														<>
															<span className="opacity-60 font-bold">
																ÁREA:
															</span>{" "}
															{sc.data.beneficiario.area}
															<br />
														</>
													)}
													{sc.data.beneficiario.situacao && (
														<>
															<span className="opacity-60 font-bold">
																SITUAÇÃO:
															</span>{" "}
															{sc.data.beneficiario.situacao}
														</>
													)}
												</div>

												{beneficiaryContracts.length === 0 ? (
													<Button
														variant="outline"
														disabled={loadingBeneficiaryContracts}
														className="w-full bg-teal-950/20 text-teal-400 border border-teal-850 active:bg-teal-900 rounded-none text-xs font-bold uppercase h-12"
														onClick={async () => {
															setLoadingBeneficiaryContracts(true);
															try {
																const res = await fetch(
																	`/api/investigar/contratos-beneficiario?cnpj=${sc.data.beneficiario.cnpj}`,
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
														INVESTIGAR CONTRATOS DO RECEBEDOR (PNCP)
													</Button>
												) : (
													<div className="space-y-2">
														<p className="text-[11px] font-bold uppercase text-teal-500 flex items-center gap-1">
															<Briefcase className="w-3.5 h-3.5" /> ÚLTIMOS
															CONTRATOS PNCP ({beneficiaryContracts.length})
														</p>
														<div className="space-y-2 max-h-45 overflow-y-auto pr-1">
															{beneficiaryContracts.map(
																(c: any, idx: number) => (
																	<div
																		key={idx}
																		className="p-2 border border-slate-800 bg-slate-950/50 text-[10px] leading-relaxed font-mono"
																	>
																		<div className="flex justify-between items-start mb-1">
																			<span className="font-bold text-teal-400 text-[8px] bg-teal-950/50 px-1 border border-teal-900">
																				{c.tipo === "COMPRADOR"
																					? "COMPRADOR"
																					: "FORNECEDOR"}
																			</span>
																			<span className="text-slate-500 text-[8px]">
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
																		<p className="text-slate-400 mt-1 uppercase text-[9px] line-clamp-2">
																			{c.objeto}
																		</p>
																		<p className="text-right text-green-400 font-bold mt-1 text-[9px]">
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
								</div>
							);
						})()}
				</DrawerContent>
			</Drawer>
			<ShareDialog
				open={isShareOpen}
				onOpenChange={setIsShareOpen}
				data={shareData}
				isMobile={true}
			/>
		</div>
	);
}
