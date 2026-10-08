"use client";

import type { ReactNode } from "react";
import { KStats, PixelBar, Spinner, Tag } from "@/components/ds";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import type { Alvo } from "@/lib/investigacao/alvo";
import { FONTES } from "@/lib/investigacao/etapas";
import { type JobView, jobView } from "@/lib/investigacao/job-view";
import { EtapasPorFonte } from "./EtapasPorFonte";
import { useInvestigacao, useRelogio } from "./InvestigacaoProvider";
import { ProblemasDeConexao } from "./ProblemasDeConexao";

interface JobPanelProps {
	alvo: Alvo;
	/** Abre o Dossiê deste alvo. */
	onAbrir: () => void;
	mobile?: boolean;
	/**
	 * A página já tem o botão principal (Investigar / Acompanhar / Abrir dossiê) no topo:
	 * o painel não repete essas ações, só o detalhe e as ações secundárias.
	 */
	acaoNoTopo?: boolean;
}

function Estatisticas({ v }: { v: JobView }) {
	return (
		<KStats
			cols={3}
			className="pg-job-stats"
			items={[
				{ key: "nos", label: "Nós encontrados", value: v.nos },
				{ key: "crit", label: "◆ Críticos", value: v.criticos, tone: v.criticos > 0 ? "crit" : undefined },
				{ key: "warn", label: "▲ Atenção", value: v.atencao, tone: v.atencao > 0 ? "warn" : undefined },
			]}
		/>
	);
}

function Etapas({ v, mobile }: { v: JobView; mobile?: boolean }) {
	if (!mobile) return <EtapasPorFonte etapas={v.etapas} />;
	return (
		<details className="pg-stagesd">
			<summary>
				<span>Etapas por fonte</span>
				<b>
					{v.concluidas}/{v.aplicaveis}
				</b>
			</summary>
			<EtapasPorFonte etapas={v.etapas} />
		</details>
	);
}

const Dica = ({ children }: { children: ReactNode }) => <p className="pg-job__hint">{children}</p>;

function Ocioso({ v, onIniciar, semBotao }: { v: JobView; onIniciar: () => void; semBotao?: boolean }) {
	return (
		<>
			<p style={{ color: "var(--pg-ink-1)" }}>
				Este perfil ainda não tem dossiê. Investigar consulta {FONTES.length} frentes de fontes oficiais e leva alguns
				minutos. Você pode continuar navegando: a investigação segue em segundo plano e o resultado fica guardado
				nesta sessão.
			</p>
			<div className="pg-chiprow">
				{FONTES.map((f) => (
					<Tag key={f.id}>{f.nome}</Tag>
				))}
			</div>
			{v.outraEmAndamento ? (
				<Dica>Já existe outra investigação em andamento. Iniciar esta a substitui.</Dica>
			) : null}
			{semBotao ? null : (
				<div className="pg-job__act">
					<button type="button" className="pg-btn pg-btn--primary pg-btn--big" onClick={onIniciar}>
						<PixelIcon name="search" size={16} /> Investigar
					</button>
				</div>
			)}
			<Dica>
				{semBotao
					? "Para começar, use o botão Investigar parlamentar no topo. Leva alguns minutos e varia com o estado das fontes."
					: "Demora: alguns minutos, varia por alçada e pelo estado das fontes."}
			</Dica>
		</>
	);
}

function EmAndamento({ v, mobile, onAbrir, onCancelar, semBotao }: { v: JobView; mobile?: boolean; onAbrir: () => void; onCancelar: () => void; semBotao?: boolean }) {
	return (
		<>
			<div className="pg-job__top">
				<div className="pg-job__pct" data-j="pct">
					{v.pct}%
				</div>
				<PixelBar value={v.pct} size="lg" label="Progresso da investigação" />
				{mobile ? null : (
					<div className="pg-job__meta">
						<b>
							{v.concluidas}/{v.aplicaveis}
						</b>{" "}
						fontes
						<br />
						{v.relogio} <span>decorridos</span>
					</div>
				)}
			</div>
			{mobile ? <Dica>{v.relogio} decorridos</Dica> : null}
			<Estatisticas v={v} />
			<ProblemasDeConexao problemas={v.problemas} rodando />
			<Etapas v={v} mobile={mobile} />
			<p className="pg-job__log" aria-live="polite">&gt; {v.log || "Conectando às fontes…"}</p>
			<div className="pg-job__act">
				{semBotao ? null : (
					<button type="button" className="pg-btn pg-btn--primary" onClick={onAbrir}>
						<PixelIcon name="graph" size={14} /> Acompanhar ao vivo
					</button>
				)}
				<button type="button" className="pg-btn" onClick={onCancelar}>
					Cancelar
				</button>
			</div>
			<Dica>
				{mobile
					? "Pode sair desta tela: a investigação continua e uma faixa fica no topo."
					: "Pode sair desta tela. A investigação continua e um indicador fica no topo."}
			</Dica>
		</>
	);
}

function Interrompida({ v, mobile, onAbrir, onRecomecar }: { v: JobView; mobile?: boolean; onAbrir: () => void; onRecomecar: () => void }) {
	return (
		<>
			<p style={{ color: "var(--pg-ink-1)" }}>
				Interrompida em <b>{v.pct}%</b> com {v.concluidas} de {v.aplicaveis} fontes concluídas. O dossiê é parcial:
				podem faltar achados.
			</p>
			<Estatisticas v={v} />
			<ProblemasDeConexao problemas={v.problemas} rodando={false} />
			<Etapas v={v} mobile={mobile} />
			<div className="pg-job__act">
				<button type="button" className="pg-btn pg-btn--primary" onClick={onRecomecar}>
					Recomeçar
				</button>
				{v.temNos ? (
					<button type="button" className="pg-btn" onClick={onAbrir}>
						Abrir parcial
					</button>
				) : null}
			</div>
			<Dica>Recomeçar roda a investigação de novo desde o início.</Dica>
		</>
	);
}

function Concluida({ v, onAbrir, onRefazer, semBotao }: { v: JobView; onAbrir: () => void; onRefazer: () => void; semBotao?: boolean }) {
	return (
		<>
			<p style={{ color: "var(--pg-ink-1)" }}>
				Dossiê pronto em {v.relogio}. Resultado guardado: abrir de novo é imediato.
			</p>
			<Estatisticas v={v} />
			<ProblemasDeConexao problemas={v.problemas} rodando={false} />
			<div className="pg-job__act">
				{semBotao ? null : (
					<button type="button" className="pg-btn pg-btn--primary" onClick={onAbrir}>
						<PixelIcon name="graph" size={14} /> Abrir dossiê
					</button>
				)}
				<button type="button" className="pg-btn" onClick={onRefazer}>
					Reinvestigar
				</button>
			</div>
		</>
	);
}

function Falhou({ v, onAbrir, onRecomecar }: { v: JobView; onAbrir: () => void; onRecomecar: () => void }) {
	return (
		<>
			<p style={{ color: "var(--pg-crit)" }}>&gt; A investigação falhou: {v.erro || "erro desconhecido"}.</p>
			<div className="pg-job__act">
				<button type="button" className="pg-btn pg-btn--primary" onClick={onRecomecar}>
					Tentar de novo
				</button>
				{v.temNos ? (
					<button type="button" className="pg-btn" onClick={onAbrir}>
						Abrir parcial
					</button>
				) : null}
			</div>
		</>
	);
}

function Selo({ estado }: { estado: JobView["estado"] }) {
	if (estado === "running")
		return (
			<Tag tone="phos">
				<Spinner /> Em andamento
			</Tag>
		);
	if (estado === "partial") return <Tag tone="warn">▲ Interrompida</Tag>;
	if (estado === "done") return <Tag tone="phos">✓ Concluída</Tag>;
	if (estado === "error") return <Tag tone="crit">◆ Falhou</Tag>;
	return null;
}

/**
 * Painel "Investigação" do Perfil: a investigação é um PROCESSO (minutos),
 * não uma aba. Mostra tempo, progresso, etapas por fonte e estados.
 */
export function JobPanel({ alvo, onAbrir, mobile, acaoNoTopo }: JobPanelProps) {
	const inv = useInvestigacao();
	const segundos = useRelogio();
	const v = jobView(inv.state, alvo, segundos);

	return (
		<section id="invest" className="pg-job pg-panel" data-state={v.estado}>
			<div className="pg-panel__head">
				<div className="pg-panel__title">
					Investigação
					<span className="pg-panel__sub">Cruza fontes oficiais e IA para apontar sinais de alerta</span>
				</div>
				<Selo estado={v.estado} />
			</div>
			<div className="pg-panel__body">
				{v.estado === "idle" ? <Ocioso v={v} onIniciar={() => inv.iniciar(alvo)} semBotao={acaoNoTopo} /> : null}
				{v.estado === "running" ? <EmAndamento v={v} mobile={mobile} onAbrir={onAbrir} onCancelar={inv.cancelar} semBotao={acaoNoTopo} /> : null}
				{v.estado === "partial" ? <Interrompida v={v} mobile={mobile} onAbrir={onAbrir} onRecomecar={inv.recomecar} /> : null}
				{v.estado === "done" ? <Concluida v={v} onAbrir={onAbrir} onRefazer={inv.recomecar} semBotao={acaoNoTopo} /> : null}
				{v.estado === "error" ? <Falhou v={v} onAbrir={onAbrir} onRecomecar={inv.recomecar} /> : null}
			</div>
		</section>
	);
}
