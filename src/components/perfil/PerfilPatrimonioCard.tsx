"use client";

import { useMemo, useState } from "react";
import { Panel, PixelBar, Tag } from "@/components/ds";
import { brl, brlCurto, percentual } from "@/lib/format";
import { agruparBens, type BemItem, type GrupoBens, maioresBens } from "@/lib/patrimonio";
import { descricaoDeBem, corrigirTextoTse } from "@/lib/texto";

interface TsePerfilData {
	patrimonioTotal?: number;
	anoEleicao?: number;
	bensDeclarados?: BemItem[];
	patrimonioAnterior?: number;
	anoPatrimonioAnterior?: number;
	variacaoPatrimonio?: number;
	variacaoPatrimonioPercentual?: number;
}

const BENS_NO_RESUMO = 5;

function Evolucao({ tse }: { tse: TsePerfilData }) {
	const v = tse.variacaoPatrimonioPercentual;
	if (v === undefined || tse.anoPatrimonioAnterior === undefined) return null;
	const sinal = v > 0 ? "▲ +" : v < 0 ? "▼ " : "= ";
	return (
		<div className="pg-pat__evo">
			<Tag tone={v > 0 ? "warn" : "default"}>
				{sinal}
				{percentual(v)} desde {tse.anoPatrimonioAnterior}
			</Tag>
			<span>
				Era {brl(tse.patrimonioAnterior ?? 0)} em {tse.anoPatrimonioAnterior}
			</span>
		</div>
	);
}

/** Onde está o patrimônio: uma barra por categoria de bem. */
function Composicao({ grupos }: { grupos: GrupoBens[] }) {
	if (grupos.length === 0) return null;
	return (
		<section className="pg-pat__sec" aria-label="Composição do patrimônio">
			<h4 className="pg-pat__h">Onde está o patrimônio</h4>
			<ul className="pg-comp">
				{grupos.map((g) => (
					<li key={g.categoria}>
						<div className="pg-comp__t">
							<span>{g.rotulo}</span>
							<span>
								<b>{brlCurto(g.total)}</b> · {Math.round(g.percentual)}% · {g.quantidade} {g.quantidade === 1 ? "bem" : "bens"}
							</span>
						</div>
						<PixelBar value={g.percentual} size="sm" label={`${g.rotulo}: ${Math.round(g.percentual)}% do patrimônio`} />
					</li>
				))}
			</ul>
		</section>
	);
}

function LinhaBem({ bem }: { bem: BemItem }) {
	const tipo = corrigirTextoTse(bem.descricaoDeTipoDeBem || bem.tipoBem);
	return (
		<li className="pg-bem">
			<div>
				<b>{descricaoDeBem(bem.descricao) || "Ativo patrimonial"}</b>
				{tipo ? <span>{tipo}</span> : null}
			</div>
			<span className="pg-bem__v">{brl(bem.valor ?? 0)}</span>
		</li>
	);
}

/** Maiores bens, com opção de ver a lista completa. */
function ListaDeBens({ bens }: { bens: BemItem[] }) {
	const [todos, setTodos] = useState(false);
	const ordenados = useMemo(() => maioresBens(bens, bens.length), [bens]);
	const visiveis = todos ? ordenados : ordenados.slice(0, BENS_NO_RESUMO);
	return (
		<section className="pg-pat__sec" aria-label="Bens declarados">
			<h4 className="pg-pat__h">{todos ? "Todos os bens" : "Maiores bens"}</h4>
			<ul className={todos ? "pg-bens pg-bens--todos" : "pg-bens"}>
				{visiveis.map((b, i) => (
					<LinhaBem key={`${b.descricao}-${i}`} bem={b} />
				))}
			</ul>
			{bens.length > BENS_NO_RESUMO ? (
				<button type="button" className="pg-btn pg-btn--block" aria-expanded={todos} onClick={() => setTodos((t) => !t)}>
					{todos ? "Mostrar só os maiores" : `Ver todos os ${bens.length} bens`}
				</button>
			) : null}
		</section>
	);
}

export default function PerfilPatrimonioCard({ tse }: { tse?: TsePerfilData | null }) {
	const bens = useMemo(() => tse?.bensDeclarados ?? [], [tse]);
	const grupos = useMemo(() => agruparBens(bens), [bens]);
	const ano = tse?.anoEleicao ?? "—";
	const tem = (tse?.patrimonioTotal ?? 0) > 0;

	return (
		<Panel title="Patrimônio declarado" sub={`Declarado ao TSE em ${ano}`} id="patrimonio" badge={bens.length > 0 ? <Tag>{bens.length} bens</Tag> : undefined}>
			<div className="pg-pat">
				<div className="pg-pat__topo">
					<div className="pg-hero-n">{tem ? brl(tse?.patrimonioTotal) : "Não localizado"}</div>
					{tem && tse ? <Evolucao tse={tse} /> : null}
				</div>
				{bens.length === 0 ? (
					<p className="pg-note">Nenhum bem individual detalhado disponível para a declaração de {ano}.</p>
				) : (
					<>
						<Composicao grupos={grupos} />
						<ListaDeBens bens={bens} />
					</>
				)}
			</div>
		</Panel>
	);
}
