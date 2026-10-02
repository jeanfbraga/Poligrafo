"use client";

import Link from "next/link";
import { useState } from "react";
import { Panel, Seg } from "@/components/ds";
import { Paginador, usePagina } from "@/components/ds/Paginador";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { separarProducao } from "@/lib/producao-mandato";

type Dados = Record<string, any>;
type Aba = "atual" | "anteriores";

function LinhaProjeto({ p, idDeputado }: { p: Dados; idDeputado: string }) {
	return (
		<Link href={`/perfil/deputado/${idDeputado}/projeto/${p.id_proposicao}`} className="pg-lrow" style={{ gridTemplateColumns: "auto 1fr auto" }}>
			<PixelIcon name="file" size={14} />
			<div className="pg-lrow__main">
				<b>{p.titulo}</b>
				<span>{p.ementa ? String(p.ementa).slice(0, 90) : "Sem ementa"}</span>
			</div>
			<span className="pg-lrow__meta">
				{new Date(p.data_apresentacao).toLocaleDateString("pt-BR")}
				<PixelIcon name="chev" size={12} />
			</span>
		</Link>
	);
}

function subtituloDoPainel(atuais: number, anteriores: number): string {
	if (anteriores === 0) return `${atuais} projetos · toque para ler`;
	return `${atuais} no mandato atual · ${anteriores} de mandatos anteriores`;
}

function SeletorDeMandato({ aba, onAba, atuais, anteriores }: { aba: Aba; onAba: (a: Aba) => void; atuais: number; anteriores: number }) {
	return (
		<div style={{ padding: "8px 12px" }}>
			<Seg<Aba>
				label="Mandato"
				value={aba}
				onChange={onAba}
				options={[
					{ value: "atual", label: `Mandato atual (${atuais})` },
					{ value: "anteriores", label: `Anteriores (${anteriores})` },
				]}
			/>
		</div>
	);
}

export default function LegislativeProduction({ producao, idDeputado, perfil }: { producao: Dados[]; idDeputado: string; perfil?: Dados | null }) {
	const { atuais, anteriores } = separarProducao(producao, perfil);
	const [aba, setAba] = useState<Aba>(atuais.length > 0 ? "atual" : "anteriores");
	const lista = aba === "atual" ? atuais : anteriores;
	const pag = usePagina(lista, 8);

	if (!producao || producao.length === 0) {
		return (
			<Panel title="Produção legislativa" id="producao">
				<p className="pg-note">Nenhuma proposição encontrada no período.</p>
			</Panel>
		);
	}

	return (
		<Panel title="Produção legislativa" sub={subtituloDoPainel(atuais.length, anteriores.length)} flush id="producao">
			{anteriores.length > 0 ? (
				<SeletorDeMandato
					aba={aba}
					onAba={(a) => {
						setAba(a);
						pag.reset();
					}}
					atuais={atuais.length}
					anteriores={anteriores.length}
				/>
			) : null}
			{lista.length === 0 ? <p className="pg-note">Nenhuma proposição neste mandato.</p> : null}
			{pag.fatia.map((p) => (
				<LinhaProjeto key={p.id_proposicao} p={p} idDeputado={idDeputado} />
			))}
			<Paginador p={pag} />
		</Panel>
	);
}
