"use client";

import { Search, User } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import congressoIndex from "@/services/integrations/data/congresso-index.json";

export interface Alcada {
	sigla: string;
	nome: string;
}

interface SearchBarProps {
	searchTerm: string;
	setSearchTerm: (value: string) => void;
	selectedUf: string;
	setSelectedUf: (value: string) => void;
	onSearch: (refOverride?: string, nomeOverride?: string) => void;
	onCancel?: () => void;
	isLoading?: boolean;
	isMobile?: boolean;
	alcadas: Alcada[];
}

const formatPartido = (p?: string): string => {
	if (!p) return "-";
	const normalized = p.trim().toUpperCase();
	const map: Record<string, string> = {
		SOLIDARIEDADE: "SD",
		REPUBLICANOS: "REP",
		CIDADANIA: "CID",
		PATRIOTA: "PATRI",
		PROGRESSISTAS: "PP",
		PODEMOS: "PODE",
		"UNIÃO BRASIL": "UNIÃO",
	};
	return map[normalized] || normalized;
};

const formatAutoRef = (p: any): string | undefined => {
	if (!p.id) return undefined;
	if (p.casa === "CAMARA") return `FEDERAL:CAMARA:${p.id}`;
	if (p.casa === "SENADO") return `FEDERAL:SENADO:${p.id}`;
	if (p.casa === "GOVERNO_ESTADUAL" || p.casa === "GOVERNADOR")
		return `GOVERNADOR:${p.uf || "BR"}:${p.id || p.nome}`;
	if (p.casa === "PREFEITO" || p.casa === "PREFEITURA")
		return `PREFEITO:${p.uf || "BR"}:${p.id || p.nome}`;
	return undefined;
};

export default function SearchBar({
	searchTerm,
	setSearchTerm,
	selectedUf,
	setSelectedUf,
	onSearch,
	onCancel,
	isLoading = false,
	isMobile = false,
	alcadas,
}: SearchBarProps) {
	const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<
		typeof congressoIndex
	>([]);
	const [autocompleteIdx, setAutocompleteIdx] = useState(-1);
	const [showAutocomplete, setShowAutocomplete] = useState(false);

	const handleSearchTermChange = (value: string) => {
		setSearchTerm(value);
		if (value.trim().length < 2) {
			setAutocompleteSuggestions([]);
			setShowAutocomplete(false);
			return;
		}
		const termoNorm = value
			.trim()
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "");
		const matches = congressoIndex.filter((p: any) => {
			const nameMatch = p.nome
				.toLowerCase()
				.normalize("NFD")
				.replace(/[\u0300-\u036f]/g, "")
				.includes(termoNorm);
			if (!nameMatch) return false;

			// Filtro por Alçada se não for FEDERAL
			if (selectedUf && selectedUf !== "FEDERAL") {
				return p.uf === selectedUf;
			}
			return true;
		});
		const uniqueMatches = Array.from(
			new Map(matches.map((m: any) => [String(m.id || m.nome), m])).values(),
		).slice(0, 8);

		setAutocompleteSuggestions(uniqueMatches);
		setAutocompleteIdx(-1);
		setShowAutocomplete(uniqueMatches.length > 0);
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (showAutocomplete && autocompleteSuggestions.length > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setAutocompleteIdx((prev) =>
					Math.min(prev + 1, autocompleteSuggestions.length - 1),
				);
				return;
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setAutocompleteIdx((prev) => Math.max(prev - 1, -1));
				return;
			} else if (e.key === "Enter" && autocompleteIdx >= 0) {
				e.preventDefault();
				const selected = autocompleteSuggestions[autocompleteIdx];
				setSearchTerm(selected.nome);
				setShowAutocomplete(false);
				setAutocompleteSuggestions([]);
				onSearch(formatAutoRef(selected), selected.nome);
				return;
			} else if (e.key === "Escape") {
				setShowAutocomplete(false);
				return;
			}
		}
		if (e.key === "Enter") {
			setShowAutocomplete(false);
			onSearch();
		}
	};

	if (isMobile) {
		return (
			<div className="w-full relative max-w-sm mx-auto z-20">
				<div className="flex flex-col gap-3 w-full">
					{/* SELETOR DE ALÇADA MOBILE */}
					<div className="relative">
						<select
							value={selectedUf}
							onChange={(e) => setSelectedUf(e.target.value)}
							disabled={isLoading}
							className="w-full h-12 bg-green-950/30 border border-green-500 text-green-400 font-mono text-sm rounded-none appearance-none px-4 pr-10 cursor-pointer focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
							style={{ WebkitAppearance: "none" }}
							aria-label="Selecione a alçada"
						>
							<option value="" disabled className="bg-black text-green-500">
								Selecione a alçada
							</option>
							<option
								value="FEDERAL"
								className="bg-black text-green-400 font-bold"
							>
								🏛  Governo Federal
							</option>
							<option disabled className="bg-black text-green-700">
								──────────────────
							</option>
							<optgroup
								label="Governo Estadual"
								className="bg-black text-green-600 text-xs"
							>
								{alcadas
									.filter((e) => e.sigla !== "FEDERAL" && e.sigla !== "_SEP_")
									.map((uf) => (
										<option
											key={uf.sigla}
											value={uf.sigla}
											className="bg-black text-green-400"
										>
											{uf.sigla} — {uf.nome}
										</option>
									))}
							</optgroup>
						</select>
						{/* Chevron custom */}
						<div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
							<svg
								className="w-4 h-4 text-green-500"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M19 9l-7 7-7-7"
								/>
							</svg>
						</div>
					</div>

					<Input
						placeholder="Nome do político"
						value={searchTerm}
						onChange={(e) => handleSearchTermChange(e.target.value)}
						onKeyDown={handleKeyDown}
						onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
						onFocus={() => {
							if (autocompleteSuggestions.length > 0) setShowAutocomplete(true);
						}}
						disabled={isLoading}
						autoComplete="off"
					/>

				{/* AUTOCOMPLETE DROPDOWN - mobile */}
				{showAutocomplete &&
					autocompleteSuggestions.length > 0 &&
					!isLoading && (
						<div className="w-full max-h-[40vh] overflow-y-auto custom-scrollbar border border-green-500/50 bg-black/95 backdrop-blur-sm z-60 font-mono divide-y divide-green-900/30 shadow-[0_4px_20px_rgba(34,197,94,0.2)] rounded-none">
							{autocompleteSuggestions.map((p: any, i: number) => (
								<button
									key={`${p.casa}-${p.id}-${i}`}
									className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between transition-colors ${
										i === autocompleteIdx
											? "bg-green-900/40 text-green-400"
											: "text-green-500/80 hover:bg-green-950/40 hover:text-green-400"
									}`}
									onMouseDown={(e) => {
										e.preventDefault();
										setSearchTerm(p.nome);
										setShowAutocomplete(false);
										setAutocompleteSuggestions([]);
										onSearch(formatAutoRef(p), p.nome);
									}}
								>
									<span className="flex items-center gap-2">
										<span className="w-10 shrink-0 text-center truncate px-1 text-[10px] font-bold text-green-700 border border-green-900/50 bg-green-950/20 py-1 rounded-none">
											{formatPartido(p.partido)}
										</span>
										<span className="font-bold">{p.nome}</span>
									</span>
									<span className="text-xs opacity-60">{p.uf}</span>
								</button>
							))}
						</div>
					)}

					{/* BOTÃO PROCURAR/CANCELAR MOBILE */}
					{isLoading && onCancel ? (
						<Button
							variant="cyber-destructive"
							onClick={onCancel}
							className="w-full h-12 relative overflow-hidden"
						>
							Cancelar
						</Button>
					) : (
						<Button
							variant="cyber"
							onClick={() => {
								setShowAutocomplete(false);
								onSearch();
							}}
							disabled={!searchTerm.trim()}
							className="w-full h-12 relative overflow-hidden"
						>
							<Search className="mr-2 h-4 w-4" />
							Procurar
						</Button>
					)}
				</div>
			</div>
		);
	}

	// DESKTOP
	return (
		<div className="w-full relative z-20">
			<div className="flex w-full items-center h-12 border-none">
				{/* SELETOR DE ALÇADA DESKTOP */}
				<div className="relative h-full flex items-center bg-black border border-r-0 border-green-500/50 hover:border-green-400 focus-within:border-green-500 transition-colors w-1/3 lg:w-auto max-w-55">
					<select
						id="select-alcada"
						value={selectedUf}
						onChange={(e) => setSelectedUf(e.target.value)}
						disabled={isLoading}
						className="h-full w-full bg-green-950/30 border border-green-500 text-green-400 font-mono text-sm rounded-none appearance-none px-2 lg:px-3 pr-6 lg:pr-8 cursor-pointer focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50 min-w-0"
						style={{ WebkitAppearance: "none" }}
						aria-label="Selecione a alçada"
					>
						<option value="" disabled className="bg-black text-green-500">
							Selecione a alçada
						</option>
						<option
							value="FEDERAL"
							className="bg-black text-green-400 font-bold"
						>
							🏛  Governo Federal
						</option>
						<option disabled className="bg-black text-green-700">
							──────────────────
						</option>
						<optgroup
							label="Governo Estadual"
							className="bg-black text-green-600 text-xs"
						>
							{alcadas
								.filter((e) => e.sigla !== "FEDERAL" && e.sigla !== "_SEP_")
								.map((uf) => (
									<option
										key={uf.sigla}
										value={uf.sigla}
										className="bg-black text-green-400"
									>
										{uf.sigla} — {uf.nome}
									</option>
								))}
						</optgroup>
					</select>
					{/* Chevron custom */}
					<div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
						<svg
							className="w-3 h-3 text-green-500"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M19 9l-7 7-7-7"
							/>
						</svg>
					</div>
				</div>

				<Input
					className="flex-1 h-full"
					placeholder="ALVO: NOME DO POLÍTICO"
					value={searchTerm}
					onChange={(e) => handleSearchTermChange(e.target.value)}
					onKeyDown={handleKeyDown}
					onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
					onFocus={() => {
						if (autocompleteSuggestions.length > 0) setShowAutocomplete(true);
					}}
					disabled={isLoading}
					autoComplete="off"
				/>

				{isLoading && onCancel ? (
					<Button
						variant="cyber-destructive"
						onClick={onCancel}
						className="h-full px-8 relative overflow-hidden group shrink-0"
					>
						<span className="relative z-10 w-24 text-center">CANCELAR</span>
					</Button>
				) : (
					<Button
						variant="cyber"
						onClick={() => {
							setShowAutocomplete(false);
							onSearch();
						}}
						disabled={!searchTerm.trim()}
						className="h-full px-8 relative overflow-hidden group shrink-0"
					>
						<Search className="mr-2 h-4 w-4 relative z-10" />
						<span className="relative z-10 w-20 text-center">Procurar</span>
					</Button>
				)}
			</div>

			{/* AUTOCOMPLETE DROPDOWN */}
			{showAutocomplete && autocompleteSuggestions.length > 0 && !isLoading && (
				<div className="absolute top-14 left-0 w-full border border-green-500/50 bg-black/95 backdrop-blur-sm z-60 font-mono divide-y divide-green-900/30 shadow-[0_4px_20px_rgba(34,197,94,0.2)]">
					{autocompleteSuggestions.map((p: any, i: number) => (
						<button
							key={`${p.casa}-${p.id}-${i}`}
							className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors cursor-pointer ${
								i === autocompleteIdx
									? "bg-green-900/40 text-green-400"
									: "text-green-500/80 hover:bg-green-950/40 hover:text-green-400"
							}`}
							onMouseDown={(e) => {
								e.preventDefault();
								setSearchTerm(p.nome);
								setShowAutocomplete(false);
								setAutocompleteSuggestions([]);
								onSearch(formatAutoRef(p), p.nome);
							}}
						>
							<span className="flex items-center gap-2">
								<span className="w-10 shrink-0 text-center truncate px-1 text-[10px] font-bold text-green-700 border border-green-900/50 bg-green-950/20 py-1 rounded-none">
									{formatPartido(p.partido)}
								</span>
								<span className="font-bold">{p.nome}</span>
							</span>
							<span className="flex items-center gap-2 text-xs opacity-60">
								<span>{p.uf}</span>
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
