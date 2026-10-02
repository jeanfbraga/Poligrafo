"use client";

import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Kv, Label, PixelBar, Tag } from "@/components/ds";
import { PessoaAvatar } from "@/components/nodes/PessoaAvatar";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { brl, dataBR, numeroSeguro, percentual } from "@/lib/format";
import { urlDocumentoValida } from "./acoes";

type Dados = Record<string, any>;

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
	return (
		<div className="pg-insp__sec">
			<Label>{titulo}</Label>
			{children}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/* PESSOA                                                             */
/* ------------------------------------------------------------------ */

function CabecalhoPessoa({ d }: { d: Dados }) {
	const doc = String(d.documentoPrincipal || d.cpf || "");
	const semDoc = !doc || doc === "000.000.000-00" || doc === "00000000000";
	return (
		<div style={{ display: "flex", gap: 12, alignItems: "center" }}>
			<PessoaAvatar urlFoto={d.urlFoto || d.foto} urlFotoFallback={d.urlFotoFallback} nome={d.label} tamanho="insp" />
			<div style={{ minWidth: 0 }}>
				<div className="pg-chiprow">
					{d.partido ? <Tag tone="phos">{d.partido}</Tag> : null}
					<Tag>
						{d.cargo || "POLÍTICO"} — {d.uf || "??"}
					</Tag>
				</div>
				<p className="pg-label" style={{ marginTop: 6 }}>
					{semDoc ? "CPF não disponibilizado pela casa legislativa" : `CPF ${doc}`}
				</p>
			</div>
		</div>
	);
}

/** Quantas vezes o patrimônio cresceu (null se não cresceu). */
export function multiploPatrimonio(atual: number, anterior: number): string | null {
	return anterior > 0 && atual > anterior ? (atual / anterior).toFixed(1) : null;
}

function VariacaoTag({ pct }: { pct: number }) {
	return (
		<Tag tone={pct > 50 ? "warn" : "default"}>
			{pct > 0 ? "▲ +" : "▼ "}
			{percentual(pct)}
		</Tag>
	);
}

function EvolucaoPatrimonio({ d }: { d: Dados }) {
	const anterior = d.anoPatrimonioAnterior;
	if (anterior === undefined) return null;
	const ant = Number(d.patrimonioAnterior || 0);
	const nominal = Number(d.variacaoPatrimonio || 0);
	const multiplo = multiploPatrimonio(Number(d.patrimonio || 0), ant);
	return (
		<>
			<Kv
				items={[
					{ key: "ant", label: `Eleição ${anterior}`, value: brl(ant) },
					{ key: "nom", label: "Diferença nominal", value: `${nominal >= 0 ? "+" : ""}${brl(nominal)}` },
					{ key: "pct", label: "Variação", value: <VariacaoTag pct={Number(d.variacaoPatrimonioPercentual || 0)} /> },
				]}
			/>
			{multiplo ? (
				<p className="pg-note">&gt; O patrimônio declarado cresceu {multiplo}x em relação à eleição de {anterior}.</p>
			) : null}
		</>
	);
}

function HistoricoEleicoes({ historico }: { historico: Dados[] }) {
	if (historico.length <= 1) return null;
	return (
		<Secao titulo={`Histórico por eleição (${historico.length})`}>
			<div className="pg-panel__body--flush">
				{historico.map((h, i) => (
					<div key={i} className="pg-lrow" style={{ gridTemplateColumns: "1fr auto", minHeight: 44 }}>
						<div className="pg-lrow__main">
							<b>
								{h.ano} · {h.cargo || "Candidato"}
							</b>
							{h.partido ? <span>{h.partido}</span> : null}
						</div>
						<span className="pg-lrow__meta" style={{ color: "var(--pg-ink-1)" }}>
							{brl(h.patrimonioTotal || 0)}
						</span>
					</div>
				))}
			</div>
		</Secao>
	);
}

function BensDeclarados({ bens }: { bens: Dados[] }) {
	if (bens.length === 0) return null;
	return (
		<details className="pg-stagesd">
			<summary>
				<span>Bens declarados no TSE ({bens.length})</span>
			</summary>
			<div style={{ maxHeight: 240, overflow: "auto" }}>
				{bens.map((b, i) => (
					<div key={i} className="pg-lrow" style={{ gridTemplateColumns: "1fr auto", minHeight: 44 }}>
						<div className="pg-lrow__main">
							<b>{b.descricao || b.tipoBem || "Ativo patrimonial"}</b>
							{b.descricaoDeTalhada && b.descricaoDeTalhada !== b.descricao ? <span>{b.descricaoDeTalhada}</span> : null}
						</div>
						<span className="pg-lrow__meta" style={{ color: "var(--pg-ink-1)" }}>
							{brl(b.valor || 0)}
						</span>
					</div>
				))}
			</div>
		</details>
	);
}

function AlertasPessoais({ alertas }: { alertas: string[] }) {
	if (alertas.length === 0) return null;
	return (
		<Secao titulo="Alertas e cadastro de inidôneos (CGU / TSE / DataJud)">
			<div className="pg-riskbox pg-riskbox--crit">
				{alertas.map((a, i) => (
					<p key={i}>&gt; {a}</p>
				))}
			</div>
		</Secao>
	);
}

export function SecoesPessoa({ d }: { d: Dados }) {
	const temPatrimonio = d.patrimonio !== undefined;
	return (
		<>
			<CabecalhoPessoa d={d} />
			{temPatrimonio ? (
				<Secao titulo={`Patrimônio declarado (${d.anoPatrimonio || "—"})`}>
					<div className="pg-hero-n">{brl(d.patrimonio || 0)}</div>
					<EvolucaoPatrimonio d={d} />
				</Secao>
			) : null}
			<HistoricoEleicoes historico={d.historicoPatrimonio || []} />
			<BensDeclarados bens={d.bensDeclarados || []} />
			<AlertasPessoais alertas={d.alertasPessoais || []} />
		</>
	);
}

/* ------------------------------------------------------------------ */
/* DESPESA                                                            */
/* ------------------------------------------------------------------ */

export interface PortalFallback {
	mensagem: string;
	link: string;
	textoLink: string;
}

export function SecoesDespesa({ d, fonteLabel, portal }: { d: Dados; fonteLabel: string; portal: PortalFallback }) {
	const registro = !urlDocumentoValida(d.urlDocumento);
	const alertas: string[] = d.risco?.alertas ?? [];
	return (
		<>
			{d.descricao ? (
				<Secao titulo="Objeto / finalidade">
					<p className="pg-note">{d.descricao}</p>
				</Secao>
			) : null}
			{registro ? (
				<Secao titulo="Comprovação e registro oficial">
					<Kv
						items={[
							{ key: "doc", label: "Documento", value: d.numeroDocumento || "Registro oficial" },
							{ key: "org", label: "Órgão", value: d.orgao || "Municipal" },
							{ key: "mod", label: "Modalidade", value: d.modalidade || d.tipo || "Contrato" },
						]}
					/>
					<p className="pg-note">Registro consolidado via base de compras governamentais (fonte: {fonteLabel}).</p>
					<p className="pg-note">{portal.mensagem}</p>
					<a className="pg-btn" href={portal.link} target="_blank" rel="noopener noreferrer">
						<PixelIcon name="link" size={14} />
						{portal.textoLink}
					</a>
				</Secao>
			) : null}
			{alertas.length > 0 ? (
				<Secao titulo="Cruzamento de dados oficiais (CGU / TCU / Receita)">
					<div className="pg-riskbox pg-riskbox--crit">
						{alertas.map((a, i) => (
							<p key={i}>&gt; {a}</p>
						))}
					</div>
				</Secao>
			) : null}
		</>
	);
}

/* ------------------------------------------------------------------ */
/* CONTRATO / EMENDA                                                  */
/* ------------------------------------------------------------------ */

function BeneficiarioContratos({ cnpj }: { cnpj: string }) {
	const [contratos, setContratos] = useState<Dados[]>([]);
	const [carregando, setCarregando] = useState(false);

	async function buscar() {
		setCarregando(true);
		try {
			const res = await fetch(`/api/investigar/contratos-beneficiario?cnpj=${encodeURIComponent(cnpj)}`);
			if (!res.ok) {
				toast.error("Erro ao buscar contratos do beneficiário.");
				return;
			}
			const json = await res.json();
			setContratos(json.contracts || []);
			if (!json.contracts?.length) toast.info("Nenhum contrato encontrado para este CNPJ no PNCP.");
		} catch {
			toast.error("Falha de rede ao consultar contratos.");
		} finally {
			setCarregando(false);
		}
	}

	if (contratos.length === 0) {
		return (
			<button type="button" className="pg-btn pg-btn--block" disabled={carregando} onClick={buscar}>
				<PixelIcon name="search" size={14} />
				{carregando ? "Consultando PNCP…" : "Investigar contratos do recebedor (PNCP)"}
			</button>
		);
	}
	return (
		<div className="pg-panel__body--flush" style={{ maxHeight: 220, overflow: "auto" }}>
			{contratos.map((c, i) => (
				<div key={i} className="pg-lrow" style={{ gridTemplateColumns: "1fr auto", minHeight: 52 }}>
					<div className="pg-lrow__main">
						<b>{c.orgao}</b>
						<span>
							{c.tipo === "COMPRADOR" ? "Comprador/órgão" : "Fornecedor"} · {c.data ? dataBR(c.data) : "s/ data"}
						</span>
					</div>
					<span className="pg-lrow__meta" style={{ color: "var(--pg-ink-1)" }}>
						{brl(c.valor)}
					</span>
				</div>
			))}
		</div>
	);
}

function Beneficiario({ b }: { b: Dados }) {
	return (
		<Secao titulo="Beneficiário recebedor">
			<Kv
				items={[
					{ key: "nome", label: "Nome", value: b.nome },
					{ key: "cnpj", label: "CNPJ", value: <span className="pg-code">{b.cnpj}</span> },
					{ key: "uf", label: "UF", value: b.uf },
					...(b.area ? [{ key: "area", label: "Política pública", value: b.area }] : []),
					...(b.situacao ? [{ key: "sit", label: "Situação", value: b.situacao }] : []),
				]}
			/>
			{b.cnpj ? <BeneficiarioContratos cnpj={String(b.cnpj)} /> : null}
		</Secao>
	);
}

function SituacaoPagamento({ d }: { d: Dados }) {
	const pago = numeroSeguro(d.valorPago);
	if (pago === null) return null;
	return (
		<Secao titulo="Situação do pagamento">
			<p className="pg-note">{pago > 0 ? `Pagamento de ${brl(pago)}` : "Apenas empenhado · sem pagamento"}</p>
		</Secao>
	);
}

function DadosProposicao({ d }: { d: Dados }) {
	if (!d.tipo) return null;
	return (
		<Secao titulo="Dados da proposição">
			<Kv
				items={[
					{ key: "tipo", label: "Tipo", value: d.tipo },
					{ key: "ano", label: "Ano/exercício", value: d.ano || "N/A" },
					...(d.programa ? [{ key: "prog", label: "Programa", value: d.programa }] : []),
				]}
			/>
		</Secao>
	);
}

function ExtrasEmenda({ d }: { d: Dados }) {
	return (
		<>
			<SituacaoPagamento d={d} />
			<DadosProposicao d={d} />
		</>
	);
}

export function SecoesContratoEmenda({ d, ehEmenda }: { d: Dados; ehEmenda: boolean }) {
	return (
		<>
			{ehEmenda ? <ExtrasEmenda d={d} /> : null}
			<Secao titulo={ehEmenda ? "Destinação / função" : "Objeto / destinação"}>
				<p className="pg-note">
					{d.objeto || "N/A"}
					{d.subfuncao ? ` · Subfunção: ${d.subfuncao}` : ""}
				</p>
			</Secao>
			{ehEmenda && d.beneficiario ? <Beneficiario b={d.beneficiario} /> : null}
		</>
	);
}

/* ------------------------------------------------------------------ */
/* EMENDA_RESUMO                                                      */
/* ------------------------------------------------------------------ */

function ValoresConsolidados({ d }: { d: Dados }) {
	const taxa = Number(d.percentualExecucao || 0);
	return (
		<Secao titulo="Valores consolidados">
			<Kv
				items={[
					{ key: "emp", label: "Empenhado", value: brl(d.totalEmpenhado || 0), big: true },
					{ key: "pago", label: "Pago", value: brl(d.totalPago || 0) },
				]}
			/>
			<PixelBar value={taxa} tone={taxa < 30 ? "warn" : "phos"} label="Taxa de execução" />
			<p className="pg-label" style={{ textAlign: "right" }}>
				Taxa de execução: {taxa}%
			</p>
		</Secao>
	);
}

function FatoresDeRisco({ d }: { d: Dados }) {
	const fantasmas = Number(d.fantasmas || 0);
	const pix = Number(d.emendasPIX || 0);
	if (fantasmas <= 0 && pix <= 0) return null;
	return (
		<Secao titulo="Fatores de risco detectados">
			<div className="pg-riskbox pg-riskbox--warn">
				{fantasmas > 0 ? <p>&gt; {fantasmas} emenda(s) fantasma(s): sem pagamentos.</p> : null}
				{pix > 0 ? <p>&gt; {pix} emenda(s) Pix/orçamento secreto.</p> : null}
			</div>
		</Secao>
	);
}

function ListaSecao({ titulo, itens }: { titulo: string; itens: { key: string; label: string; value: string }[] }) {
	if (itens.length === 0) return null;
	return (
		<Secao titulo={titulo}>
			<Kv items={itens} />
		</Secao>
	);
}

export function SecoesResumoEmendas({ d }: { d: Dados }) {
	const porTipo = Object.entries((d.porTipo as Record<string, number>) || {}).map(([tipo, qtd]) => ({
		key: tipo,
		label: tipo.toUpperCase(),
		value: `${String(qtd)}x`,
	}));
	const locais = ((d.topLocalidades as Dados[]) || []).map((l, i) => ({
		key: String(i),
		label: String(l.localidade),
		value: brl(l.valor || 0),
	}));
	return (
		<>
			<ValoresConsolidados d={d} />
			<FatoresDeRisco d={d} />
			<ListaSecao titulo="Distribuição por tipo" itens={porTipo} />
			<ListaSecao titulo="Principais localidades (valores)" itens={locais} />
		</>
	);
}
