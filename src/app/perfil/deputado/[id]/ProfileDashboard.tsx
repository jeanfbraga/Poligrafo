"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Panel, Spinner } from "@/components/ds";
import { AcaoInvestigar } from "@/components/investigacao/AcaoInvestigar";
import { useInvestigacao } from "@/components/investigacao/InvestigacaoProvider";
import { jobView } from "@/lib/investigacao/job-view";
import { JobPanel } from "@/components/investigacao/JobPanel";
import { AppShell } from "@/components/layout/AppShell";
import CotaChart from "@/components/perfil/CotaChart";
import GabineteList from "@/components/perfil/GabineteList";
import NavegacaoDeSecoes, { type SecaoNav } from "@/components/perfil/NavegacaoDeSecoes";
import { ResumoPerfil } from "@/components/perfil/ResumoPerfil";
import { resumoDoPerfil } from "@/lib/perfil-resumo";
import LegislativeProduction from "@/components/perfil/LegislativeProduction";
import PerfilPatrimonioCard from "@/components/perfil/PerfilPatrimonioCard";
import ProfileHeader from "@/components/perfil/ProfileHeader";
import { useViewport } from "@/hooks/use-mobile";
import VotingHistory from "@/components/perfil/VotingHistory";
import { type Alvo, urlDossie } from "@/lib/investigacao/alvo";
import { tituloCaso } from "@/lib/texto";

type Params = Record<string, string | string[] | undefined>;
type Dados = Record<string, any>;

export function hasPerfilData(json: Dados | null): boolean {
	if (!json) return false;
	if (json.perfil) return true;
	if (Array.isArray(json.votos) && json.votos.length > 0) return true;
	return Boolean(Array.isArray(json.producao) && json.producao.length > 0);
}

function buildFallbackPerfil(idDeputado: string, sp?: Params) {
	const str = (v: unknown, padrao?: string) => (typeof v === "string" ? v : padrao);
	const nome = str(sp?.nome);
	return {
		id_deputado: idDeputado,
		nome_civil: nome,
		nome_eleitoral: nome,
		partido: str(sp?.partido, "N/A"),
		uf: str(sp?.uf, "BR"),
		frentes_parlamentares: [],
		comissoes: [],
		profissoes: [],
	};
}

/** Completa nome/partido/UF a partir da URL quando o banco ainda não tem a ficha. */
export function enrichPerfilFallback(json: Dados, idDeputado: string, sp?: Params) {
	if (!sp?.nome) return;
	const nome = typeof sp.nome === "string" ? sp.nome : "";
	if (!json.perfil) {
		json.perfil = buildFallbackPerfil(idDeputado, sp);
		return;
	}
	if (!json.perfil.nome_civil && !json.perfil.nome_eleitoral) {
		json.perfil.nome_civil = nome;
		json.perfil.nome_eleitoral = nome;
	}
}

const SECOES: SecaoNav[] = [
	{ id: "perfil", rotulo: "Perfil" },
	{ id: "invest", rotulo: "Investigação" },
	{ id: "patrimonio", rotulo: "Patrimônio" },
	{ id: "votos", rotulo: "Votos" },
	{ id: "producao", rotulo: "Produção" },
	{ id: "cota", rotulo: "Cota" },
	{ id: "gabinete", rotulo: "Gabinete" },
];

/** Só as seções que a página realmente mostra (ex.: sem patrimônio se não há dado do TSE). */
export function secoesVisiveis(data: Dados, jobAtivo = false): SecaoNav[] {
	const presente: Record<string, boolean> = { patrimonio: Boolean(data.tse), perfil: Boolean(data.perfil), invest: jobAtivo };
	return SECOES.filter((s) => presente[s.id] ?? true);
}

function Carregando() {
	return (
		<div className="pg-view">
			<div className="pg-view__inner">
				<Panel title="Acessando base de dados federal" sub="Decriptando histórico parlamentar">
					<p className="pg-note">
						<Spinner /> Consultando o perfil do parlamentar…
					</p>
				</Panel>
			</div>
		</div>
	);
}

function Falha({ mensagem }: { mensagem: string }) {
	return (
		<div className="pg-view">
			<div className="pg-view__inner">
				<Panel title="Acesso negado / erro" sub="Não foi possível carregar o perfil">
					<div className="pg-riskbox pg-riskbox--crit">
						<p>◆ {mensagem}</p>
					</div>
				</Panel>
			</div>
		</div>
	);
}

/** Carrega /api/perfil/deputado/[id] (com fallback pelos dados da URL). */
function usePerfil(idDeputado: string, searchParams?: Params) {
	const [data, setData] = useState<Dados | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function carregar() {
			try {
				const res = await fetch(`/api/perfil/deputado/${idDeputado}`);
				if (!res.ok) throw new Error("Falha ao buscar dados do perfil.");
				const json = await res.json();
				if (!hasPerfilData(json) && !searchParams?.nome) {
					throw new Error(`Nenhum dado encontrado para o parlamentar (ID: ${idDeputado}). O banco de dados pode ainda não ter sido sincronizado.`);
				}
				enrichPerfilFallback(json, idDeputado, searchParams);
				setData(json);
			} catch (e) {
				setError((e as Error).message);
			} finally {
				setLoading(false);
			}
		}
		void carregar();
	}, [idDeputado, searchParams]);

	return { data, loading, error };
}

interface SecoesProps {
	data: Dados;
	idDeputado: string;
	foto?: string;
	job: ReactNode;
	/** Botão principal do topo (Investigar / andamento / abrir dossiê). */
	acao: ReactNode;
	/** Há investigação (em andamento, concluída, interrompida ou com erro) para este perfil. */
	jobAtivo: boolean;
	mobile: boolean;
}

function SecoesDoPerfil({ data, idDeputado, foto, job, acao, jobAtivo, mobile }: SecoesProps) {
	const patrimonio = data.tse ? <PerfilPatrimonioCard tse={data.tse} /> : null;
	const votos = <VotingHistory votos={data.votos} idDeputado={idDeputado} perfil={data.perfil} />;
	const producao = <LegislativeProduction producao={data.producao} idDeputado={idDeputado} perfil={data.perfil} />;
	const cota = <CotaChart cota={data.cota} />;
	const gabinete = <GabineteList servidores={data.servidores} perfil={data.perfil} />;
	const secoes = useMemo(() => secoesVisiveis(data, jobAtivo), [data, jobAtivo]);
	const resumo = useMemo(() => resumoDoPerfil(data), [data]);
	const header = data.perfil ? (
		<ProfileHeader perfil={data.perfil} idDeputado={idDeputado} fotoUrl={foto} acoes={acao} resumo={<ResumoPerfil itens={resumo} />} />
	) : null;
	return (
		<div className="pg-perfil">
			<NavegacaoDeSecoes secoes={secoes} />
			<div className="pg-view">
				<div className="pg-view__inner">
					{header}
					{job}
					{mobile ? (
						<>
							{patrimonio}
							{votos}
							{producao}
							{cota}
							{gabinete}
						</>
					) : (
						<>
							<div className="pg-cols2">
								<div className="pg-stack" style={{ gap: 16 }}>
									{patrimonio}
									{cota}
								</div>
								<div className="pg-stack" style={{ gap: 16 }}>
									{votos}
									{producao}
								</div>
							</div>
							{gabinete}
						</>
					)}
				</div>
			</div>
		</div>
	);
}

/** Nome exibido: eleitoral → civil → nome da URL → "Perfil". */
function nomeDoPerfil(data: Dados | null, searchParams?: Params): string {
	const daUrl = typeof searchParams?.nome === "string" ? searchParams.nome : "Perfil";
	return tituloCaso(data?.perfil?.nome_eleitoral || data?.perfil?.nome_civil || daUrl);
}

/**
 * O painel de Investigação só existe quando há o que acompanhar (andamento, resultado, falha);
 * ocioso, a explicação fica na dica do botão do topo.
 */
function useJobAtivo(alvo: Alvo): boolean {
	const inv = useInvestigacao();
	return jobView(inv.state, alvo, 0).estado !== "idle";
}

function escolherCorpo(estado: { loading: boolean; error: string | null; data: Dados | null }, secoes: () => ReactNode): ReactNode {
	if (estado.loading) return <Carregando />;
	if (estado.error || !estado.data) return <Falha mensagem={estado.error || "Falha desconhecida ao buscar os dados."} />;
	return secoes();
}

export default function ProfileDashboard({ idDeputado, searchParams }: { idDeputado: string; searchParams?: Params }) {
	const router = useRouter();
	const vp = useViewport();
	const { data, loading, error } = usePerfil(idDeputado, searchParams);

	const nome = nomeDoPerfil(data, searchParams);
	const alvo: Alvo = useMemo(() => ({ nome, ref: `FEDERAL:CAMARA:${idDeputado}`, uf: "FEDERAL" }), [nome, idDeputado]);
	const jobAtivo = useJobAtivo(alvo);
	if (!vp) return null;
	const mobile = vp === "mobile";
	const foto = typeof searchParams?.foto === "string" ? searchParams.foto : undefined;
	const abrirDossie = () => router.push(urlDossie(alvo));
	const job = jobAtivo ? <JobPanel alvo={alvo} mobile={mobile} onAbrir={abrirDossie} acaoNoTopo /> : null;
	const acao = <AcaoInvestigar alvo={alvo} onAbrir={abrirDossie} />;

	const corpo = escolherCorpo({ loading, error, data }, () => (
		<SecoesDoPerfil data={data as Dados} idDeputado={idDeputado} foto={foto} job={job} acao={acao} jobAtivo={jobAtivo} mobile={mobile} />
	));

	return (
		<AppShell
			migalhas={[{ label: "Início", href: "/" }, { label: `Perfil · ${nome}` }]}
			tituloMobile={{ titulo: nome, subtitulo: "Perfil" }}
			voltarHref="/"
			jobJaVisto
			status={<span>origem: dados abertos da câmara · acesso: público</span>}
		>
			{corpo}
		</AppShell>
	);
}
