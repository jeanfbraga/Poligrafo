"use client";

import { Panel } from "@/components/ds";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import type { ApiWarning, Candidato } from "@/lib/investigacao/dossie-state";
import type { ProblemaDeFonte } from "@/lib/investigacao/etapas";
import { tituloCaso } from "@/lib/texto";

/** Problema de conexão (evento ETAPA) no mesmo formato dos avisos: o que falhou e o que isso significa. */
export function avisoDoProblema(p: ProblemaDeFonte): ApiWarning {
	const efeito = p.gravidade === "fora" ? "Nada desta fonte entrou no dossiê" : "Parte desta fonte não entrou no dossiê";
	return { fonte: `${p.nome} · não respondeu`, mensagem: `${p.texto}. ${efeito}; isso não quer dizer que os dados não existam.` };
}

/** Avisos de fontes (fora do ar, sem resposta, político não identificado na casa…). Não bloqueiam a investigação. */
export function AvisosApi({ avisos, onFechar }: { avisos: ApiWarning[]; onFechar: (fonte: string) => void }) {
	if (avisos.length === 0) return null;
	return (
		<div className="pg-notices" role="alert">
			{avisos.map((w) => (
				<div key={w.fonte} className="pg-notice">
					<div className="pg-notice__head">
						<span>▲ {w.fonte}</span>
						<button type="button" className="pg-btn pg-btn--icon pg-btn--ghost" style={{ height: 24, width: 24 }} aria-label={`Dispensar aviso de ${w.fonte}`} onClick={() => onFechar(w.fonte)}>
							<PixelIcon name="x" size={12} />
						</button>
					</div>
					<span>{w.mensagem}</span>
				</div>
			))}
		</div>
	);
}

/** Falha da extração: o usuário reconhece e tenta de novo. */
export function PainelErro({ mensagem, onTentar, onFechar }: { mensagem: string; onTentar: () => void; onFechar: () => void }) {
	return (
		<div className="pg-center" role="alertdialog" aria-label="Falha de extração">
			<Panel title="Falha de extração (OSINT)" sub="A investigação não pôde continuar">
				<div className="pg-riskbox pg-riskbox--crit">
					<p>◆ {mensagem}</p>
				</div>
				<div className="pg-job__act">
					<button type="button" className="pg-btn pg-btn--primary" onClick={onTentar}>
						Tentar de novo
					</button>
					<button type="button" className="pg-btn" onClick={onFechar}>
						Reconhecer e fechar
					</button>
				</div>
			</Panel>
		</div>
	);
}

/** Vários perfis com o mesmo nome: o usuário escolhe o alvo certo. */
export function PainelHomonimos({ candidatos, onEscolher, onCancelar }: { candidatos: Candidato[]; onEscolher: (c: Candidato) => void; onCancelar: () => void }) {
	return (
		<div className="pg-center" role="dialog" aria-label="Homônimos detectados">
			<Panel title="Homônimos detectados" sub={`${candidatos.length} perfis encontrados. Selecione o alvo correto.`} flush>
				<div style={{ maxHeight: 360, overflow: "auto" }}>
					{candidatos.map((c, i) => (
						<button key={`${c.ref}-${i}`} type="button" className="pg-lrow" style={{ gridTemplateColumns: "1fr auto" }} onClick={() => onEscolher(c)}>
							<div className="pg-lrow__main">
								<b>{tituloCaso(c.nome)}</b>
								<span>
									{c.cargo ?? "Político"} · UF {c.uf ?? "—"} · ID {c.id ?? "—"}
								</span>
							</div>
							<PixelIcon name="chev" size={14} />
						</button>
					))}
				</div>
				<div className="pg-pager">
					<span>Escolha para iniciar a investigação</span>
					<button type="button" className="pg-btn" style={{ height: 28 }} onClick={onCancelar}>
						Cancelar
					</button>
				</div>
			</Panel>
		</div>
	);
}
