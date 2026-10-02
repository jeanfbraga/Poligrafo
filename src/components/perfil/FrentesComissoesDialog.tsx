"use client";

import { type ReactNode, useMemo, useState } from "react";
import { FilterChip, Seg, Tag } from "@/components/ds";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
	comissoesFormatadas,
	contagemPorTema,
	filtrarComissoes,
	filtrarFrentes,
	frentesFormatadas,
	type TemaFiltro,
} from "@/lib/colegiados";
import type { ComissaoFormatada, FrenteFormatada } from "@/lib/parlamentar-utils";
import { tituloCaso } from "@/lib/texto";

type Aba = "comissoes" | "frentes";

interface FrentesComissoesDialogProps {
	comissoes?: unknown[];
	frentes?: unknown[];
	nomePolitico?: string;
	partido?: string;
	uf?: string;
	/** Elemento que abre o diálogo (ex.: "Ver as 7 comissões"). */
	trigger: ReactNode;
	initialTab?: Aba | "temas";
	/** Props do perfil que este diálogo não usa (compatibilidade com quem as repassa). */
	profissoes?: unknown[];
}

function LinhaComissao({ c }: { c: ComissaoFormatada }) {
	return (
		<li className="pg-dlg__row" title={c.raw}>
			{c.sigla ? <Tag tone="phos">{c.sigla}</Tag> : <Tag>{c.tipo}</Tag>}
			<span className="pg-dlg__nome">{c.nome}</span>
			{c.cargo ? <Tag tone={c.destaque ? "phos" : "default"}>{c.cargo}</Tag> : null}
		</li>
	);
}

function LinhaFrente({ f, mostrarTema }: { f: FrenteFormatada; mostrarTema: boolean }) {
	return (
		<li className={f.sigla ? "pg-dlg__row" : "pg-dlg__row pg-dlg__row--sem"} title={f.raw}>
			{f.sigla ? <Tag tone="phos">{f.sigla}</Tag> : null}
			<span className="pg-dlg__nome">
				{f.label}
				{mostrarTema ? <small>{f.tema}</small> : null}
			</span>
			{f.isMista ? <Tag>Mista</Tag> : null}
		</li>
	);
}

function Vazio({ children }: { children: ReactNode }) {
	return <p className="pg-empty">{children}</p>;
}

/** Chips de tema (só os que têm frentes), no lugar dos antigos blocos por eixo. */
function FiltroDeTemas({ frentes, tema, onTema }: { frentes: FrenteFormatada[]; tema: TemaFiltro; onTema: (t: TemaFiltro) => void }) {
	const temas = useMemo(() => contagemPorTema(frentes), [frentes]);
	if (temas.length < 2) return null;
	return (
		<div className="pg-chiprow" role="group" aria-label="Filtrar frentes por tema">
			<FilterChip pressed={tema === "todos"} onClick={() => onTema("todos")}>
				Todas ({frentes.length})
			</FilterChip>
			{temas.map((t) => (
				<FilterChip key={t.tema} pressed={tema === t.tema} onClick={() => onTema(t.tema)}>
					{t.tema} ({t.quantidade})
				</FilterChip>
			))}
		</div>
	);
}

function ListaComissoes({ itens }: { itens: ComissaoFormatada[] }) {
	if (itens.length === 0) return <Vazio>Nenhuma comissão encontrada.</Vazio>;
	return (
		<ul className="pg-dlg__list">
			{itens.map((c, i) => (
				<LinhaComissao key={`${c.raw}-${i}`} c={c} />
			))}
		</ul>
	);
}

function ListaFrentes({ itens, mostrarTema }: { itens: FrenteFormatada[]; mostrarTema: boolean }) {
	if (itens.length === 0) return <Vazio>Nenhuma frente encontrada.</Vazio>;
	return (
		<ul className="pg-dlg__list">
			{itens.map((f, i) => (
				<LinhaFrente key={`${f.raw}-${i}`} f={f} mostrarTema={mostrarTema} />
			))}
		</ul>
	);
}

/**
 * Lista completa de comissões e frentes de um parlamentar. O Perfil mostra um resumo
 * (3 comissões, 6 frentes); este diálogo traz o restante, com busca e filtro por tema.
 */
export default function FrentesComissoesDialog({
	comissoes = [],
	frentes = [],
	nomePolitico = "Parlamentar",
	partido,
	uf,
	trigger,
	initialTab = "frentes",
}: FrentesComissoesDialogProps) {
	const [aba, setAba] = useState<Aba>(initialTab === "comissoes" ? "comissoes" : "frentes");
	const [busca, setBusca] = useState("");
	const [tema, setTema] = useState<TemaFiltro>("todos");

	const todasComissoes = useMemo(() => comissoesFormatadas(comissoes), [comissoes]);
	const todasFrentes = useMemo(() => frentesFormatadas(frentes), [frentes]);
	const comissoesVisiveis = useMemo(() => filtrarComissoes(todasComissoes, busca), [todasComissoes, busca]);
	const frentesVisiveis = useMemo(() => filtrarFrentes(todasFrentes, tema, busca), [todasFrentes, tema, busca]);
	const sigla = partido ? ` · ${partido}${uf ? `-${uf}` : ""}` : "";

	return (
		<Dialog>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className="pg-dlg">
				<header className="pg-dlg__head">
					<DialogTitle>Comissões e frentes</DialogTitle>
					<DialogDescription>
						{tituloCaso(nomePolitico)}
						{sigla}
					</DialogDescription>
				</header>

				<div className="pg-dlg__bar">
					<Seg<Aba>
						label="Seção"
						value={aba}
						onChange={setAba}
						options={[
							{ value: "comissoes", label: `Comissões (${todasComissoes.length})`, icon: <PixelIcon name="users" size={14} /> },
							{ value: "frentes", label: `Frentes (${todasFrentes.length})`, icon: <PixelIcon name="list" size={14} /> },
						]}
					/>
					<label className="pg-dlg__busca">
						<PixelIcon name="search" size={14} />
						<input
							className="pg-input"
							value={busca}
							onChange={(e) => setBusca(e.target.value)}
							placeholder={aba === "frentes" ? "Buscar frente por nome ou tema" : "Buscar comissão por nome"}
							aria-label="Buscar"
						/>
					</label>
					{aba === "frentes" ? <FiltroDeTemas frentes={todasFrentes} tema={tema} onTema={setTema} /> : null}
				</div>

				<div className="pg-dlg__corpo">
					{aba === "comissoes" ? <ListaComissoes itens={comissoesVisiveis} /> : <ListaFrentes itens={frentesVisiveis} mostrarTema={tema === "todos"} />}
				</div>

				<footer className="pg-dlg__foot">Fonte: dados abertos da Câmara dos Deputados</footer>
			</DialogContent>
		</Dialog>
	);
}
