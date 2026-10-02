/* ==========================================================================
   Mapa do Brasil em pixels (8-bit) — grade 55x54, uma letra por estado.
   Gerado a partir do contorno do país + centroides ponderados dos estados.
   O módulo converte a grade em paths SVG (preenchimento, contornos e rótulos).
   ========================================================================== */

/** Letra 'A'+i → UF; '#' = DF; '.' = oceano/vazio. */
export const BRMAP_CODES = "AC,AM,RR,RO,PA,AP,TO,MA,PI,CE,RN,PB,PE,AL,SE,BA,MT,GO,MG,ES,RJ,SP,PR,SC,RS,MS,DF".split(",");

export const BRMAP_ROWS: readonly string[] = [
	".................CC....................................",
	".............BCCCCCC...........F.......................",
	"...........BBBBCCCCC..........FFF......................",
	".........BBBBBBCCCC...........FFF......................",
	".........BBBBBBBCCC....CEEEFFFFFF......................",
	"......BBBBBBBBBBBBCCCCCEEEEEFFFFF......................",
	".....BBBBBBBBBBBBBBBBBBEEEEEEEEEE......................",
	"......BBBBBBBBBBBBBBBBBEEEEEEEEEEE.....................",
	"......BBBBBBBBBBBBBBBBBEEEEEEEEEEEEEEEH................",
	"......BBBBBBBBBBBBBBBBEEEEEEEEEEEEEEEEHHH..............",
	".....BBBBBBBBBBBBBBBBBEEEEEEEEEEEEEEEEHHHHH............",
	".....BBBBBBBBBBBBBBBBBEEEEEEEEEEEEEEEHHHHHHHHHHJJ......",
	".....BBBBBBBBBBBBBBBBBEEEEEEEEEEEEEEEHHHHHHHHHJJJJJ....",
	".BBBBBBBBBBBBBBBBBBBBBEEEEEEEEEEEEEEEHHHHHHHHHJJJJJJ...",
	"BBBBBBBBBBBBBBBBBBBBBBEEEEEEEEEEEEEEEHHHHHHHHIIJJJJKKKK",
	"BBBBBBBBBBBBBBBBBBBBBBEEEEEEEEEEEEEEEHHHHHHHIIIJJJJKKKK",
	"BBBBBBBBBBBBBBBBBBBBBBEEEEEEEEEEEEEEEHHHHHIIIIIIJJJLLLK",
	".ABBBBBBBBBBBBBBBBBBBBQEEEEEEEEEEEEEGHHHHIIIIIIIIMMMLLL",
	"AAAAABBBBBBBBBBBBBBBBQQQQQEEEEEEEEGGGGGHHIIIIIIIPMMMMML",
	"AAAAAABBBBBBBBBBBBBBQQQQQQQQQEEEEGGGGGGGIIIIIIPPPPMMMNN",
	"..AAAABBBBBBBBBBBBBQQQQQQQQQQQQQGGGGGGGGPPPPPPPPPPPNNN.",
	"...AAAABBBB.BDDDDDDQQQQQQQQQQQQQGGGGGGGGPPPPPPPPPPPON..",
	"....AA.......DDDDDQQQQQQQQQQQQQQQGGGGGGGPPPPPPPPPPPO...",
	".............DDDDDQQQQQQQQQQQQQQQGGGGGGPPPPPPPPPPPP....",
	"..............DDDDQQQQQQQQQQQQQQQQGGGGGPPPPPPPPPPPP....",
	"................DQQQQQQQQQQQQQQQQRRRRRPPPPPPPPPPPP.....",
	"..................QQQQQQQQQQQQQQRRRRRRRPPPPPPPPPPP.....",
	"...................QQQQQQQQQQQQQRRRRRRRPPPPPPPPPP......",
	"...................QQQQQQQQQQQQRRRRRRRRSPPPPPPPPP......",
	"...................QQQQQQQQQQQQRRRRR#RSSSSPPPPPPP......",
	"......................QQQQQQQQQRRRRRRRSSSSSSPPPPP......",
	"......................QQQQQQQQRRRRRRRSSSSSSSSSPPP......",
	"......................QZZZZZZZZRRRRRRSSSSSSSSSSTT......",
	"......................ZZZZZZZZZZRRRRSSSSSSSSSSTT.......",
	"......................ZZZZZZZZZZZZRSSSSSSSSSSTTT.......",
	".......................ZZZZZZZZZZZVVSSSSSSSSSTTT.......",
	".......................ZZZZZZZZZZVVVVVSSSSSSUUT........",
	"......................ZZZZZZZZZZZVVVVVVSSSSUUUU........",
	"..........................ZZZZZZVVVVVVVVSUUUUU.........",
	"..........................ZZZZZZVVVVVVVVVUUUU..........",
	"...........................ZZZZWWVVVVVVVV..............",
	"...........................ZZWWWWWVVVVV................",
	"...........................ZWWWWWWVVVV.................",
	"...........................ZWWWWWWWV...................",
	"............................YWWWWXXX...................",
	"............................YYYXXXXX...................",
	"..........................YYYYYYXXXX...................",
	".........................YYYYYYYYYX....................",
	"........................YYYYYYYYYYY....................",
	".......................YYYYYYYYYYY.....................",
	"........................YYYYYYYYY......................",
	"...........................YYYYY.......................",
	"...........................YYYY........................",
	"............................YY.........................",
];

export const CELULA = 6;

export interface FormaBrasil {
	W: number;
	H: number;
	/** UF → path de preenchimento (retângulos por faixa horizontal). */
	fill: Record<string, string>;
	/** UF → path do contorno da UF (arestas externas). */
	edge: Record<string, string>;
	/** UF → posição [x, y] do rótulo (só estados com área suficiente). */
	label: Record<string, [number, number]>;
}

export function ufDaLetra(ch: string): string | null {
	if (ch === ".") return null;
	if (ch === "#") return "DF";
	return BRMAP_CODES[ch.charCodeAt(0) - 65] ?? null;
}

function celula(rows: readonly string[], c: number, r: number): string {
	if (r < 0 || r >= rows.length || c < 0 || c >= rows[r].length) return ".";
	return rows[r][c];
}

function preencherLinha(rows: readonly string[], r: number, fill: Record<string, string>) {
	let c = 0;
	while (c < rows[r].length) {
		const ch = rows[r][c];
		if (ch === ".") {
			c++;
			continue;
		}
		let e = c;
		while (e + 1 < rows[r].length && rows[r][e + 1] === ch) e++;
		const uf = ufDaLetra(ch);
		if (uf) {
			const w = (e - c + 1) * CELULA;
			fill[uf] = `${fill[uf] ?? ""}M${c * CELULA} ${r * CELULA}h${w}v${CELULA}h-${w}z`;
		}
		c = e + 1;
	}
}

function arestasDaCelula(rows: readonly string[], c: number, r: number, ch: string): string {
	const x = c * CELULA;
	const y = r * CELULA;
	let d = "";
	if (celula(rows, c, r - 1) !== ch) d += `M${x} ${y}h${CELULA}`;
	if (celula(rows, c, r + 1) !== ch) d += `M${x} ${y + CELULA}h${CELULA}`;
	if (celula(rows, c - 1, r) !== ch) d += `M${x} ${y}v${CELULA}`;
	if (celula(rows, c + 1, r) !== ch) d += `M${x + CELULA} ${y}v${CELULA}`;
	return d;
}

interface Acumulo {
	soma: [number, number];
	celulas: [number, number][];
}

/** Posição do rótulo: a célula da UF mais próxima do centroide. */
function posicaoRotulo(a: Acumulo): [number, number] {
	const n = a.celulas.length;
	const mx = a.soma[0] / n;
	const my = a.soma[1] / n;
	let melhor = a.celulas[0];
	let menor = Number.POSITIVE_INFINITY;
	for (const p of a.celulas) {
		const dist = Math.hypot(p[0] - mx, p[1] - my);
		if (dist < menor) {
			menor = dist;
			melhor = p;
		}
	}
	return [(melhor[0] + 0.5) * CELULA, (melhor[1] + 0.5) * CELULA];
}

const AREA_MINIMA_ROTULO = 22;

export function construirFormaBrasil(rows: readonly string[] = BRMAP_ROWS): FormaBrasil {
	const fill: Record<string, string> = {};
	const edge: Record<string, string> = {};
	const acc: Record<string, Acumulo> = {};
	rows.forEach((_, r) => preencherLinha(rows, r, fill));
	rows.forEach((linha, r) => {
		for (let c = 0; c < linha.length; c++) {
			const ch = linha[c];
			const uf = ufDaLetra(ch);
			if (!uf) continue;
			edge[uf] = (edge[uf] ?? "") + arestasDaCelula(rows, c, r, ch);
			const a = (acc[uf] ??= { soma: [0, 0], celulas: [] });
			a.soma[0] += c;
			a.soma[1] += r;
			a.celulas.push([c, r]);
		}
	});
	const label: Record<string, [number, number]> = {};
	for (const [uf, a] of Object.entries(acc)) {
		if (a.celulas.length >= AREA_MINIMA_ROTULO) label[uf] = posicaoRotulo(a);
	}
	return { W: Math.max(...rows.map((r) => r.length)) * CELULA, H: rows.length * CELULA, fill, edge, label };
}

/** Nível de calor 0–4 (raiz quadrada suaviza a assimetria: SP dispara). */
export function nivelDeCalor(total: number, maximo: number): 0 | 1 | 2 | 3 | 4 {
	if (maximo <= 0) return 0;
	const r = Math.sqrt(total / maximo);
	if (r > 0.85) return 4;
	if (r > 0.6) return 3;
	if (r > 0.4) return 2;
	return r > 0.2 ? 1 : 0;
}

export const CORES_CALOR = ["#0f2c1a", "#14502e", "#1f8a4c", "#2fd070", "#7dffb0"] as const;

/** Troféu 16x16 — cada item é [x, y, largura] de uma linha de pixels. */
export const TROFEU: ReadonlyArray<readonly [number, number, number]> = [
	[4, 2, 8], [2, 3, 2], [4, 3, 8], [12, 3, 2], [2, 4, 2], [4, 4, 8], [12, 4, 2], [3, 5, 1], [4, 5, 8],
	[12, 5, 1], [4, 6, 8], [5, 7, 6], [5, 8, 6], [6, 9, 4], [7, 10, 2], [7, 11, 2], [6, 12, 4], [5, 13, 6], [4, 14, 8],
];

const CORES_FOGOS = ["#ffd24a", "#ffb224", "#fff0a8", "#3dff8b", "#7dffb0"];

export interface Particula {
	x: number;
	y: number;
	size: number;
	color: string;
	delay: number;
	dur: number;
}

/** 14 partículas em leque para cima (determinísticas: o burst não muda a cada render). */
export const FOGOS: Particula[] = Array.from({ length: 14 }, (_, i) => {
	const ang = ((-165 + (150 * i) / 13) * Math.PI) / 180;
	const dist = 34 + ((i * 17) % 26);
	return {
		x: Math.cos(ang) * dist,
		y: Math.sin(ang) * dist * 1.15,
		size: 3 + ((i * 7) % 3),
		color: CORES_FOGOS[i % CORES_FOGOS.length],
		delay: (i % 5) * 30,
		dur: 620 + ((i * 13) % 4) * 60,
	};
});

/** Cobre a partícula mais longa (120ms de atraso + 800ms de duração). */
export const DURACAO_CELEBRACAO_MS = 950;
