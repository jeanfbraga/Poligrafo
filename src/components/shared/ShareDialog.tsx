"use client";

import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { toPng } from "html-to-image";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import React, { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";

export interface ShareData {
	politicoNome: string;
	politicoCargo: string;
	politicoUf: string;
	politicoPartido?: string;
	politicoFoto?: string;
	achadoTipo: string;
	achadoTitulo: string;
	achadoValor?: number;
	achadoScore?: number;
	achadoData?: string;
	achadoMotivo?: string;
	achadoAlerta?: string;
	achadoFonteUrl?: string;
	isFantasma?: boolean;
}

interface ShareDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	data: ShareData | null;
	isMobile: boolean;
}

function getScoreLevel(score = 0, isFantasma = false): "critico" | "atencao" | "normal" {
	if (score >= 85 || isFantasma) return "critico";
	if (score >= 60) return "atencao";
	return "normal";
}

function getCardTheme(score = 0, isFantasma = false) {
	const level = getScoreLevel(score, isFantasma);
	if (level === "critico") {
		return {
			cardBorder: "border-pg-crit shadow-[inset_0_0_100px_rgba(239,68,68,0.1)]",
			badge: "bg-pg-crit/10 text-pg-crit border border-pg-crit",
			text: "text-pg-crit",
			valueText: "text-pg-crit",
			motivoBox: "border-pg-crit bg-pg-crit/10",
			motivoText: "text-pg-crit",
		};
	}
	if (level === "atencao") {
		return {
			cardBorder: "border-pg-warn shadow-[inset_0_0_100px_rgba(234,179,8,0.1)]",
			badge: "bg-pg-warn/10 text-pg-warn border border-pg-warn",
			text: "text-pg-warn",
			valueText: "text-pg-warn",
			motivoBox: "border-pg-warn bg-pg-warn/10",
			motivoText: "text-pg-warn",
		};
	}
	return {
		cardBorder: "border-pg-line-2",
		badge: "bg-pg-bg-2 text-pg-ink-2 border border-pg-line-2",
		text: "text-pg-ink-2",
		valueText: "text-pg-ink-2",
		motivoBox: "border-pg-line-2 bg-pg-bg-2",
		motivoText: "text-pg-ink-2",
	};
}

function getSocialShareUrl(platform: "whatsapp" | "telegram" | "twitter", data: ShareData): string {
	const valor = data.achadoValor?.toLocaleString("pt-BR") || "0";
	const text = `🚨 ALERTA POLÍGRAFO: Verifiquei o dossiê de ${data.politicoNome} e encontrei um registro suspeito de ${data.achadoTipo} no valor de R$ ${valor}.\n\nFaça você também a sua auditoria em: https://poligrafo.app.br`;
	const encoded = encodeURIComponent(text);

	if (platform === "whatsapp") {
		return `https://api.whatsapp.com/send?text=${encoded}`;
	}
	if (platform === "telegram") {
		return `https://t.me/share/url?url=${encodeURIComponent("https://poligrafo.app.br")}&text=${encoded}`;
	}
	return `https://twitter.com/intent/tweet?text=${encoded}`;
}

async function fetchFotoProxy(url: string): Promise<string> {
	try {
		const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(url)}`);
		if (res.ok) {
			const json = await res.json();
			return json.base64 || url;
		}
		return url;
	} catch (e) {
		console.error("Falha ao usar proxy de imagem:", e);
		return url;
	}
}

interface HiddenShareCardProps {
	data: ShareData;
	fotoBase64?: string | null;
}

const HiddenShareCard = React.forwardRef<HTMLDivElement, HiddenShareCardProps>(
	({ data, fotoBase64 }, ref) => {
		const theme = getCardTheme(data.achadoScore, data.isFantasma);
		const fotoUrl = fotoBase64 || data.politicoFoto;

		return (
			<div
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					opacity: 0,
					pointerEvents: "none",
					zIndex: -9999,
				}}
			>
				<div
					ref={ref}
					className="w-270 h-480 bg-pg-bg p-12 font-mono flex flex-col relative overflow-hidden"
					style={{
						backgroundImage: "radial-gradient(circle, #002200 2px, transparent 2px)",
						backgroundSize: "40px 40px",
					}}
				>
					<div className="flex items-center gap-4 mb-16 pb-8 border-b-4 border-pg-phos">
						<PixelIcon name="term" size={20} className="w-16 h-16 text-pg-phos" />
						<span className="text-5xl font-bold tracking-[0.3em] text-pg-phos uppercase">
							POLÍGRAFO
						</span>
						<Badge
							variant="outline"
							className="text-2xl py-2 px-4 bg-pg-bg-3 text-pg-ink-1 border-pg-phos rounded-none ml-4"
						>
							IA_OSINT
						</Badge>
					</div>

					<div className="flex items-center gap-10 mb-16 bg-pg-bg-1 p-10 border border-pg-phos shadow-[0_0_50px_rgba(34,197,94,0.15)]">
						{fotoUrl ? (
							<img
								src={fotoUrl}
								alt="Foto"
								className="w-48 h-48 object-cover border-2 border-pg-phos shrink-0 filter grayscale contrast-125"
							/>
						) : (
							<div className="w-48 h-48 border-2 border-pg-phos flex items-center justify-center bg-pg-bg-2 shrink-0">
								<span className="text-6xl text-pg-ink-3">?</span>
							</div>
						)}
						<div className="flex flex-col gap-4 w-full">
							<div className="flex gap-4">
								<Badge
									variant="outline"
									className="text-2xl uppercase bg-pg-bg-3 text-pg-phos border-pg-phos rounded-none p-3"
								>
									{data.politicoCargo}
								</Badge>
								<Badge
									variant="outline"
									className="text-2xl uppercase bg-pg-bg-3 text-pg-phos border-pg-phos rounded-none p-3"
								>
									{data.politicoUf}
								</Badge>
								{data.politicoPartido && (
									<Badge
										variant="outline"
										className="text-2xl uppercase bg-pg-bg-3 text-pg-phos border-pg-phos rounded-none p-3"
									>
										{data.politicoPartido}
									</Badge>
								)}
							</div>
							<h1 className="text-6xl font-bold uppercase tracking-wider text-pg-ink-1 wrap-break-word">
								{data.politicoNome}
							</h1>
						</div>
					</div>

					<div className="flex-1 flex flex-col gap-6 relative z-10">
						<div className="text-3xl text-pg-ink-2 font-bold uppercase tracking-widest mb-2 flex items-center gap-4">
							<span>&gt; INTERCEPTAÇÃO DE DADOS PÚBLICOS</span>
							<div className="flex-1 h-0.5 bg-pg-bg-3" />
						</div>

						<div className={`p-12 border-l-12 bg-pg-bg-1 shadow-2xl relative overflow-hidden ${theme.cardBorder}`}>
							<div className={`text-2xl font-bold mb-6 inline-block px-4 py-2 ${theme.badge}`}>
								[{data.achadoTipo}]
							</div>

							<h2 className={`text-5xl font-bold uppercase tracking-wide leading-tight mb-8 ${theme.text}`}>
								{data.achadoTitulo}
							</h2>

							{data.achadoValor !== undefined && (
								<div className="mb-10">
									<span className="text-3xl uppercase font-bold opacity-60 block mb-2">
										Valor Associado
									</span>
									<span className={`text-6xl font-bold tracking-widest ${theme.valueText}`}>
										R$ {data.achadoValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
									</span>
								</div>
							)}

							{data.achadoData && (
								<div className="text-3xl text-pg-ink-2 font-bold mb-10">
									DATA: {data.achadoData}
								</div>
							)}

							{(data.achadoMotivo || data.achadoAlerta) && (
								<div className={`mt-8 p-8 border-2 border-dashed ${theme.motivoBox}`}>
									<div className={`text-2xl font-bold uppercase mb-4 ${theme.motivoText}`}>
										ANÁLISE DE RISCO E ALERTAS
									</div>
									<p className={`text-3xl leading-relaxed opacity-90 ${theme.text}`}>
										&gt; {data.achadoMotivo || data.achadoAlerta}
									</p>
								</div>
							)}
						</div>
					</div>

					<div className="mt-auto pt-10 border-t-4 border-pg-line-2 flex flex-col gap-4 text-pg-ink-3 uppercase font-bold tracking-[0.2em]">
						<div className="flex justify-between items-center text-3xl">
							<span>FONTE: DADOS ABERTOS DO GOVERNO FEDERAL</span>
							<span>POLIGRAFO.APP.BR</span>
						</div>
						{data.achadoFonteUrl && (
							<div className="text-xl opacity-70 truncate max-w-full font-normal tracking-normal normal-case">
								Evidência: {data.achadoFonteUrl}
							</div>
						)}
					</div>
				</div>
			</div>
		);
	},
);
HiddenShareCard.displayName = "HiddenShareCard";

const ShareActions = ({
	onDownload,
	onShare,
}: {
	onDownload: () => void;
	onShare: (platform: "whatsapp" | "telegram" | "twitter") => void;
}) => (
	<div className="flex flex-col gap-4 w-full">
		<Button
			onClick={onDownload}
			className="w-full bg-pg-phos hover:bg-pg-phos text-black font-bold tracking-wide rounded-none border border-pg-phos h-12"
		>
			<PixelIcon name="download" size={16} /> Baixar imagem
		</Button>
		<div className="grid grid-cols-3 gap-2 mt-2">
			<Button
				variant="outline"
				onClick={() => onShare("whatsapp")}
				className="bg-transparent border-pg-line-2 text-pg-phos hover:bg-pg-bg-3 h-10 rounded-none flex items-center justify-center"
			>
				<svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
					<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
				</svg>
			</Button>
			<Button
				variant="outline"
				onClick={() => onShare("telegram")}
				className="bg-transparent border-pg-line-2 text-pg-phos hover:bg-pg-bg-3 h-10 rounded-none flex items-center justify-center"
			>
				<svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
					<path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.148 4.6 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.436z" />
				</svg>
			</Button>
			<Button
				variant="outline"
				onClick={() => onShare("twitter")}
				className="bg-transparent border-pg-line-2 text-pg-phos hover:bg-pg-bg-3 h-10 rounded-none flex items-center justify-center"
			>
				<svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
					<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
				</svg>
			</Button>
		</div>
	</div>
);

export function ShareDialog({
	open,
	onOpenChange,
	data,
	isMobile,
}: ShareDialogProps) {
	const hiddenRef = useRef<HTMLDivElement>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [fotoBase64, setFotoBase64] = useState<string | null | undefined>(undefined);

	React.useEffect(() => {
		let active = true;
		if (open && data) {
			setIsGenerating(true);
			if (data.politicoFoto) {
				fetchFotoProxy(data.politicoFoto).then((foto) => {
					if (active) setFotoBase64(foto);
				});
			} else {
				setFotoBase64(null);
			}
		} else if (!open) {
			setFotoBase64(undefined);
			setPreviewUrl(null);
		}
		return () => {
			active = false;
		};
	}, [open, data]);

	React.useEffect(() => {
		if (open && data && hiddenRef.current && fotoBase64 !== undefined) {
			const generateImage = async () => {
				try {
					await new Promise((resolve) => setTimeout(resolve, 400));
					const dataUrl = await toPng(hiddenRef.current!, {
						quality: 1,
						pixelRatio: 2,
						cacheBust: true,
						skipFonts: true,
						style: { display: "flex" },
					});
					setPreviewUrl(dataUrl);
				} catch (err: any) {
					console.error("Erro gerando imagem:", err);
					toast.error(
						"Falha ao gerar imagem para compartilhamento. Bloqueio de recursos externos detectado.",
					);
				} finally {
					setIsGenerating(false);
				}
			};
			generateImage();
		}
	}, [open, data, fotoBase64]);

	const handleDownload = () => {
		if (!previewUrl || !data) return;
		const a = document.createElement("a");
		a.href = previewUrl;
		a.download = `poligrafo_alerta_${data.politicoNome.replace(/\s+/g, "_")}.png`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	};

	const handleShareSocial = (platform: "whatsapp" | "telegram" | "twitter") => {
		if (!previewUrl || !data) return;
		const url = getSocialShareUrl(platform, data);
		window.open(url, "_blank");
		toast.info("Lembre-se de anexar a imagem baixada na sua postagem!");
	};

	if (isMobile) {
		return (
			<>
				{data && <HiddenShareCard ref={hiddenRef} data={data} fotoBase64={fotoBase64} />}
				<Sheet open={open} onOpenChange={onOpenChange}>
					<SheetContent
						side="bottom"
						className="bg-pg-bg border-t-2 border-pg-phos font-mono p-6"
					>
						<SheetHeader className="mb-6 text-center">
							<VisuallyHidden>
								<SheetTitle>Compartilhar</SheetTitle>
							</VisuallyHidden>
							<h2 className="text-sm font-bold tracking-wide text-pg-ink-1 mb-2">
								Distribuição de Dados
							</h2>
							<p className="text-xs text-pg-ink-3 leading-relaxed text-center">
								Baixe a imagem gerada ou publique em suas redes. A imagem é
								renderizada com base em registros públicos inalteráveis.
							</p>
						</SheetHeader>

						<div className="flex flex-col items-center gap-6">
							{isGenerating ? (
								<div className="h-75 w-full flex items-center justify-center border border-dashed border-pg-line-2">
									<span className="text-pg-phos animate-pulse text-xs uppercase tracking-widest">
										Processando Imagem...
									</span>
								</div>
							) : previewUrl ? (
								<img
									src={previewUrl}
									alt="Preview"
									className="max-h-75 object-contain border border-pg-phos shadow-lg"
								/>
							) : null}

							<ShareActions onDownload={handleDownload} onShare={handleShareSocial} />
						</div>
					</SheetContent>
				</Sheet>
			</>
		);
	}

	return (
		<>
			{data && <HiddenShareCard ref={hiddenRef} data={data} fotoBase64={fotoBase64} />}
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="bg-pg-bg border border-pg-phos font-mono text-pg-phos max-w-4xl p-0 overflow-hidden shadow-[0_0_50px_rgba(34,197,94,0.15)] rounded-none">
					<VisuallyHidden>
						<DialogTitle>Compartilhar Evidência</DialogTitle>
						<DialogDescription>
							Janela para compartilhar os achados em formato de imagem.
						</DialogDescription>
					</VisuallyHidden>
					<div className="flex h-150">
						<div
							className="w-1/2 bg-pg-bg border-r border-pg-line-2 p-6 flex flex-col relative items-center justify-center"
							style={{
								backgroundImage: "radial-gradient(circle, #002200 1px, transparent 1px)",
								backgroundSize: "20px 20px",
							}}
						>
							{isGenerating ? (
								<span className="text-pg-phos animate-pulse text-xs uppercase tracking-widest text-center">
									RENDERIZANDO_ASSET...
									<br />
									[||||||||||]
								</span>
							) : previewUrl ? (
								<img
									src={previewUrl}
									alt="Preview"
									className="h-full w-auto object-contain border border-pg-phos"
								/>
							) : null}
						</div>

						<div className="w-1/2 p-8 flex flex-col">
							<div className="flex justify-between items-start mb-8">
								<div>
									<h2 className="text-sm font-bold tracking-wide text-pg-ink-1 mb-2">
										Distribuição de Dados
									</h2>
									<p className="text-xs text-pg-ink-3 leading-relaxed">
										Baixe a imagem gerada ou publique em suas redes. A imagem é
										renderizada com base em registros públicos inalteráveis.
									</p>
								</div>
								<button
									onClick={() => onOpenChange(false)}
									className="text-pg-phos hover:text-pg-ink-1 transition-colors"
								>
									<PixelIcon name="x" size={16} />
								</button>
							</div>

							<div className="mt-auto">
								<ShareActions onDownload={handleDownload} onShare={handleShareSocial} />
							</div>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
