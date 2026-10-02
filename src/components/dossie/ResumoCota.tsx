import { brl } from "@/lib/format";
import { type ResumoCota as Resumo, textoRecorte } from "@/lib/investigacao/cota";

const dia = (d: Date | null): string => (d ? d.toLocaleDateString("pt-BR") : "—");

/**
 * Total e recorte da cota parlamentar. Substitui o antigo nó "aglutinador":
 * fica no topo da lista de despesas (rail no desktop, visão "Despesas" no mobile).
 */
export function ResumoCota({ resumo }: { resumo: Resumo }) {
	return (
		<section className="pg-cota" aria-label="Resumo da cota parlamentar">
			<span className="pg-label">Cota parlamentar · recorte</span>
			<b className="pg-cota__total">{brl(resumo.total)}</b>
			<span className="pg-cota__periodo">
				{resumo.notas} notas · {dia(resumo.de)} → {dia(resumo.ate)}
			</span>
			<small className="pg-cota__nota">{textoRecorte(resumo)}</small>
		</section>
	);
}
