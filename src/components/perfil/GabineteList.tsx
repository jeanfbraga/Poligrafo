"use client";

import { useMemo, useState } from "react";
import { FilterChip, Panel, Tag } from "@/components/ds";
import { Paginador, usePagina } from "@/components/ds/Paginador";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { agruparServidores, type ServidorAgrupado, type StatusServidor } from "@/lib/gabinete";
import { tituloCaso } from "@/lib/texto";

type Dados = Record<string, any>;
type Filtro = "TODOS" | "ATIVOS" | "EXONERADOS";

const ALVO_DO_FILTRO: Record<Exclude<Filtro, "TODOS">, StatusServidor> = { ATIVOS: "ATIVO", EXONERADOS: "EXONERADO" };

function filtrar(lista: ServidorAgrupado[], filtro: Filtro): ServidorAgrupado[] {
	return filtro === "TODOS" ? lista : lista.filter((s) => s.status === ALVO_DO_FILTRO[filtro]);
}

/** Períodos de lotação de um servidor (do mais recente ao mais antigo). */
function Vinculos({ servidor }: { servidor: ServidorAgrupado }) {
	return (
		<ul className="pg-vinculos" aria-label={`Períodos de ${servidor.nome}`}>
			{servidor.vinculos.map((v, i) => (
				<li key={`${v.periodo}-${i}`}>
					<span>
						{tituloCaso(v.cargo)} · {v.periodo}
					</span>
					<Tag tone={v.status === "ATIVO" ? "phos" : "steel"}>{v.status}</Tag>
				</li>
			))}
		</ul>
	);
}

function LinhaServidor({ servidor }: { servidor: ServidorAgrupado }) {
	const [aberto, setAberto] = useState(false);
	const periodos = servidor.vinculos.length;
	return (
		<>
			<div className="pg-lrow" style={{ gridTemplateColumns: "1fr auto" }}>
				<div className="pg-lrow__main">
					<b>{tituloCaso(servidor.nome)}</b>
					<span>{tituloCaso(servidor.atual.cargo)}</span>
					<span>{servidor.atual.periodo}</span>
					{periodos > 1 ? (
						<button type="button" className="pg-vinculos__toggle" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
							<PixelIcon name={aberto ? "chevd" : "chev"} size={12} />
							{periodos} períodos
						</button>
					) : null}
				</div>
				<Tag tone={servidor.status === "ATIVO" ? "phos" : "steel"}>{servidor.status}</Tag>
			</div>
			{aberto ? <Vinculos servidor={servidor} /> : null}
		</>
	);
}

function SemServidores({ perfil }: { perfil?: Dados }) {
	const suplente = perfil?.situacao?.toLowerCase().includes("supl");
	return (
		<Panel title="Servidores do gabinete" id="gabinete">
			<p className="pg-note">
				{suplente
					? "Gabinete inativo (parlamentar em suplência / sem exercício ativo no ano corrente)."
					: "Nenhum servidor encontrado na base de dados."}
			</p>
		</Panel>
	);
}

/** Servidores do gabinete: uma linha por pessoa, com os períodos de lotação recolhidos. */
export default function GabineteList({ servidores, perfil }: { servidores: Dados[]; perfil?: Dados }) {
	const [filtro, setFiltro] = useState<Filtro>("TODOS");
	const pessoas = useMemo(() => agruparServidores(servidores ?? []), [servidores]);
	const filtrados = useMemo(() => filtrar(pessoas, filtro), [pessoas, filtro]);
	const pag = usePagina(filtrados, 8);

	if (pessoas.length === 0) return <SemServidores perfil={perfil} />;

	const ativos = pessoas.filter((p) => p.status === "ATIVO").length;
	const escolher = (f: Filtro) => {
		setFiltro(f);
		pag.reset();
	};

	return (
		<Panel title="Servidores do gabinete" sub={`${pessoas.length} servidores · ${servidores.length} períodos registrados`} flush id="gabinete">
			<div className="pg-chiprow" style={{ padding: "12px 12px 8px" }}>
				<FilterChip pressed={filtro === "TODOS"} onClick={() => escolher("TODOS")}>Todos ({pessoas.length})</FilterChip>
				<FilterChip pressed={filtro === "ATIVOS"} onClick={() => escolher("ATIVOS")}>Ativos ({ativos})</FilterChip>
				<FilterChip pressed={filtro === "EXONERADOS"} onClick={() => escolher("EXONERADOS")}>Exonerados ({pessoas.length - ativos})</FilterChip>
			</div>
			{pag.fatia.map((s) => (
				<LinhaServidor key={s.nome} servidor={s} />
			))}
			{filtrados.length === 0 ? <p className="pg-empty">Nenhum servidor encontrado para este filtro.</p> : null}
			<Paginador p={pag} />
		</Panel>
	);
}
