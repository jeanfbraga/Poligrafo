"use client";

import { useMemo, useState } from "react";
import { FilterChip } from "@/components/ds";
import { construirCard } from "@/components/nodes/card-model";
import { ChipScore } from "@/components/nodes/NodeCard";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import type { ResumoCota as ResumoCotaDados } from "@/lib/investigacao/cota";
import type { DossieNode } from "@/lib/investigacao/dossie-state";
import { tituloCaso } from "@/lib/texto";
import { MIME_EVIDENCIA } from "./DossieCanvas";
import { ResumoCota } from "./ResumoCota";

export type FiltroRisco = "all" | "crit" | "warn";
type Aba = "achados" | "despesas";

export function filtrarAchados(nodes: DossieNode[], filtro: FiltroRisco): DossieNode[] {
	return nodes
		.filter((n) => n.type !== "PESSOA")
		.map((n) => ({ n, m: construirCard(n.type ?? "", n.data) }))
		.filter(({ m }) => filtro === "all" || m.risco === filtro)
		.sort((a, b) => (b.m.score ?? -1) - (a.m.score ?? -1) || a.m.titulo.localeCompare(b.m.titulo))
		.map(({ n }) => n);
}

export function ordenarEvidencias(evidencias: DossieNode[]): DossieNode[] {
	const valor = (n: DossieNode) => Number(n.data?._empenhado ?? n.data?.valor ?? 0) || 0;
	return [...evidencias].sort((a, b) => valor(b) - valor(a));
}

interface RailProps {
	nodes: DossieNode[];
	evidencias: DossieNode[];
	selecionadoId: string | null;
	onSelecionar: (id: string) => void;
	onDestacar: (id: string | null) => void;
	onAdicionarEvidencia: (id: string) => void;
	carregando: boolean;
	/** Total e recorte da cota (topo da aba Despesas). */
	resumoCota?: ResumoCotaDados | null;
}

function ItemAchado({ n, ativo, onSelecionar, onDestacar }: { n: DossieNode; ativo: boolean; onSelecionar: (id: string) => void; onDestacar: (id: string | null) => void }) {
	const m = construirCard(n.type ?? "", n.data);
	return (
		<button
			type="button"
			className={`pg-rail-item pg-fam-${m.familia} pg-rail-item--${m.risco}`}
			aria-current={ativo}
			onClick={() => onSelecionar(n.id)}
			onMouseEnter={() => onDestacar(n.id)}
			onMouseLeave={() => onDestacar(null)}
		>
			<span className="pg-node__ico">
				<PixelIcon name={m.icon} size={14} />
			</span>
			<span className="pg-rail-item__t">
				<b>{tituloCaso(m.titulo)}</b>
				<span>{m.tag}</span>
			</span>
			<ChipScore modelo={m} />
		</button>
	);
}

function ItemEvidencia({ n, onAdicionar }: { n: DossieNode; onAdicionar: (id: string) => void }) {
	const m = construirCard(n.type ?? "", n.data);
	return (
		<div
			className={`pg-rail-item pg-fam-${m.familia} pg-rail-item--${m.risco}`}
			draggable
			onDragStart={(e) => {
				e.dataTransfer.setData(MIME_EVIDENCIA, n.id);
				e.dataTransfer.effectAllowed = "move";
			}}
			title="Arraste para o canvas ou use o botão"
		>
			<span className="pg-node__ico">
				<PixelIcon name={m.icon} size={14} />
			</span>
			<span className="pg-rail-item__t">
				<b>{tituloCaso(m.titulo)}</b>
				<span>
					{m.chave.curto} · {m.chave.dica}
				</span>
			</span>
			<button
				type="button"
				className="pg-btn pg-btn--icon"
				style={{ height: 24, width: 24 }}
				aria-label={`Adicionar ${m.titulo} ao canvas`}
				onClick={() => onAdicionar(n.id)}
			>
				<PixelIcon name="plus" size={14} />
			</button>
		</div>
	);
}

function CotaDaAba({ aba, resumo }: { aba: Aba; resumo?: ResumoCotaDados | null }) {
	if (aba !== "despesas" || !resumo) return null;
	return <ResumoCota resumo={resumo} />;
}

/** Rail lateral do Dossiê: achados (por risco) e despesas de baixo risco arrastáveis. */
export function Rail({ nodes, evidencias, selecionadoId, onSelecionar, onDestacar, onAdicionarEvidencia, carregando, resumoCota }: RailProps) {
	const [aba, setAba] = useState<Aba>("achados");
	const [filtro, setFiltro] = useState<FiltroRisco>("all");
	const achados = useMemo(() => filtrarAchados(nodes, filtro), [nodes, filtro]);
	const despesas = useMemo(() => ordenarEvidencias(evidencias), [evidencias]);

	return (
		<aside className="pg-rail" aria-label="Achados">
			<div className="pg-rail__head">
				<b>&gt; {aba === "achados" ? "ACHADOS" : "DESPESAS"}</b>
				<span className="pg-label">{aba === "achados" ? achados.length : despesas.length} itens</span>
			</div>
			<div className="pg-rail__chips" role="tablist" aria-label="Seção do rail">
				<FilterChip pressed={aba === "achados"} onClick={() => setAba("achados")}>
					Achados
				</FilterChip>
				<FilterChip pressed={aba === "despesas"} onClick={() => setAba("despesas")}>
					Despesas ({evidencias.length})
				</FilterChip>
			</div>
			{aba === "achados" ? (
				<div className="pg-rail__chips">
					<FilterChip pressed={filtro === "all"} onClick={() => setFiltro("all")}>
						Todos
					</FilterChip>
					<FilterChip pressed={filtro === "crit"} tone="crit" onClick={() => setFiltro("crit")}>
						◆ Crítico
					</FilterChip>
					<FilterChip pressed={filtro === "warn"} tone="warn" onClick={() => setFiltro("warn")}>
						▲ Atenção
					</FilterChip>
				</div>
			) : null}
			<CotaDaAba aba={aba} resumo={resumoCota} />
			<div className="pg-rail__list">
				{aba === "achados"
					? achados.map((n) => (
							<ItemAchado key={n.id} n={n} ativo={n.id === selecionadoId} onSelecionar={onSelecionar} onDestacar={onDestacar} />
						))
					: despesas.map((n) => <ItemEvidencia key={n.id} n={n} onAdicionar={onAdicionarEvidencia} />)}
				{(aba === "achados" ? achados : despesas).length === 0 ? (
					<p className="pg-empty">
						{carregando
							? "Os achados aparecem aqui conforme as fontes respondem."
							: aba === "achados"
								? "Nenhum achado neste filtro."
								: "Nenhuma despesa de baixo risco."}
					</p>
				) : null}
			</div>
		</aside>
	);
}
