import { NextResponse } from "next/server";
import congressoIndex from "@/services/integrations/data/congresso-index.json";
import { normalizeString } from "../../app/api/investigar/tse";

const CORRECOES_NOMES: Record<
	string,
	{
		nomeCorreto: string;
		autoRef?: string;
	}
> = {
	"celso rusomanno": {
		nomeCorreto: "celso russomanno",
	},
	"tarcisio meira": {
		nomeCorreto: "tarcísio de freitas",
		autoRef: "GOVERNADOR:SP:Tarcísio",
	},
	"tarcísio meira": {
		nomeCorreto: "tarcísio de freitas",
		autoRef: "GOVERNADOR:SP:Tarcísio",
	},
	"tarcisio de freitas": {
		nomeCorreto: "tarcísio de freitas",
		autoRef: "GOVERNADOR:SP:Tarcísio de Freitas",
	},
	"tarcísio de freitas": {
		nomeCorreto: "tarcísio de freitas",
		autoRef: "GOVERNADOR:SP:Tarcísio de Freitas",
	},
	"tarcisio gomes de freitas": {
		nomeCorreto: "tarcísio de freitas",
		autoRef: "GOVERNADOR:SP:Tarcísio de Freitas",
	},
	"tarcísio gomes de freitas": {
		nomeCorreto: "tarcísio de freitas",
		autoRef: "GOVERNADOR:SP:Tarcísio de Freitas",
	},
	tarcisio: {
		nomeCorreto: "tarcísio de freitas",
		autoRef: "GOVERNADOR:SP:Tarcísio de Freitas",
	},
	"marussa boldrim": {
		nomeCorreto: "marussa boldrin",
		autoRef: "FEDERAL:CAMARA:220572",
	},
	"morussa boldrin": {
		nomeCorreto: "marussa boldrin",
		autoRef: "FEDERAL:CAMARA:220572",
	},
	"morussa cassia": {
		nomeCorreto: "marussa boldrin",
		autoRef: "FEDERAL:CAMARA:220572",
	},
};

function sanitizeParam(param: string | null): string | null {
	if (!param) return null;
	return param.replace(/[^a-zA-Z0-9\sÁ-ÿ:\-%()_.,]/g, "");
}

function extrairUfScope(ufParam: string | null): string | null {
	if (ufParam && /^[A-Z]{2}$/i.test(ufParam)) {
		return ufParam.toUpperCase();
	}
	return null;
}

function aplicarCorrecoesNome(
	nome: string,
	refAtual: string | null,
): { nomeCorrigido: string; forceRef: string | null } {
	const correcao = CORRECOES_NOMES[nome];
	if (!correcao) {
		return { nomeCorrigido: nome, forceRef: refAtual };
	}
	const forceRef = !refAtual && correcao.autoRef ? correcao.autoRef : refAtual;
	return { nomeCorrigido: correcao.nomeCorreto, forceRef };
}

function buscarMatchCongressoIndex(
	nome: string,
	cargoParam: string,
	refAtual: string | null,
): string | null {
	if (refAtual || (cargoParam && cargoParam !== "FEDERAL")) {
		return refAtual;
	}
	const normNome = normalizeString(nome);
	const match = (congressoIndex as any[]).find(
		(p: any) => normalizeString(p.nome) === normNome,
	);
	if (!match) return refAtual;

	const prefixo =
		match.casa === "GOVERNO_ESTADUAL"
			? `GOVERNADOR:${match.uf}`
			: `FEDERAL:${match.casa}`;
	const novoRef = `${prefixo}:${match.id}`;
	console.log(
		`[BYPASS] Match local encontrado no JSON para ${nome}. Ref forçada: ${novoRef}`,
	);
	return novoRef;
}

export function parseInvestigarRequest(requestUrl: string) {
	const { searchParams } = new URL(requestUrl);
	const originNome = searchParams.get("nome");
	const originRef = searchParams.get("ref");
	const cargoParam = searchParams.get("cargo") || "FEDERAL";
	const ufParam = searchParams.get("uf");

	const nomeBruto = sanitizeParam(originNome);
	const refParam = sanitizeParam(originRef);

	if (!nomeBruto && !refParam) {
		return NextResponse.json(
			{
				error: "Parâmetro ?nome= ou ?ref= é obrigatório.",
			},
			{
				status: 400,
			},
		);
	}

	const rawNome = nomeBruto ?? "";
	const nomeBase = rawNome.toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").trim();
	const ufScope = extrairUfScope(ufParam);

	const { nomeCorrigido, forceRef: refCorrigido } = aplicarCorrecoesNome(
		nomeBase,
		refParam,
	);
	const forceRef = buscarMatchCongressoIndex(
		nomeCorrigido,
		cargoParam,
		refCorrigido,
	);

	console.log(
		"[START] Investigação Polígrafo por:",
		nomeCorrigido,
		ufScope ? `(escopo: ${ufScope})` : "",
		forceRef ? `(ref: ${forceRef})` : "",
	);

	return {
		nomeParaBusca: nomeCorrigido,
		ufScope,
		cargoParam,
		ufParam,
		forceRef,
		refParam,
		correcoesNomes: CORRECOES_NOMES,
		nomeBruto,
	};
}
