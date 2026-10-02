"use client";

import type { ReactNode } from "react";
import { Kv, Label, PixelBar } from "@/components/ds";
import { construirCard, type ModeloCard } from "@/components/nodes/card-model";
import { tipoDoNo } from "@/components/nodes/node-types";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import type { PixelIconName } from "@/components/pixel/pixel-icons";
import { vizinhosDe } from "@/lib/investigacao/arestas";
import type { DossieEdge, DossieNode } from "@/lib/investigacao/dossie-state";
import { GLIFO_RISCO, ROTULO_RISCO } from "@/lib/investigacao/risco";
import { tituloCaso } from "@/lib/texto";
import { getPortalTransparenciaFallback } from "@/lib/utils";
import { type AcaoNo, acoesDoNo } from "./acoes";
import { SecoesContratoEmenda, SecoesDespesa, SecoesPessoa, SecoesResumoEmendas } from "./secoes";

type Dados = Record<string, any>;

const COR_RISCO = { ok: undefined, warn: "var(--pg-warn)", crit: "var(--pg-crit)" } as const;

interface InspetorProps {
	node: DossieNode;
	nodes: DossieNode[];
	edges: DossieEdge[];
	/** O pivô/busca reversa deste nó já rodou. */
	jaExpandido: boolean;
	/** Há um aprofundamento em andamento (desabilita novos pivôs). */
	ocupado: boolean;
	onFechar: () => void;
	onSelecionar: (id: string) => void;
	onCompartilhar: (node: DossieNode) => void;
	onAcao: (acao: AcaoNo, node: DossieNode) => void;
}

function CaixaDeRisco({ m }: { m: ModeloCard }) {
	const tom = m.risco === "ok" ? "phos" : m.risco;
	return (
		<div className={`pg-riskbox pg-riskbox--${m.risco}`}>
			<div className="pg-riskbox__row">
				<span>
					{GLIFO_RISCO[m.risco]} {ROTULO_RISCO[m.risco]}
				</span>
				{m.score !== null ? <span>Score {m.score}/100</span> : null}
			</div>
			{m.score !== null ? <PixelBar value={m.score} tone={tom} label="Score de risco" /> : null}
			{m.regra ? <p>Crítico por regra: {m.regra}. A nota da IA acima não chega ao limite crítico (85).</p> : null}
			<p style={m.motivo ? undefined : { color: "var(--pg-ink-2)" }}>
				&gt; {m.motivo || "Nenhum padrão suspeito encontrado nas fontes consultadas."}
			</p>
		</div>
	);
}

function Extras({ node, nodes }: { node: DossieNode; nodes: DossieNode[] }) {
	const d = (node.data ?? {}) as Dados;
	switch (node.type) {
		case "PESSOA":
			return <SecoesPessoa d={d} />;
		case "DESPESA":
		case "DESPESA_PUBLICA": {
			const pessoa = nodes.find((n) => n.type === "PESSOA")?.data as Dados | undefined;
			const portal = getPortalTransparenciaFallback(pessoa?.casa, pessoa?.uri);
			return <SecoesDespesa d={d} fonteLabel={pessoa?.casa === "SENADO" ? "Senado" : "Câmara"} portal={portal} />;
		}
		case "CONTRATO":
			return <SecoesContratoEmenda d={d} ehEmenda={String(d.label ?? "").startsWith("EMENDA")} />;
		case "EMENDA":
			return <SecoesContratoEmenda d={d} ehEmenda />;
		case "EMENDA_RESUMO":
			return <SecoesResumoEmendas d={d} />;
		default:
			return null;
	}
}

function Conexoes({ node, nodes, edges, onSelecionar }: Pick<InspetorProps, "node" | "nodes" | "edges" | "onSelecionar">) {
	const vizinhos = vizinhosDe(node.id, edges);
	if (vizinhos.length === 0) return null;
	const porId = new Map(nodes.map((n) => [n.id, n]));
	return (
		<div className="pg-insp__sec">
			<Label>Conexões ({vizinhos.length})</Label>
			<div className="pg-links">
				{vizinhos.map((v) => {
					const alvo = porId.get(v.id);
					if (!alvo) return null;
					const m = construirCard(alvo.type ?? "", alvo.data);
					return (
						<button key={`${v.id}-${v.rel}`} type="button" className={`pg-link pg-fam-${m.familia}`} onClick={() => onSelecionar(v.id)}>
							<span className="pg-node__ico">
								<PixelIcon name={m.icon} size={14} />
							</span>
							<span style={{ minWidth: 0 }}>
								<b>{tituloCaso(m.titulo)}</b>
								<span className="pg-link__r">
									{v.saida ? "→" : "←"} {v.rel}
								</span>
							</span>
							{m.score !== null ? (
								<span className="pg-node__score" style={{ color: COR_RISCO[m.risco] }}>
									{GLIFO_RISCO[m.risco]} {m.regra ? "REGRA" : m.score}
								</span>
							) : null}
						</button>
					);
				})}
			</div>
		</div>
	);
}

const ICONE_LINK: Partial<Record<AcaoNo["id"], PixelIconName>> = { mapa: "pin", perfil: "user" };
const APROFUNDAMENTOS: ReadonlySet<AcaoNo["id"]> = new Set(["pivot-cnpj", "busca-reversa"]);

function BotaoAcao({ a, node, ocupado, onAcao }: { a: AcaoNo; node: DossieNode; ocupado: boolean; onAcao: InspetorProps["onAcao"] }) {
	const cls = `pg-btn${a.primary ? " pg-btn--primary" : ""}`;
	if (a.concluida) {
		return <div className="pg-insp__done">[ {a.id === "busca-reversa" ? "busca reversa executada" : "aprofundamento concluído no canvas"} ]</div>;
	}
	if (a.href) {
		const externo = !a.href.startsWith("/");
		return (
			<a className={cls} href={a.href} target={externo ? "_blank" : undefined} rel="noopener noreferrer">
				<PixelIcon name={ICONE_LINK[a.id] ?? "link"} size={14} />
				{a.label}
			</a>
		);
	}
	const aprofunda = APROFUNDAMENTOS.has(a.id);
	return (
		<button type="button" className={cls} disabled={aprofunda && ocupado} onClick={() => onAcao(a, node)}>
			{aprofunda ? <PixelIcon name="search" size={14} /> : null}
			{a.label}
		</button>
	);
}

/**
 * Inspetor do nó selecionado. Painel à direita no desktop; no mobile o mesmo
 * conteúdo vive dentro de um bottom sheet (ver DossieView).
 */
export function Inspetor(props: InspetorProps) {
	const { node, jaExpandido, ocupado, onFechar, onCompartilhar, onAcao } = props;
	const m = construirCard(node.type ?? "", node.data);
	const tipo = tipoDoNo(node.type);
	const acoes = acoesDoNo(node, jaExpandido);
	const campos = m.campos.map((c) => ({ key: c.label, label: c.label, value: c.chip ? <span className="pg-code">{c.value}</span> : c.value }));
	const dados = [
		{ key: "__chave", label: m.chave.label.split(" (")[0], value: m.chave.valor, big: true },
		...campos,
		{ key: "__fonte", label: "Fonte", value: m.fonte },
	] as { key: string; label: string; value: ReactNode; big?: boolean }[];

	return (
		<aside className={`pg-insp pg-fam-${m.familia}`} data-insp={node.id} aria-label={`Detalhes: ${m.titulo}`}>
			<div className="pg-insp__head">
				<span className="pg-node__ico">
					<PixelIcon name={m.icon} size={14} />
				</span>
				<span className="pg-node__tag">{m.tag}</span>
				{tipo.canShare ? (
					<button type="button" className="pg-btn pg-btn--icon" aria-label="Compartilhar" onClick={() => onCompartilhar(node)}>
						<PixelIcon name="share" size={16} />
					</button>
				) : null}
				<button type="button" className="pg-btn pg-btn--icon" aria-label="Fechar" onClick={onFechar}>
					<PixelIcon name="x" size={16} />
				</button>
			</div>
			<div className="pg-insp__scroll">
				<div>
					<h3>{tituloCaso(m.titulo)}</h3>
					{m.sub ? <p className="pg-insp__subt">{m.sub}</p> : null}
				</div>
				<CaixaDeRisco m={m} />
				<div>
					<Label>Dados</Label>
					<Kv items={dados} />
				</div>
				<Extras node={node} nodes={props.nodes} />
				<Conexoes node={node} nodes={props.nodes} edges={props.edges} onSelecionar={props.onSelecionar} />
				<p className="pg-insp__foot">Fonte: {m.fonte}</p>
			</div>
			{acoes.length > 0 ? (
				<div className="pg-insp__act">
					{acoes.map((a) => (
						<BotaoAcao key={`${a.id}-${a.arg ?? a.href}`} a={a} node={node} ocupado={ocupado} onAcao={onAcao} />
					))}
				</div>
			) : null}
		</aside>
	);
}
