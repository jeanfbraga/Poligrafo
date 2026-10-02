"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Kv, Label, Panel, PixelBar, Spinner, Tag } from "@/components/ds";
import { AppShell } from "@/components/layout/AppShell";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { dataBR } from "@/lib/format";

type Dados = Record<string, any>;

function Estado({ titulo, sub, children, crit }: { titulo: string; sub?: string; children: ReactNode; crit?: boolean }) {
	return (
		<div className="pg-view">
			<div className="pg-view__inner">
				<Panel title={titulo} sub={sub}>
					{crit ? <div className="pg-riskbox pg-riskbox--crit">{children}</div> : children}
				</Panel>
			</div>
		</div>
	);
}

function Autoria({ autores }: { autores: Dados[] }) {
	if (!autores || autores.length === 0) return <span>Autoria não informada.</span>;
	return (
		<>
			{autores.map((a, i) => (
				<div key={i}>
					{a.nome}
					{a.tipo ? ` (${a.tipo})` : ""}
				</div>
			))}
		</>
	);
}

function Situacao({ projeto }: { projeto: Dados }) {
	return (
		<>
			<Tag tone="phos" className="pg-tag--wrap">{projeto.situacao || "Desconhecida"}</Tag>
			{projeto.despacho ? <div style={{ marginTop: 6 }}>{projeto.despacho}</div> : null}
			{projeto.regime ? <div className="pg-label" style={{ marginTop: 6 }}>Regime: {projeto.regime}</div> : null}
		</>
	);
}

function CartaoPrincipal({ projeto, idProjeto, aiLoading, aiSummary, onResumir }: { projeto: Dados; idProjeto: string; aiLoading: boolean; aiSummary: string | null; onResumir: () => void }) {
	return (
		<Panel title="Leitura analítica" sub={`Projeto ${projeto.titulo ?? idProjeto}`}>
			<div>
				<h3 style={{ font: "700 var(--pg-t-md)/1.3 var(--pg-font)", color: "var(--pg-ink-1)" }}>{projeto.titulo}</h3>
				{projeto.data_apresentacao ? <p className="pg-label" style={{ marginTop: 6 }}>Apresentado em {dataBR(projeto.data_apresentacao)}</p> : null}
			</div>
			<Kv
				items={[
					{ key: "autores", label: "Autores", value: <Autoria autores={projeto.autores_json} /> },
					{ key: "sit", label: "Situação", value: <Situacao projeto={projeto} /> },
				]}
			/>
			<div className="pg-stack">
				<Label>Ementa oficial</Label>
				<p style={{ color: "var(--pg-ink-1)", fontSize: "var(--pg-t-md)" }}>{projeto.ementa}</p>
			</div>
			<div className="pg-chiprow">
				<button type="button" className="pg-btn pg-btn--primary" disabled={aiLoading || Boolean(aiSummary)} onClick={onResumir}>
					{aiLoading ? <Spinner /> : <PixelIcon name="bot" size={14} />}
					{aiSummary ? "Resumo gerado" : aiLoading ? "Decodificando…" : "Decodificar com IA"}
				</button>
				{projeto.texto_integral ? (
					<a className="pg-btn" href={projeto.texto_integral} target="_blank" rel="noreferrer">
						<PixelIcon name="link" size={14} /> Abrir no site da Câmara
					</a>
				) : null}
			</div>
		</Panel>
	);
}

function ResumoIa({ resumo, motor, copiado, onCopiar }: { resumo: string; motor: string | null; copiado: boolean; onCopiar: () => void }) {
	return (
		<section className="pg-ai">
			<p className="pg-label">&gt; Resumo por IA{motor ? ` · engine ${motor}` : ""} · pode conter erros, confira o texto oficial</p>
			<div dangerouslySetInnerHTML={{ __html: resumo }} />
			<div className="pg-chiprow">
				<button type="button" className="pg-btn" style={{ height: 32 }} onClick={onCopiar}>
					{copiado ? "Copiado" : "Copiar resumo"}
				</button>
			</div>
		</section>
	);
}

function Tramitacoes({ itens }: { itens: Dados[] }) {
	const [todas, setTodas] = useState(false);
	const ordenadas = [...itens].reverse();
	const visiveis = todas ? ordenadas : ordenadas.slice(0, 3);
	return (
		<Panel title="Tramitação" sub="Do mais recente ao mais antigo" flush>
			<div className="pg-timeline">
				{visiveis.map((t, i) => (
					<div key={i}>
						<b>{t.descricaoTramitacao}</b>
						<div className="pg-timeline__meta">
							<span>{dataBR(t.dataHora)}</span>
							<span>Órgão {t.siglaOrgao}</span>
						</div>
						<p>{t.despacho}</p>
					</div>
				))}
			</div>
			{ordenadas.length > 3 ? (
				<div style={{ padding: "0 12px 12px" }}>
					<button type="button" className="pg-btn pg-btn--block" onClick={() => setTodas((v) => !v)}>
						{todas ? "Mostrar menos" : `Carregar mais (${ordenadas.length - 3})`}
					</button>
				</div>
			) : null}
		</Panel>
	);
}

function InteiroTeor({ url }: { url: string }) {
	return (
		<Panel title="Inteiro teor do projeto" sub="Documento oficial" flush>
			<iframe src={url} title="Texto integral do projeto" style={{ width: "100%", height: 720, border: 0, background: "#fff" }} />
		</Panel>
	);
}

function useProjeto(idProjeto: string) {
	const [projeto, setProjeto] = useState<Dados | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	useEffect(() => {
		fetch(`/api/perfil/projeto/${idProjeto}`)
			.then((res) => {
				if (!res.ok) throw new Error("Falha ao buscar projeto.");
				return res.json();
			})
			.then(setProjeto)
			.catch((e: Error) => setError(e.message))
			.finally(() => setLoading(false));
	}, [idProjeto]);
	return { projeto, loading, error };
}

function useResumoIa(idProjeto: string, projeto: Dados | null) {
	const [resumo, setResumo] = useState<string | null>(null);
	const [motor, setMotor] = useState<string | null>(null);
	const [carregando, setCarregando] = useState(false);
	const [erro, setErro] = useState("");
	const [copiado, setCopiado] = useState(false);

	const resumir = async () => {
		setCarregando(true);
		setErro("");
		try {
			const res = await fetch(`/api/perfil/projeto/${idProjeto}/resumo`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ titulo: projeto?.titulo, ementa: projeto?.ementa }),
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				throw new Error(j.error || "Falha na geração do resumo.");
			}
			const json = await res.json();
			setResumo(json.resumo);
			if (json.motor) setMotor(json.motor);
		} catch (e) {
			setErro((e as Error).message);
		} finally {
			setCarregando(false);
		}
	};

	const copiar = () => {
		if (!resumo) return;
		void navigator.clipboard.writeText(resumo);
		setCopiado(true);
		setTimeout(() => setCopiado(false), 2000);
	};

	return { resumo, motor, carregando, erro, copiado, resumir, copiar };
}

function CorpoDoProjeto({ projeto, idProjeto }: { projeto: Dados; idProjeto: string }) {
	const ia = useResumoIa(idProjeto, projeto);
	return (
		<div className="pg-view pg-view--narrow">
			<div className="pg-view__inner" style={{ gap: 16 }}>
				<CartaoPrincipal projeto={projeto} idProjeto={idProjeto} aiLoading={ia.carregando} aiSummary={ia.resumo} onResumir={ia.resumir} />
				{ia.carregando ? (
					<section className="pg-ai">
						<p className="pg-label">&gt; Decodificando com IA…</p>
						<PixelBar value={50} size="sm" label="Decodificando" />
					</section>
				) : null}
				{ia.erro ? <div className="pg-riskbox pg-riskbox--crit"><p>◆ Falha na conexão com a IA: {ia.erro}</p></div> : null}
				{ia.resumo ? <ResumoIa resumo={ia.resumo} motor={ia.motor} copiado={ia.copiado} onCopiar={ia.copiar} /> : null}
				{projeto.tramitacoes_json?.length > 0 ? <Tramitacoes itens={projeto.tramitacoes_json} /> : null}
				{projeto.texto_integral ? <InteiroTeor url={projeto.texto_integral} /> : null}
			</div>
		</div>
	);
}

export default function BillReaderDashboard({ idDeputado, idProjeto }: { idDeputado: string; idProjeto: string }) {
	const router = useRouter();
	const { projeto, loading, error } = useProjeto(idProjeto);
	const perfilHref = `/perfil/deputado/${idDeputado}`;

	let corpo: ReactNode;
	if (loading) {
		corpo = <Estado titulo="Descriptografando projeto de lei"><p className="pg-note"><Spinner /> Carregando…</p></Estado>;
	} else if (error || !projeto) {
		corpo = <Estado titulo="Erro crítico" sub="Não foi possível abrir o projeto" crit><p>◆ {error || "Projeto não encontrado"}</p></Estado>;
	} else {
		corpo = <CorpoDoProjeto projeto={projeto} idProjeto={idProjeto} />;
	}

	return (
		<AppShell
			migalhas={[{ label: "Início", href: "/" }, { label: "Perfil", href: perfilHref }, { label: `Projeto ${projeto?.titulo ?? idProjeto}` }]}
			tituloMobile={{ titulo: projeto?.titulo ?? "Projeto", subtitulo: "Leitura analítica" }}
			voltarHref={perfilHref}
			jobJaVisto={false}
			acoes={
				<button type="button" className="pg-btn" onClick={() => router.push(perfilHref)}>
					<PixelIcon name="back" size={14} /> Voltar ao perfil
				</button>
			}
			status={<span>processamento por IA ativado · resumos podem conter erros</span>}
		>
			{corpo}
		</AppShell>
	);
}
