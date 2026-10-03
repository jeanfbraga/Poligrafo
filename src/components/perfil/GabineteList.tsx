"use client";

import { useMemo, useState } from "react";
import { FilterChip, Panel, Tag } from "@/components/ds";
import { Paginador, usePagina } from "@/components/ds/Paginador";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { useIsMobile } from "@/hooks/use-mobile";
import { agruparServidores, type CargoContado, resumoPorCargo, type ServidorAgrupado, type StatusServidor } from "@/lib/gabinete";
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

/** Cartão compacto: nome, cargo · período e, se houver, o botão dos períodos. Só exonerado ganha selo. */
function CartaoServidor({ servidor }: { servidor: ServidorAgrupado }) {
	const [aberto, setAberto] = useState(false);
	const periodos = servidor.vinculos.length;
	const ativo = servidor.status === "ATIVO";
	return (
		<li className="pg-gab__item">
			<div className="pg-gab__linha">
				<span className={`pg-gab__dot${ativo ? "" : " pg-gab__dot--off"}`} role="img" aria-label={ativo ? "Ativo" : "Exonerado"} />
				<div className="pg-gab__txt">
					<b>{tituloCaso(servidor.nome)}</b>
					<span>
						{tituloCaso(servidor.atual.cargo)} · {servidor.atual.periodo}
					</span>
				</div>
				{ativo ? null : <Tag tone="steel">Exonerado</Tag>}
				{periodos > 1 ? (
					<button type="button" className="pg-vinculos__toggle" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
						<PixelIcon name={aberto ? "chevd" : "chev"} size={12} />
						{periodos} períodos
					</button>
				) : null}
			</div>
			{aberto ? <Vinculos servidor={servidor} /> : null}
		</li>
	);
}

/** "22 Secretário Parlamentar · 2 Cargo de Natureza Especial": a composição do gabinete numa linha. */
function ResumoDeCargos({ cargos }: { cargos: CargoContado[] }) {
	if (cargos.length === 0) return null;
	return (
		<p className="pg-gab__cargos">
			{cargos.map((c) => (
				<span key={c.cargo}>
					<b>{c.quantidade}</b> {tituloCaso(c.cargo)}
				</span>
			))}
		</p>
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

/** Servidores do gabinete: uma entrada por pessoa em grade compacta (2–3 colunas no desktop). */
export default function GabineteList({ servidores, perfil }: { servidores: Dados[]; perfil?: Dados }) {
	const mobile = useIsMobile();
	const [filtro, setFiltro] = useState<Filtro>("TODOS");
	const pessoas = useMemo(() => agruparServidores(servidores ?? []), [servidores]);
	const filtrados = useMemo(() => filtrar(pessoas, filtro), [pessoas, filtro]);
	const cargos = useMemo(() => resumoPorCargo(pessoas), [pessoas]);
	const pag = usePagina(filtrados, mobile ? 8 : 18);

	if (pessoas.length === 0) return <SemServidores perfil={perfil} />;

	const ativos = pessoas.filter((p) => p.status === "ATIVO").length;
	const escolher = (f: Filtro) => {
		setFiltro(f);
		pag.reset();
	};

	return (
		<Panel title="Servidores do gabinete" sub={`${pessoas.length} servidores · ${servidores.length} períodos registrados`} flush id="gabinete">
			<div className="pg-gab__topo">
				<ResumoDeCargos cargos={cargos} />
				<div className="pg-chiprow">
					<FilterChip pressed={filtro === "TODOS"} onClick={() => escolher("TODOS")}>Todos ({pessoas.length})</FilterChip>
					<FilterChip pressed={filtro === "ATIVOS"} onClick={() => escolher("ATIVOS")}>Ativos ({ativos})</FilterChip>
					<FilterChip pressed={filtro === "EXONERADOS"} onClick={() => escolher("EXONERADOS")}>Exonerados ({pessoas.length - ativos})</FilterChip>
				</div>
			</div>
			<ul className="pg-gab">
				{pag.fatia.map((s) => (
					<CartaoServidor key={s.nome} servidor={s} />
				))}
			</ul>
			{filtrados.length === 0 ? <p className="pg-empty">Nenhum servidor encontrado para este filtro.</p> : null}
			<Paginador p={pag} />
		</Panel>
	);
}
