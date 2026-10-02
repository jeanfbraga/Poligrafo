import { Spinner } from "@/components/ds";
import type { EtapaStatus } from "@/lib/investigacao/etapas";
import type { EtapaView } from "@/lib/investigacao/job-view";

const ICONE: Record<Exclude<EtapaStatus, "run">, string> = {
	wait: "□",
	ok: "✓",
	slow: "▲",
	na: "·",
	cut: "—",
};

function Icone({ status }: { status: EtapaStatus }) {
	return <i className="pg-stage__ic">{status === "run" ? <Spinner /> : ICONE[status]}</i>;
}

/** Lista de fontes com o estado de cada uma (aguardando, consultando, ok, lento, não se aplica...). */
export function EtapasPorFonte({ etapas }: { etapas: EtapaView[] }) {
	return (
		<div className="pg-stages" role="list" aria-label="Etapas por fonte">
			{etapas.map((e) => (
				<div key={e.id} className="pg-stage" data-s={e.status} role="listitem">
					<Icone status={e.status} />
					<b>{e.nome}</b>
					<span className="pg-stage__st">{e.texto}</span>
					<small>{e.detalhe}</small>
				</div>
			))}
		</div>
	);
}
