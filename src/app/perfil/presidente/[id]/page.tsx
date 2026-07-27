"use client";

import { useEffect, useState, useRef, use } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ArrowLeft, Lock, Unlock, AlertTriangle, User, Landmark, CreditCard, ChevronRight, ChevronDown, ChevronUp, Calendar, ArrowDown, ArrowRight, ExternalLink, Activity, Info, AlertCircle, FileWarning } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { useRouter } from "next/navigation";
import { ScrambleText } from "@/components/ui/scramble-text";

export default function PresidentePerfilPage(props: { params: Promise<{ id: string }> }) {
	const params = use(props.params);
	const router = useRouter();
	const [data, setData] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
	const [lastExpandedGroup, setLastExpandedGroup] = useState<string | null>(null);
	const [currentPage, setCurrentPage] = useState(1);
	const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
	const accordionRefs = useRef<Record<string, HTMLDivElement | null>>({});

	useGSAP(() => {
		Object.keys(accordionRefs.current).forEach((key) => {
			const wrapper = accordionRefs.current[key];
			if (wrapper) {
				const inner = wrapper.children[0];
				const rows = wrapper.querySelectorAll(".transaction-row");

				// Mata animações antigas para evitar bugs se o usuário clicar rápido demais
				gsap.killTweensOf([wrapper, inner, rows]);

				if (expandedGroup === key) {
					// Animação de Entrada - Deixa a expansão da altura revelar as linhas naturalmente
					gsap.to(wrapper, { height: "auto", opacity: 1, duration: 0.35, ease: "power2.out" });
				} else {
					// Animação de Saída
					gsap.to(wrapper, { height: 0, opacity: 0, duration: 0.25, ease: "power2.inOut" });
				}
			}
		});
	}, [expandedGroup]);



	useEffect(() => {
		async function loadPerfil() {
			try {
				const res = await fetch(`/api/perfil/presidente/${params.id}`);
				if (!res.ok) {
					throw new Error("Perfil não encontrado ou erro na API");
				}
				const json = await res.json();
				setData(json);
			} catch (err: any) {
				setError(err.message);
			} finally {
				setLoading(false);
			}
		}
		loadPerfil();
	}, [params.id]);

	if (loading) {
		return (
			<div className="min-h-screen bg-black text-green-500 font-mono flex flex-col items-center justify-center">
				<div className="animate-pulse flex flex-col items-center">
					<Lock className="w-12 h-12 mb-4" />
					<p className="text-base md:text-xl tracking-widest uppercase text-center px-4">
						<ScrambleText text="Acessando base de dados federal..." duration={1500} />
					</p>
					<p className="text-xs md:text-sm mt-2 text-green-700 text-center px-4">
						<ScrambleText text="Decriptando extratos CPGF" duration={1000} delay={500} />
					</p>
				</div>
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="min-h-screen bg-black text-green-500 font-mono p-8">
				<Button variant="cyber" onClick={() => router.push("/")} className="mb-8">
					<ArrowLeft className="mr-2 h-4 w-4" /> Voltar
				</Button>
				<div className="border border-red-500 bg-red-950/20 p-6 rounded-none max-w-2xl">
					<h2 className="text-red-500 text-2xl mb-2 flex items-center gap-2 font-bold uppercase">
						<AlertTriangle /> ACESSO NEGADO / ERRO
					</h2>
					<p className="text-red-400">{error}</p>
				</div>
			</div>
		);
	}

	const { perfil, tse, cpgf } = data;
	const isBolsonaro = perfil.id === "bolsonaro";

	const formatMoney = (val: number) =>
		Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

	const percentSigiloso = cpgf.countTotal > 0 ? ((cpgf.countSigiloso / cpgf.countTotal) * 100).toFixed(1) : 0;

	// Agrupamento por Ano -> Mês
	const groupedByYear: Record<string, Record<string, any[]>> = {};
	if (cpgf?.topDespesas) {
		cpgf.topDespesas.forEach((item: any) => {
			if (!item.data) return;
			const parts = item.data.split("/");
			if (parts.length === 3) {
				const year = parts[2];
				const month = parts[1];
				if (!groupedByYear[year]) groupedByYear[year] = {};
				if (!groupedByYear[year][month]) groupedByYear[year][month] = [];
				groupedByYear[year][month].push(item);
			}
		});
	}
	const sortedYears = Object.keys(groupedByYear).sort((a, b) => b.localeCompare(a));

	const ITEMS_PER_PAGE = 50;

	// Componente adaptativo
	return (
		<div className="min-h-screen flex flex-col bg-black text-green-500 font-mono overflow-x-hidden relative">
			
			{/* Top Bar padronizada com botão voltar */}
			<SiteHeader />

			<div className="p-4 md:p-8">
				<div className="max-w-6xl mx-auto mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
					<Button 
						variant="ghost" 
						className="text-green-500 hover:text-green-400 hover:bg-green-950 px-3 uppercase tracking-widest text-xs"
						onClick={() => router.push("/")}
					>
						<ArrowLeft className="mr-2 h-4 w-4" /> Voltar
					</Button>
					<div className="text-right">
						<p className="text-xs text-green-700 uppercase tracking-widest">Nível de Acesso: CONFIDENCIAL</p>
						<p className="text-xs text-green-600 uppercase">Origem: PORTAL_TRANSPARENCIA + TSE</p>
					</div>
				</div>

			<div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
				{/* Coluna Esquerda: Info do Presidente */}
				<div className="md:col-span-1 space-y-6">
					<div className="border border-green-500 bg-green-950/10 p-4 md:p-6 relative">
						<div className="absolute top-0 right-0 p-2 text-xs text-green-700">ID: {perfil.id.toUpperCase()}</div>
						<div className="w-24 h-24 bg-green-900/30 border border-green-500 mb-4 flex items-center justify-center">
							{tse?.idTse ? (
								<img
									src={tse?.fotoUrl ? `/api/proxy-image?url=${encodeURIComponent(tse.fotoUrl)}&raw=true` : `/api/proxy-image?url=${encodeURIComponent(`https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/${tse.idEleicao}/${tse.idTse}/${tse.idUe}`)}&raw=true`}
									alt={perfil.nome}
									className="w-full h-full object-cover"
									onError={(e) => (e.currentTarget.style.display = 'none')}
								/>
							) : (
								<User className="w-12 h-12 text-green-700" />
							)}
						</div>
						<h1 className="text-2xl font-bold uppercase mb-1">
							<ScrambleText text={perfil.nome} duration={1200} />
						</h1>
						<p className="text-sm text-green-400 bg-green-900/30 px-2 py-1 inline-block uppercase tracking-wider border border-green-500/50 mb-4">
							{perfil.cargo}
						</p>

						<div className="space-y-3 pt-4 border-t border-green-900/50">
							<div>
								<p className="text-xs text-green-600 uppercase">Período de Análise</p>
								<p className="text-sm font-bold">{perfil.mandato}</p>
							</div>
							<div>
								<p className="text-xs text-green-600 uppercase">Documento Principal</p>
								<p className="text-sm font-bold">{tse?.cpf ? tse.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-**") : "RESTRITO"}</p>
							</div>
						</div>
					</div>

					<div className="border border-green-500 bg-green-950/10 p-4 md:p-6">
						<div className="flex items-center mb-4 text-green-500">
							<h2 className="text-base md:text-lg uppercase font-bold tracking-wider">Patrimônio Declarado</h2>
						</div>
						<p className="text-3xl font-bold text-green-400 mb-2">{formatMoney(tse?.patrimonio || 0)}</p>
						<p className="text-xs text-green-600 uppercase mb-4">Fonte: TSE ({tse?.eleicao})</p>

						{tse?.bens?.length > 0 && (
							<div className="space-y-2">
								{tse.bens.map((b: any, i: number) => (
									<div key={i} className="text-xs border-l-2 border-green-500 pl-2">
										<p className="text-green-300" title={b.descricao}>{b.descricao}</p>
										<p className="text-green-500 font-bold">{formatMoney(b.valor)}</p>
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Coluna Direita: CPGF e Transações */}
				<div className="md:col-span-2 space-y-6">

					{/* Métrica de Cartões Corporativos */}
					<div className="border border-green-500 bg-black p-4 md:p-6 relative overflow-hidden">
						<div className="flex items-center mb-6">
							<h2 className="text-base md:text-lg uppercase font-bold tracking-wider text-green-500 leading-tight">Extrato Cartão Corporativo (CPGF)</h2>
						</div>

						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
							<div className="border border-green-900/50 p-3">
								<p className="text-[10px] text-green-600 uppercase mb-1">Gasto Total da Amostra</p>
								<p className="text-xl md:text-2xl font-bold whitespace-nowrap">{formatMoney(cpgf.totalValor)}</p>
							</div>
							<div className="border border-red-900/50 bg-red-950/10 p-3">
								<p className="text-[10px] text-red-500 uppercase mb-1 flex items-center gap-1"><Lock className="w-3 h-3 shrink-0" /> Valor Sigiloso</p>
								<p className="text-xl md:text-2xl font-bold text-red-500 whitespace-nowrap">{formatMoney(cpgf.totalSigiloso)}</p>
							</div>
							<div className="border border-green-900/50 p-3">
								<p className="text-[10px] text-green-600 uppercase mb-1">Total Lançamentos</p>
								<p className="text-xl md:text-2xl font-bold">{cpgf.countTotal}</p>
							</div>
							<div className="border border-red-900/50 p-3">
								<p className="text-[10px] text-red-500 uppercase mb-1">% de Ocultação</p>
								<p className="text-xl md:text-2xl font-bold text-red-500">{percentSigiloso}%</p>
							</div>
						</div>

						{/* Barra de Progresso do Sigilo */}
						<div className="w-full h-2 bg-green-900/30 mb-2 relative">
							<div
								className="h-full bg-red-500 absolute top-0 left-0"
								style={{ width: `${percentSigiloso}%` }}
							/>
						</div>
						<p className="text-xs text-green-700 text-right mb-6">Grau de opacidade governamental</p>

						<h3 className="text-sm font-bold uppercase mb-4 text-green-400 border-b border-green-900/50 pb-2">Lançamentos por Período (Ano-Mês)</h3>

						{sortedYears.length > 0 ? (
							<div className="flex flex-col gap-6 mb-8">
								{sortedYears.map((year) => {
									const monthsObj = groupedByYear[year];
									const sortedMonths = Object.keys(monthsObj).sort((a, b) => b.localeCompare(a));

									return (
										<div key={year} className="flex flex-col gap-2">
											<h4 className="text-lg font-bold text-green-300 border-l-4 border-green-500 pl-3 md:ml-1 tracking-widest">{year}</h4>
											{sortedMonths.map((month) => {
												const groupKey = `${year}-${month}`;
												const isExpanded = expandedGroup === groupKey;
												const shouldRenderContent = isExpanded || lastExpandedGroup === groupKey;
												const items = monthsObj[month];
												const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
												const currentItems = items.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
												const groupTotal = items.reduce((acc, curr) => acc + curr.valor, 0);

												const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
												const monthLabel = monthNames[parseInt(month, 10) - 1] || month;

												return (
													<div key={groupKey} className="border border-green-900/50 bg-green-950/5 md:ml-2">
														<button
															className="w-full flex items-center justify-between p-3 md:p-4 hover:bg-green-900/20 text-left transition-colors"
															onClick={() => {
																if (isExpanded) {
																	setLastExpandedGroup(groupKey);
																	setExpandedGroup(null);
																} else {
																	setLastExpandedGroup(expandedGroup);
																	setExpandedGroup(groupKey);
																	setCurrentPage(1);
																}
															}}
														>
															<div className="flex items-center gap-2 md:gap-3">
																<Calendar className="w-4 h-4 text-green-600 hidden xs:block" />
																<span className="font-bold text-green-400 uppercase w-10 md:w-12 text-sm md:text-base">{monthLabel}</span>
																<span className="text-[12px] md:text-[10px] bg-green-900/50 text-green-300 px-1.5 md:px-2 py-0.5 rounded-sm whitespace-nowrap">{items.length} itens</span>
															</div>
															<div className="flex items-center gap-2 md:gap-4">
																<span className="text-xs md:text-sm font-bold text-green-500 whitespace-nowrap">{formatMoney(groupTotal)}</span>
																{isExpanded ? <ChevronUp className="w-4 h-4 text-green-600 shrink-0" /> : <ChevronDown className="w-4 h-4 text-green-600 shrink-0" />}
															</div>
														</button>

														<div
															ref={(el) => {
																accordionRefs.current[groupKey] = el;
															}}
															className="overflow-hidden h-0 opacity-0"
														>
															<div className="p-4 border-t border-green-900/50 bg-black/50">
																{/* Tabela para Desktop */}
																<div className="hidden md:block overflow-x-auto">
																	<table className="w-full text-left border-collapse">
																		<thead>
																			<tr className="border-b border-green-900/50 text-green-600 text-xs uppercase tracking-wider">
																				<th className="p-3 font-medium">Data</th>
																				<th className="p-3 font-medium">Fornecedor</th>
																				<th className="p-3 font-medium">CNPJ</th>
																				<th className="p-3 font-medium text-right">Valor</th>
																			</tr>
																		</thead>
																		<tbody className="divide-y divide-green-900/20">
																			{shouldRenderContent && currentItems.map((item: any, idx: number) => (
																				<tr key={idx} className="transaction-row hover:bg-green-900/10 transition-colors">
																					<td className="p-3 text-xs text-green-600 whitespace-nowrap">{item.data ? item.data.substring(0, 5) : ""}</td>
																					<td className="p-3 text-sm font-bold text-green-300 capitalize">{item.nomeFornecedor ? item.nomeFornecedor.toLowerCase() : "Sigiloso"}</td>
																					<td className="p-3 text-xs text-green-600/70 font-mono">{item.cnpj}</td>
																					<td className="p-3 text-sm font-bold text-green-400 text-right whitespace-nowrap">{formatMoney(item.valor)}</td>
																				</tr>
																			))}
																		</tbody>
																	</table>
																</div>

																{/* Lista com Bottom Sheet para Mobile */}
																<div className="flex flex-col divide-y divide-green-950 md:hidden">
																	{shouldRenderContent && currentItems.map((item: any, idx: number) => (
																		<div
																			key={idx}
																			className="transaction-row flex items-center justify-between gap-3 py-3 px-0 hover:bg-green-900/20 cursor-pointer transition-colors"
																			onClick={() => setSelectedTransaction(item)}
																		>
																			<div className="flex flex-col min-w-0 flex-1 pr-2">
																				<span className="text-xs font-bold text-green-300 truncate capitalize">{item.nomeFornecedor ? item.nomeFornecedor.toLowerCase() : "Sigiloso"}</span>
																				<span className="text-xs text-green-600">{item.data ? item.data.substring(0, 5) : ""}</span>
																			</div>
																			<div className="flex items-center gap-2 shrink-0">
																				<span className="font-bold text-green-400 text-xs whitespace-nowrap">{formatMoney(item.valor)}</span>
																				<ChevronRight className="w-4 h-4 text-green-600 shrink-0" />
																			</div>
																		</div>
																	))}
																</div>

																{shouldRenderContent && totalPages > 1 && (
																	<div className="flex items-center justify-between mt-4 border-t border-green-900/30 pt-4">
																		<Button
																			variant="outline"
																			size="sm"
																			className="border-green-900 text-green-500 hover:bg-green-900/50"
																			onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
																			disabled={currentPage === 1}
																		>
																			Anterior
																		</Button>
																		<span className="text-xs text-green-600">Página {currentPage} de {totalPages}</span>
																		<Button
																			variant="outline"
																			size="sm"
																			className="border-green-900 text-green-500 hover:bg-green-900/50"
																			onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
																			disabled={currentPage === totalPages}
																		>
																			Próxima
																		</Button>
																	</div>
																)}
															</div>
														</div>
													</div>
												);
											})}
										</div>
									);
								})}
							</div>
						) : (
							<div className="text-center py-8 text-green-700 text-xs uppercase border border-dashed border-green-900/50 mb-8">
								<Unlock className="w-8 h-8 mx-auto mb-2 opacity-50" />
								Nenhum dado aberto retornado na amostragem.
							</div>
						)}
					</div>

					{/* Placeholder for future integrations */}
					<div className="border border-dashed border-green-900/50 p-6 flex flex-col items-center justify-center text-center opacity-50">
						<AlertTriangle className="w-8 h-8 mb-2" />
						<p className="text-xs uppercase">Módulos em Desenvolvimento</p>
						<p className="text-[10px] mt-2 max-w-xs">Análise de Viagens FAB, Licitações Federais e Enriquecimento Societário de Fornecedores.</p>
					</div>
				</div>
			</div>

			<Drawer open={!!selectedTransaction} onOpenChange={(open) => !open && setSelectedTransaction(null)}>
				<DrawerContent className="bg-black border-green-500/50 max-h-[85vh]">
					<DrawerHeader>
						<DrawerTitle className="text-green-500 font-mono tracking-wider">Detalhes da Transação</DrawerTitle>
						<DrawerDescription className="text-green-600/70 font-mono">
							Lançamento do Cartão de Pagamento
						</DrawerDescription>
					</DrawerHeader>
					{selectedTransaction && (
						<div className="p-4 flex flex-col gap-6 font-mono overflow-y-auto">
							<div className="flex items-center gap-4">
								<div className="bg-green-900/30 p-4 rounded-full border border-green-900/50">
									<Landmark className="w-8 h-8 text-green-500" />
								</div>
								<div>
									<p className="text-xs text-green-600 uppercase mb-1">Fornecedor</p>
									<p className="text-base font-bold text-green-300">{selectedTransaction.nomeFornecedor || "SIGILOSO"}</p>
								</div>
							</div>
							<div className="grid grid-cols-2 gap-6 p-4 bg-green-950/10 border border-green-900/30">
								<div>
									<p className="text-xs text-green-600 uppercase mb-1 flex items-center gap-1">
										<CreditCard className="w-3 h-3" /> Valor
									</p>
									<p className="text-xl font-bold text-green-500">{formatMoney(selectedTransaction.valor)}</p>
								</div>
								<div>
									<p className="text-xs text-green-600 uppercase mb-1 flex items-center gap-1">
										<Calendar className="w-3 h-3" /> Data
									</p>
									<p className="text-base text-green-400">{selectedTransaction.data}</p>
								</div>
							</div>
							<div>
								<p className="text-xs text-green-600 uppercase mb-1">CNPJ / CPF do Favorecido</p>
								<p className="text-sm text-green-400 font-mono bg-green-950/20 p-2 border border-green-900/30 inline-block">{selectedTransaction.cnpj || "N/A"}</p>
							</div>
						</div>
					)}
					<DrawerFooter>
						<DrawerClose asChild>
							<Button variant="outline" className="border-green-900 text-green-500 hover:bg-green-900/50 hover:text-green-400 w-full rounded-none">
								Fechar
							</Button>
						</DrawerClose>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
			</div>
		</div>
	);
}
