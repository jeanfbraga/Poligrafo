"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel, Tag } from "@/components/ds";
import { ESTILO_TOOLTIP, ESTILO_TOOLTIP_ITEM, ESTILO_TOOLTIP_ROTULO } from "@/components/ds/chart-tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { type ResumoDaCota, resumirCotaMensal } from "@/lib/cota-mensal";
import { brl } from "@/lib/format";

type Dados = Record<string, any>;

const VERBA_GABINETE_TETO = 125734.51; // valor aproximado atual

function Grafico({ resumo, mobile }: { resumo: ResumoDaCota; mobile: boolean }) {
	const { dados, teto } = resumo;
	return (
		<div style={{ height: mobile ? 220 : 270, width: "100%" }}>
			<ResponsiveContainer width="100%" height="100%">
				<BarChart data={dados} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
					<CartesianGrid stroke="#12301f" vertical={false} />
					<XAxis dataKey="name" stroke="#4f9b6c" fontSize={10} tickLine={false} axisLine={{ stroke: "#1f4d31" }} tickFormatter={(v: string) => (mobile ? v.slice(0, 1) : v)} />
					<YAxis stroke="#4f9b6c" fontSize={10} width={mobile ? 38 : 55} tickLine={false} axisLine={{ stroke: "#1f4d31" }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
					<Tooltip formatter={(v) => [brl(Number(v)), "Gasto CEAP"]} contentStyle={ESTILO_TOOLTIP} itemStyle={ESTILO_TOOLTIP_ITEM} labelStyle={ESTILO_TOOLTIP_ROTULO} cursor={{ fill: "#102a1a", opacity: 0.6 }} />
					<Bar dataKey="gasto" maxBarSize={36} radius={0}>
						{dados.map((d) => (
							<Cell key={d.name} fill={teto > 0 && d.gasto > teto ? "#ffb224" : "#3dff8b"} fillOpacity={0.85} />
						))}
					</Bar>
					<ReferenceLine y={teto} stroke="#ffb224" strokeDasharray="5 4" label={{ position: "top", value: "TETO CEAP", fill: "#ffb224", fontSize: 10 }} />
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}

/** Situação do ano em relação ao teto; sem gasto algum, não afirma "dentro do teto". */
function SituacaoDoTeto({ resumo }: { resumo: ResumoDaCota }) {
	const { situacao, mesesAcima, ano } = resumo;
	if (situacao === "sem-gasto") return <Tag>sem gastos registrados em {ano}</Tag>;
	if (situacao === "dentro") return <Tag tone="phos">dentro do teto</Tag>;
	return <Tag tone="warn">▲ acima do teto: {mesesAcima} {mesesAcima === 1 ? "mês" : "meses"}</Tag>;
}

function SemGastos({ resumo }: { resumo: ResumoDaCota }) {
	return (
		<p className="pg-note">
			Nenhuma despesa de cota consta na base da Câmara para {resumo.ano}. Pode ser mandato recente, cota não utilizada ou notas ainda não publicadas.
		</p>
	);
}

export default function CotaChart({ cota }: { cota: Dados[] }) {
	const mobile = useIsMobile();

	if (!cota || cota.length === 0) {
		return (
			<Panel title="Cota parlamentar (CEAP)" id="cota">
				<p className="pg-note">Nenhum dado de cota encontrado para este deputado.</p>
			</Panel>
		);
	}

	const resumo = resumirCotaMensal(cota);

	return (
		<Panel title="Cota parlamentar (CEAP)" sub={`${resumo.ano} · gasto mensal contra o teto`} id="cota">
			{resumo.situacao === "sem-gasto" ? <SemGastos resumo={resumo} /> : <Grafico resumo={resumo} mobile={mobile} />}
			<div className="pg-chiprow">
				<SituacaoDoTeto resumo={resumo} />
			</div>
			<dl className="pg-kv">
				<div>
					<dt>Teto mensal CEAP</dt>
					<dd>{brl(resumo.teto)}</dd>
				</div>
				<div>
					<dt>Verba de gabinete</dt>
					<dd>{brl(VERBA_GABINETE_TETO)}</dd>
				</div>
			</dl>
		</Panel>
	);
}
