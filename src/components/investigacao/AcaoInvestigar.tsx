"use client";

import { PixelBar } from "@/components/ds";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import type { Alvo } from "@/lib/investigacao/alvo";
import { acaoDoJob, jobView } from "@/lib/investigacao/job-view";
import { useInvestigacao, useRelogio } from "./InvestigacaoProvider";

function irParaPainel() {
	document.getElementById("invest")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Botão principal do Perfil (no topo): inicia a investigação, mostra o andamento
 * ou abre o dossiê, conforme o estado do job. O detalhe fica no painel "Investigação".
 */
export function AcaoInvestigar({ alvo, onAbrir }: { alvo: Alvo; onAbrir: () => void }) {
	const inv = useInvestigacao();
	const segundos = useRelogio();
	const acao = acaoDoJob(jobView(inv.state, alvo, segundos));

	const executar = () => {
		if (acao.tipo === "abrir") return onAbrir();
		if (acao.tipo === "iniciar") void inv.iniciar(alvo);
		irParaPainel();
	};

	return (
		<div className="pg-acao">
			<button type="button" className="pg-btn pg-btn--primary pg-btn--big pg-btn--block" onClick={executar}>
				<PixelIcon name={acao.tipo === "abrir" ? "graph" : "search"} size={16} />
				{acao.rotulo}
			</button>
			{acao.progresso !== null ? <PixelBar value={acao.progresso} size="sm" label="Progresso da investigação" /> : null}
			<small className="pg-acao__dica">{acao.dica}</small>
		</div>
	);
}
