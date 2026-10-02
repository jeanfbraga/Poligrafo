"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Corners, Kv, KStats, Label, Panel, Spinner, Tag } from "@/components/ds";
import { Paginador, usePagina } from "@/components/ds/Paginador";
import { AppShell } from "@/components/layout/AppShell";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useViewport } from "@/hooks/use-mobile";
import { agruparDespesasPorAnoMes, cpfParcial, type LancamentoCpgf, percentualSigiloso, rotuloMes } from "@/lib/cpgf";
import { brl, iniciais } from "@/lib/format";

type Dados = Record<string, any>;
const ITENS_POR_PAGINA = 50;

function Foto({ perfil, tse }: { perfil: Dados; tse: Dados }) {
	const [falhou, setFalhou] = useState(false);
	const url = tse?.fotoUrl
		? `/api/proxy-image?url=${encodeURIComponent(tse.fotoUrl)}&raw=true`
		: `/api/proxy-image?url=${encodeURIComponent(`https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/${tse?.idEleicao}/${tse?.idTse}/${tse?.idUe}`)}&raw=true`;
	return (
		<div className="pg-photo">
			<Corners />
			{tse?.idTse && !falhou ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img src={url} alt={perfil.nome} onError={() => setFalhou(true)} />
			) : (
				<>
					<span className="pg-photo__initials">{iniciais(perfil.nome ?? "")}</span>
					<small className="pg-photo__none">SEM FOTO</small>
				</>
			)}
		</div>
	);
}

function Identidade({ perfil, tse }: { perfil: Dados; tse: Dados }) {
	return (
		<Panel title="Perfil" sub="Presidência da República">
			<div className="pg-ficha" style={{ padding: 0 }}>
				<Foto perfil={perfil} tse={tse} />
				<div className="pg-stack" style={{ minWidth: 0 }}>
					<h1 style={{ font: "700 var(--pg-t-lg)/1.2 var(--pg-font)", textTransform: "uppercase", color: "var(--pg-ink-1)", textShadow: "var(--pg-glow)" }}>{perfil.nome}</h1>
					<div className="pg-chiprow">
						<Tag tone="phos">{perfil.cargo}</Tag>
					</div>
				</div>
			</div>
			<Kv
				items={[
					{ key: "periodo", label: "Período", value: perfil.mandato },
					{ key: "doc", label: "Documento", value: <span className="pg-code">{cpfParcial(tse?.cpf)}</span> },
				]}
			/>
		</Panel>
	);
}

function Patrimonio({ tse }: { tse: Dados }) {
	const bens: Dados[] = tse?.bens || [];
	return (
		<Panel title="Patrimônio declarado" sub={`Fonte: TSE ${tse?.eleicao ?? ""}`}>
			<div className="pg-hero-n">{brl(tse?.patrimonio || 0)}</div>
			{bens.map((b, i) => (
				<div key={i} className="pg-lrow" style={{ gridTemplateColumns: "1fr auto", paddingInline: 0, minHeight: 44 }}>
					<div className="pg-lrow__main">
						<b style={{ whiteSpace: "normal" }} title={b.descricao}>{b.descricao}</b>
					</div>
					<span className="pg-lrow__meta" style={{ color: "var(--pg-ink-1)" }}>{brl(b.valor)}</span>
				</div>
			))}
		</Panel>
	);
}

function Lancamentos({ itens, onAbrir }: { itens: LancamentoCpgf[]; onAbrir: (l: LancamentoCpgf) => void }) {
	const pag = usePagina(itens, ITENS_POR_PAGINA);
	return (
		<div className="pg-acc__body">
			{pag.fatia.map((l, i) => {
				const sigiloso = !l.nomeFornecedor;
				return (
					<button key={i} type="button" className={`pg-acc__tx${sigiloso ? " pg-acc__tx--sig" : ""}`} onClick={() => onAbrir(l)}>
						<b>
							{sigiloso ? "◆ " : ""}
							{l.nomeFornecedor ? l.nomeFornecedor.toLowerCase() : "SIGILOSO"}
						</b>
						<span>{l.data?.substring(0, 5)}</span>
						<span className="pg-acc__val">{brl(l.valor)}</span>
					</button>
				);
			})}
			<Paginador p={pag} />
		</div>
	);
}

function GrupoMes({ chave, mes, itens, aberto, onAlternar, onAbrir }: { chave: string; mes: string; itens: LancamentoCpgf[]; aberto: boolean; onAlternar: (k: string) => void; onAbrir: (l: LancamentoCpgf) => void }) {
	const total = itens.reduce((acc, i) => acc + i.valor, 0);
	return (
		<div className="pg-acc">
			<button type="button" className="pg-acc__head" aria-expanded={aberto} onClick={() => onAlternar(chave)}>
				<PixelIcon name={aberto ? "chevd" : "chev"} size={14} />
				<b>
					{rotuloMes(mes)} · {itens.length} itens
				</b>
				<span className="pg-label">{brl(total)}</span>
			</button>
			{aberto ? <Lancamentos itens={itens} onAbrir={onAbrir} /> : null}
		</div>
	);
}

function Extrato({ cpgf, onAbrir }: { cpgf: Dados; onAbrir: (l: LancamentoCpgf) => void }) {
	const [aberto, setAberto] = useState<string | null>(null);
	const pct = percentualSigiloso(cpgf.countSigiloso, cpgf.countTotal);
	const porAno = agruparDespesasPorAnoMes(cpgf?.topDespesas);
	const anos = Object.keys(porAno).sort((a, b) => b.localeCompare(a));
	const alternar = (k: string) => setAberto((atual) => (atual === k ? null : k));

	return (
		<Panel title="Cartão corporativo (CPGF)" sub="Extrato por período" flush>
			<div className="pg-panel__body">
				<KStats
					cols={2}
					items={[
						{ key: "tot", label: "Gasto da amostra", value: brl(cpgf.totalValor) },
						{ key: "sig", label: "Valor sigiloso", value: brl(cpgf.totalSigiloso), tone: "crit" },
						{ key: "n", label: "Lançamentos", value: String(cpgf.countTotal) },
						{ key: "pct", label: "Ocultação", value: `${String(pct).replace(".", ",")}%`, tone: "crit" },
					]}
				/>
				<div className="pg-stack">
					<div className="pg-opac" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Grau de opacidade do gasto">
						<i style={{ width: `${pct}%` }} />
					</div>
					<p className="pg-label" style={{ textAlign: "right" }}>Grau de opacidade do gasto</p>
				</div>
			</div>
			{anos.length === 0 ? <p className="pg-empty">Nenhum dado aberto retornado na amostragem.</p> : null}
			{anos.map((ano) => (
				<div key={ano}>
					<div className="pg-acc__head" style={{ cursor: "default", gridTemplateColumns: "1fr" }}>
						<b>{ano}</b>
					</div>
					{Object.keys(porAno[ano]).sort((a, b) => b.localeCompare(a)).map((mes) => (
						<GrupoMes key={`${ano}-${mes}`} chave={`${ano}-${mes}`} mes={mes} itens={porAno[ano][mes]} aberto={aberto === `${ano}-${mes}`} onAlternar={alternar} onAbrir={onAbrir} />
					))}
				</div>
			))}
		</Panel>
	);
}

function DetalheLancamento({ l }: { l: LancamentoCpgf }) {
	const sigiloso = !l.nomeFornecedor;
	return (
		<div className="pg-insp__scroll" style={{ padding: 16 }}>
			<div>
				<Label>Lançamento CPGF</Label>
				<h3 style={{ color: sigiloso ? "var(--pg-crit)" : "var(--pg-ink-1)", textTransform: "uppercase" }}>
					{sigiloso ? "◆ SIGILOSO" : l.nomeFornecedor}
				</h3>
				<p className="pg-insp__subt">Cartão de pagamento do governo federal</p>
			</div>
			{sigiloso ? (
				<div className="pg-riskbox pg-riskbox--crit">
					<p>&gt; Lançamento sob sigilo: favorecido e finalidade não divulgados.</p>
				</div>
			) : null}
			<Kv
				items={[
					{ key: "valor", label: "Valor", value: brl(l.valor), big: true },
					{ key: "data", label: "Data", value: l.data ?? "—" },
					{ key: "cnpj", label: "CNPJ/CPF", value: <span className="pg-code">{l.cnpj || "N/A"}</span> },
				]}
			/>
		</div>
	);
}

function PainelLancamento({ l, onFechar, mobile }: { l: LancamentoCpgf | null; onFechar: () => void; mobile: boolean }) {
	const conteudo = l ? <DetalheLancamento l={l} /> : null;
	if (mobile) {
		return (
			<Drawer open={Boolean(l)} onOpenChange={(o) => !o && onFechar()}>
				<DrawerContent>
					<DrawerTitle className="sr-only">Detalhes da transação</DrawerTitle>
					<DrawerDescription className="sr-only">Lançamento do cartão de pagamento</DrawerDescription>
					<div className="pg-drawer__body">{conteudo}</div>
				</DrawerContent>
			</Drawer>
		);
	}
	return (
		<Sheet open={Boolean(l)} onOpenChange={(o) => !o && onFechar()}>
			<SheetContent>
				<SheetTitle className="sr-only">Detalhes da transação</SheetTitle>
				<SheetDescription className="sr-only">Lançamento do cartão de pagamento</SheetDescription>
				{conteudo}
			</SheetContent>
		</Sheet>
	);
}

function usePresidente(id: string) {
	const [data, setData] = useState<Dados | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		fetch(`/api/perfil/presidente/${id}`)
			.then((res) => {
				if (!res.ok) throw new Error("Perfil não encontrado ou erro na API");
				return res.json();
			})
			.then(setData)
			.catch((e: Error) => setError(e.message))
			.finally(() => setLoading(false));
	}, [id]);
	return { data, loading, error };
}

function Corpo({ data, onAbrir, mobile }: { data: Dados; onAbrir: (l: LancamentoCpgf) => void; mobile: boolean }) {
	const { perfil, tse, cpgf } = data;
	const lateral = (
		<div className="pg-stack" style={{ gap: 16 }}>
			<Identidade perfil={perfil} tse={tse} />
			<Patrimonio tse={tse} />
		</div>
	);
	const extrato = <Extrato cpgf={cpgf} onAbrir={onAbrir} />;
	return (
		<div className="pg-view">
			<div className="pg-view__inner" style={{ gap: 16 }}>
				{mobile ? (
					<>
						{lateral}
						{extrato}
					</>
				) : (
					<div className="pg-cols13">
						{lateral}
						{extrato}
					</div>
				)}
			</div>
		</div>
	);
}

export default function PresidentePerfilPage(props: { params: Promise<{ id: string }> }) {
	const { id } = use(props.params);
	const router = useRouter();
	const vp = useViewport();
	const { data, loading, error } = usePresidente(id);
	const [lancamento, setLancamento] = useState<LancamentoCpgf | null>(null);
	if (!vp) return null;
	const mobile = vp === "mobile";
	const nome: string = data?.perfil?.nome ?? "Presidente";

	let corpo;
	if (loading) {
		corpo = (
			<div className="pg-view">
				<div className="pg-view__inner">
					<Panel title="Acessando base de dados federal" sub="Decriptando extratos CPGF">
						<p className="pg-note"><Spinner /> Consultando…</p>
					</Panel>
				</div>
			</div>
		);
	} else if (error || !data) {
		corpo = (
			<div className="pg-view">
				<div className="pg-view__inner">
					<Panel title="Acesso negado / erro">
						<div className="pg-riskbox pg-riskbox--crit"><p>◆ {error}</p></div>
						<button type="button" className="pg-btn" onClick={() => router.push("/")}>Voltar ao início</button>
					</Panel>
				</div>
			</div>
		);
	} else corpo = <Corpo data={data} onAbrir={setLancamento} mobile={mobile} />;

	return (
		<AppShell
			migalhas={[{ label: "Início", href: "/" }, { label: `Presidência · ${nome}` }]}
			tituloMobile={{ titulo: nome, subtitulo: "Presidência" }}
			voltarHref="/"
			status={<span>origem: portal da transparência + TSE · acesso: público</span>}
		>
			{corpo}
			<PainelLancamento l={lancamento} onFechar={() => setLancamento(null)} mobile={mobile} />
		</AppShell>
	);
}
