"use client";

import { PixelIcon } from "@/components/pixel/PixelIcon";
import { Tag } from "@/components/ds";
import type { PoliticoIndexado } from "@/lib/investigacao/alvo";
import { abreviarPartido, destacarNome, rotuloCargo } from "@/lib/busca";
import { iniciais } from "@/lib/format";
import { tituloCaso } from "@/lib/texto";
import type { BuscaApi } from "./useBusca";

function Nome({ nome, q }: { nome: string; q: string }) {
	return (
		<b>
			{destacarNome(tituloCaso(nome), q).map((t, i) => (t.destaque ? <mark key={i}>{t.texto}</mark> : <span key={i}>{t.texto}</span>))}
		</b>
	);
}

function Linha({ p, q, ativo, onEscolher }: { p: PoliticoIndexado; q: string; ativo: boolean; onEscolher: (p: PoliticoIndexado) => void }) {
	return (
		<button type="button" role="option" aria-selected={ativo} className="pg-sr" onMouseDown={(e) => e.preventDefault()} onClick={() => onEscolher(p)}>
			<span className="pg-sr__av">{iniciais(p.nome)}</span>
			<span className="pg-sr__st">
				<Nome nome={p.nome} q={q} />
				<span>{rotuloCargo(p)}</span>
			</span>
			<span className="pg-sr__rr">
				{p.orgao ? <Tag tone="steel">{p.orgao}</Tag> : null}
				<Tag>{abreviarPartido(p.partido)}</Tag>
				<Tag tone="phos">{p.uf || "BR"}</Tag>
			</span>
		</button>
	);
}

function SemResultados({ busca }: { busca: BuscaApi }) {
	return (
		<div className="pg-sd__none">
			<p>
				&gt; Nenhum político indexado para <b>“{busca.q.trim()}”</b> em <b>{busca.alcada}</b>.
			</p>
			<button
				type="button"
				className="pg-sr"
				style={{ marginTop: 8, border: "1px solid var(--pg-line-2)" }}
				onMouseDown={(e) => e.preventDefault()}
				onClick={busca.buscarAoVivo}
			>
				<span className="pg-sr__av">
					<PixelIcon name="search" size={16} />
				</span>
				<span className="pg-sr__st">
					<b>Buscar nas fontes ao vivo</b>
					<span>Mais lento · consulta Câmara, Senado e TSE</span>
				</span>
				<span className="pg-sr__rr">
					<Tag>↵</Tag>
				</span>
			</button>
		</div>
	);
}

/** Lista de resultados/sugestões, compartilhada pelo dropdown do desktop e pela busca mobile. */
export function ResultadosBusca({ busca }: { busca: BuscaApi }) {
	if (busca.modo === "resultados") {
		if (busca.itens.length === 0) return <SemResultados busca={busca} />;
		return (
			<>
				<h4>
					Resultados <span>{busca.itens.length}</span>
				</h4>
				{busca.itens.map((p, i) => (
					<Linha key={`${p.id}-${i}`} p={p} q={busca.q} ativo={i === busca.idx} onEscolher={busca.escolher} />
				))}
			</>
		);
	}
	const nRec = busca.recentes.length;
	return (
		<>
			{nRec > 0 ? <h4>Recentes</h4> : null}
			{busca.recentes.map((p, i) => (
				<Linha key={`r-${p.id}-${i}`} p={p} q="" ativo={i === busca.idx} onEscolher={busca.escolher} />
			))}
			{busca.populares.length > 0 ? (
				<h4>
					Mais investigados <span>pelos usuários</span>
				</h4>
			) : null}
			{busca.populares.map((p, i) => (
				<Linha key={`p-${p.id}-${i}`} p={p} q="" ativo={nRec + i === busca.idx} onEscolher={busca.escolher} />
			))}
			{nRec + busca.populares.length === 0 ? (
				<p className="pg-sd__none">&gt; Digite o nome de um político. A alçada atual é <b>{busca.alcada}</b>.</p>
			) : null}
		</>
	);
}
