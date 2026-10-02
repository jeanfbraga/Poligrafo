"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterChip, Panel } from "@/components/ds";
import { Paginador, usePagina } from "@/components/ds/Paginador";
import { PixelIcon } from "@/components/pixel/PixelIcon";

type Dados = Record<string, any>;
type Filtro = "TODOS" | "SIM" | "NÃO";

export function limparNomeProjeto(nome?: string): string {
	if (!nome) return "Votação sem nome";
	return nome.split(/\.\s*Sim:/i)[0];
}

/** Classe e rótulo do voto: sim (fósforo), não (aço), abstenção/outros (neutro). */
export function estiloDoVoto(voto?: string): { cls: string; texto: string } {
	const v = voto?.toLowerCase();
	if (v === "sim") return { cls: "pg-vote--sim", texto: "✓ SIM" };
	if (v === "não") return { cls: "pg-vote--nao", texto: "✕ NÃO" };
	return { cls: "pg-vote--abs", texto: v === "abstenção" ? "ABST." : (voto ?? "—").toUpperCase().slice(0, 7) };
}

function LinhaVoto({ v, idDeputado }: { v: Dados; idDeputado: string }) {
	const e = estiloDoVoto(v.voto);
	const tema = v.projeto_tema && v.projeto_tema !== "Não especificado" ? v.projeto_tema : "";
	const corpo = (
		<>
			<span className={`pg-vote ${e.cls}`}>{e.texto}</span>
			<div className="pg-lrow__main">
				<b>{limparNomeProjeto(v.projeto_nome)}</b>
				<span>{tema || "Plenário"}</span>
			</div>
			<span className="pg-lrow__meta">
				{new Date(v.data_votacao).toLocaleDateString("pt-BR")}
				{v.id_proposicao ? <PixelIcon name="chev" size={12} /> : null}
			</span>
		</>
	);
	if (!v.id_proposicao) return <div className="pg-lrow">{corpo}</div>;
	return (
		<Link href={`/perfil/deputado/${idDeputado}/projeto/${v.id_proposicao}`} className="pg-lrow">
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
