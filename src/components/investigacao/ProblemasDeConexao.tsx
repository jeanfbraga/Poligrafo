import type { ProblemaDeFonte } from "@/lib/investigacao/etapas";

/** Título do quadro: "Uma fonte não respondeu" / "3 fontes não responderam". */
export function tituloDosProblemas(n: number): string {
	return n === 1 ? "Uma fonte não respondeu" : `${n} fontes não responderam`;
}

/**
 * Quadro "Algumas fontes não responderam", em linguagem simples: quem falhou,
 * por quê e o que isso significa para o dossiê. Some quando não há problema.
 */
export function ProblemasDeConexao({ problemas, rodando }: { problemas: ProblemaDeFonte[]; rodando: boolean }) {
	if (problemas.length === 0) return null;
	return (
		<div className="pg-notice pg-problemas" role="status" aria-live="polite">
			<div className="pg-notice__head">
				<span>▲ {tituloDosProblemas(problemas.length)}</span>
			</div>
			<ul className="pg-problemas__lista">
				{problemas.map((p) => (
					<li key={p.fonte}>
						<b>{p.nome}</b>: {p.texto}.
					</li>
				))}
			</ul>
			<p className="pg-problemas__nota">
				{rodando ? "A investigação continua com as outras fontes. " : "O dossiê foi montado com o que respondeu. "}
				O que não respondeu não foi consultado, e isso não quer dizer que não exista. Investigar de novo mais tarde
				pode completar.
			</p>
		</div>
	);
}
