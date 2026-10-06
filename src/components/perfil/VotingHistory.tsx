"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterChip, Panel } from "@/components/ds";
import { Paginador, usePagina } from "@/components/ds/Paginador";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { idProposicaoPrincipal, limparNomeProjeto } from "@/lib/votos";

type Dados = Record<string, any>;
type Filtro = "TODOS" | "SIM" | "NÃO";

/** Classe e rótulo do voto: sim (fósforo), não (aço), abstenção/outros (neutro). */
export function estiloDoVoto(voto?: string): { cls: string; texto: string } {
	const v = voto?.toLowerCase();
	if (v === "sim") return { cls: "pg-vote--sim", texto: "✓ SIM" };
	if (v === "não") return { cls: "pg-vote--nao", texto: "✕ NÃO" };
	return { cls: "pg-vote--abs", texto: v === "abstenção" ? "ABST." : (voto ?? "—").toUpperCase().slice(0, 7) };
}

/** Linha de apoio do voto: o tema, a não ser que só repita o nome da votação (aí "Plenário"). */
export function temaDoVoto(v: Dados): string {
	const tema = limparNomeProjeto(v.projeto_tema ?? "").trim();
	if (!v.projeto_tema || tema === "Não especificado") return "Plenário";
	return tema === limparNomeProjeto(v.projeto_nome).trim() ? "Plenário" : tema;
}

function LinhaVoto({ v, idDeputado }: { v: Dados; idDeputado: string }) {
	const e = estiloDoVoto(v.voto);
	// A votação é de um parecer/emenda; o link vai para a proposição principal ("2580259-24" → 2580259).
	const idProjeto = idProposicaoPrincipal(v);
	const corpo = (
		<>
			<span className={`pg-vote ${e.cls}`}>{e.texto}</span>
			<div className="pg-lrow__main">
				<b>{limparNomeProjeto(v.projeto_nome)}</b>
				<span>{temaDoVoto(v)}</span>
			</div>
			<span className="pg-lrow__meta">
				{new Date(v.data_votacao).toLocaleDateString("pt-BR")}
				{idProjeto ? <PixelIcon name="chev" size={12} /> : null}
			</span>
		</>
	);
	if (!idProjeto) return <div className="pg-lrow">{corpo}</div>;
	return (
		<Link href={`/perfil/deputado/${idDeputado}/projeto/${idProjeto}`} className="pg-lrow">
			{corpo}
		</Link>
	);
}

export default function VotingHistory({ votos, idDeputado, perfil }: { votos: Dados[]; idDeputado: string; perfil?: Dados }) {
	const [filtro, setFiltro] = useState<Filtro>("TODOS");
	const filtrados = useMemo(
		() => (votos ?? []).filter((v) => filtro === "TODOS" || v.voto?.toLowerCase() === filtro.toLowerCase()),
		[votos, filtro],
	);
	const pag = usePagina(filtrados, 8);

	if (!votos || votos.length === 0) {
		const suplente = perfil?.situacao?.toLowerCase().includes("supl");
		return (
			<Panel title="Registro de votos" id="votos">
				<p className="pg-note">
					{suplente
						? "Nenhum voto nominal registrado em plenário durante o período de exercício (suplente)."
						: "Nenhum voto registrado no período atual."}
				</p>
			</Panel>
		);
	}

	const escolher = (f: Filtro) => {
		setFiltro(f);
		pag.reset();
	};

	return (
		<Panel title="Registro de votos" sub={`Plenário · ${filtrados.length} registros`} flush id="votos">
			<div className="pg-chiprow" style={{ padding: "12px 12px 8px" }}>
				<FilterChip pressed={filtro === "TODOS"} onClick={() => escolher("TODOS")}>Todos</FilterChip>
				<FilterChip pressed={filtro === "SIM"} onClick={() => escolher("SIM")}>Sim</FilterChip>
				<FilterChip pressed={filtro === "NÃO"} onClick={() => escolher("NÃO")}>Não</FilterChip>
			</div>
			{pag.fatia.map((v) => (
				<LinhaVoto key={v.id_votacao} v={v} idDeputado={idDeputado} />
			))}
			{filtrados.length === 0 ? <p className="pg-empty">Nenhum voto {filtro.toLowerCase()} encontrado neste período.</p> : null}
			<Paginador p={pag} />
		</Panel>
	);
}
