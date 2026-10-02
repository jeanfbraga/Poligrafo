"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Corners, Label, Panel, Tag } from "@/components/ds";
import FrentesComissoesDialog from "@/components/perfil/FrentesComissoesDialog";
import { iniciais } from "@/lib/format";
import { statusDoMandato } from "@/lib/mandato";
import { tituloCaso } from "@/lib/texto";
import {
	type ComissaoFormatada,
	type FrenteFormatada,
	formatarComissao,
	formatarNomeFrente,
} from "@/lib/parlamentar-utils";

type Dados = Record<string, any>;

/** Foto oficial com cadeia de fallback (props → Supabase → Câmara → iniciais). */
function Foto({ idDeputado, fotoUrl, nome }: { idDeputado: string; fotoUrl?: string; nome: string }) {
	const [tentativa, setTentativa] = useState(0);
	const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
	const id = idDeputado.replace(/^pessoa-/, "");
	const fontes = useMemo(() => {
		const l: string[] = [];
		if (fotoUrl?.trim()) l.push(fotoUrl.trim());
		if (base && /^\d+$/.test(id)) l.push(`${base}/storage/v1/object/public/fotos-politicos/${id}.jpg`);
		if (/^\d+$/.test(id)) l.push(`https://www.camara.leg.br/internet/deputado/bandep/${id}.jpg`);
		return l;
	}, [fotoUrl, base, id]);

	return (
		<div className="pg-photo">
			<Corners />
			{tentativa < fontes.length ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img key={fontes[tentativa]} src={fontes[tentativa]} alt="Foto oficial" onError={() => setTentativa((n) => n + 1)} />
			) : (
				<>
					<span className="pg-photo__initials">{iniciais(nome)}</span>
					<small className="pg-photo__none">SEM FOTO</small>
				</>
			)}
		</div>
	);
}

function compararComissoes(a: ComissaoFormatada, b: ComissaoFormatada): number {
	if (a.destaque !== b.destaque) return a.destaque ? -1 : 1;
	return a.nome.localeCompare(b.nome);
}

export function comissoesDe(perfil: Dados | null | undefined): ComissaoFormatada[] {
	if (!perfil?.comissoes) return [];
	return perfil.comissoes.map(formatarComissao).sort(compararComissoes);
}

export function frentesDe(perfil: Dados | null | undefined): FrenteFormatada[] {
	if (!perfil) return [];
	return (perfil.frentes || perfil.frentes_parlamentares || []).map(formatarNomeFrente);
}

export function profissoesDe(perfil: Dados | null | undefined): string[] {
	if (!Array.isArray(perfil?.profissoes)) return [];
	return perfil.profissoes.filter((p: unknown) => typeof p === "string" && p.trim().length > 0);
}

/**
 * Cargo atual exibido sob o nome. O Perfil só existe para deputados federais (ver doc 3).
 * "Titular" é o caso comum e não vira rótulo; só a suplência aparece aqui.
 */
export function rotuloDoCargo(perfil: Dados | null | undefined): string {
	const { condicao } = statusDoMandato(perfil);
	return condicao ? `Deputado Federal · ${condicao}` : "Deputado Federal";
}

function ChipsIdentidade({ perfil, idDeputado }: { perfil: Dados; idDeputado: string }) {
	const status = statusDoMandato(perfil);
	return (
		<div className="pg-chiprow">
			<Tag tone="phos">{perfil.partido || "S/PARTIDO"}</Tag>
			<Tag>{perfil.uf || "BR"}</Tag>
			{status.rotulo ? <Tag tone={status.tom}>{status.rotulo}</Tag> : null}
			<Tag>ID Câmara {idDeputado}</Tag>
		</div>
	);
}

function Identidade({ perfil, idDeputado }: { perfil: Dados; idDeputado: string }) {
	const nome = perfil.nome_eleitoral || perfil.nome_civil || "NOME NÃO INFORMADO";
	const mostraCivil = Boolean(perfil.nome_civil && perfil.nome_civil !== nome);
	const { detalhe } = statusDoMandato(perfil);
	return (
		<div className="pg-stack" style={{ gap: 10, minWidth: 0, flex: 1 }}>
			<div>
				<h1 className="pg-hero__nome">{tituloCaso(nome)}</h1>
				<p className="pg-cargo">{rotuloDoCargo(perfil)}</p>
				{detalhe ? <p className="pg-hero__civil">{detalhe}</p> : null}
				{mostraCivil ? <p className="pg-hero__civil">Nome civil: {tituloCaso(perfil.nome_civil)}</p> : null}
			</div>
			<ChipsIdentidade perfil={perfil} idDeputado={idDeputado} />
		</div>
	);
}
function Chips({ titulo, itens }: { titulo: string; itens: string[] }) {
	if (itens.length === 0) return null;
	return (
		<div className="pg-stack">
			<Label>{titulo}</Label>
			<div className="pg-chiprow">
				{itens.map((p, i) => (
					<Tag key={i} title={p} className="pg-tag--fit">{p}</Tag>
				))}
			</div>
		</div>
	);
}

function Comissoes({ itens, dialogProps }: { itens: ComissaoFormatada[]; dialogProps: Dados }) {
	if (itens.length === 0) return null;
	const top = itens.slice(0, 3);
	return (
		<div className="pg-stack">
			<Label>Comissões ativas ({itens.length})</Label>
			{top.map((c, i) => (
				<div key={i} style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 32 }} title={c.raw}>
					{c.sigla ? <Tag tone="phos">{c.sigla}</Tag> : null}
					<span style={{ flex: 1, minWidth: 0, color: "var(--pg-ink-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</span>
					{c.cargo ? <span className="pg-label">{c.cargo}</span> : null}
				</div>
			))}
			{itens.length > 3 ? (
				<FrentesComissoesDialog {...dialogProps} initialTab="comissoes" trigger={<button type="button" className="pg-more">Ver as {itens.length} comissões</button>} />
			) : null}
		</div>
	);
}

function Frentes({ itens, dialogProps }: { itens: FrenteFormatada[]; dialogProps: Dados }) {
	if (itens.length === 0) return null;
	const top = itens.slice(0, 6);
	return (
		<div className="pg-stack" style={{ gridColumn: "1 / -1" }}>
			<Label>Frentes parlamentares ({itens.length})</Label>
			<div className="pg-chiprow">
				{top.map((f, i) => (
					<Tag key={i} title={f.raw} className="pg-tag--fit">{f.sigla ? `${f.sigla} · ` : ""}{f.label}{f.isMista ? " · mista" : ""}</Tag>
				))}
				<FrentesComissoesDialog {...dialogProps} initialTab="frentes" trigger={<button type="button" className="pg-more">Ver as {itens.length} frentes</button>} />
			</div>
		</div>
	);
}

interface HeroProps {
	perfil: Dados;
	idDeputado: string;
	fotoUrl?: string;
	nome: string;
	acoes?: ReactNode;
	resumo?: ReactNode;
}

/** Topo do Perfil: foto, identidade (nome, cargo, chips), ação principal e resumo. */
function Hero({ perfil, idDeputado, fotoUrl, nome, acoes, resumo }: HeroProps) {
	return (
		<>
			<div className="pg-ficha">
				<Foto idDeputado={idDeputado} fotoUrl={fotoUrl} nome={nome || "?"} />
				<Identidade perfil={perfil} idDeputado={idDeputado} />
				{acoes ? <div className="pg-ficha__acoes">{acoes}</div> : null}
			</div>
			{resumo ? <div className="pg-ficha__resumo">{resumo}</div> : null}
		</>
	);
}

/** Cabeçalho do Perfil: identidade, formação, comissões e frentes. */
export default function ProfileHeader({
	perfil,
	idDeputado,
	fotoUrl,
	acoes,
	resumo,
}: {
	perfil: Dados;
	idDeputado: string;
	fotoUrl?: string;
	/** Ações principais do topo (ex.: Investigar) — coluna à direita no desktop, abaixo da identidade no mobile. */
	acoes?: ReactNode;
	/** Resumo "de relance", logo abaixo da identidade e antes de comissões/frentes. */
	resumo?: ReactNode;
}) {
	const profissoes = useMemo(() => profissoesDe(perfil), [perfil]);
	const comissoes = useMemo(() => comissoesDe(perfil), [perfil]);
	const frentes = useMemo(() => frentesDe(perfil), [perfil]);

	if (!perfil) {
		return (
			<Panel title="Perfil" id="perfil">
				<p className="pg-note" style={{ color: "var(--pg-warn)" }}>▲ Ficha base não encontrada na base local.</p>
			</Panel>
		);
	}

	const nome = perfil.nome_eleitoral || perfil.nome_civil || "";
	const dialogProps = {
		comissoes: perfil.comissoes || [],
		frentes: perfil.frentes || perfil.frentes_parlamentares || [],
		profissoes,
		nomePolitico: nome || "NOME NÃO INFORMADO",
		partido: perfil.partido,
		uf: perfil.uf,
	};

	return (
		<Panel title="Perfil" sub="Dados abertos da Câmara" flush id="perfil">
			<Hero perfil={perfil} idDeputado={idDeputado} fotoUrl={fotoUrl} nome={nome} acoes={acoes} resumo={resumo} />
			<div className="pg-ficha-grid">
				<Chips titulo="Formação / profissão" itens={profissoes} />
				<Comissoes itens={comissoes} dialogProps={dialogProps} />
				<Frentes itens={frentes} dialogProps={dialogProps} />
			</div>
		</Panel>
	);
}
