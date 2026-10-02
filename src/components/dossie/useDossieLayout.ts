"use client";

import { getNodesBounds, getViewportForBounds, useReactFlow, useStore } from "@xyflow/react";
import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import { construirCard, LIMITE_DESTAQUE_LONGO } from "@/components/nodes/card-model";
import type { DossieEdge, DossieNode } from "@/lib/investigacao/dossie-state";
import {
	alturaEstimada,
	aplicarPosicoes,
	assinaturaLayout,
	calcularLayout,
	type Direcao,
	LARGURA_CARD,
} from "@/lib/investigacao/layout";

const cacheAltura = new WeakMap<object, number>();

/** Altura estimada do card (memoizada pelo objeto `data`, que o reducer troca ao mudar). */
export function alturaDoNo(n: DossieNode): number {
	const chave = (n.data ?? {}) as object;
	const hit = cacheAltura.get(chave);
	const extra = extraDoNo(n);
	if (hit !== undefined) return hit + extra;
	const m = construirCard(n.type ?? "", n.data);
	const h = alturaEstimada({
		campos: m.campos.length,
		temMedidor: m.medidor !== null,
		temMotivo: m.motivo !== "",
		motivoLen: m.motivo.length,
		subLen: m.sub.length,
		tituloLen: m.titulo.length,
		carregando: false,
		temScore: m.score !== null,
		temRegra: m.regra !== null,
		heroLongo: m.chave.valor.length > LIMITE_DESTAQUE_LONGO,
	});
	cacheAltura.set(chave, h);
	return h + extra;
}

/** O card da pessoa tem cabeçalho com foto (mais alto) e ações: medido ~43px acima do genérico. */
const EXTRA_PESSOA = 44;

function extraDoNo(n: DossieNode): number {
	const carregando = n.data?.isSearching ? 52 : 0;
	return carregando + (n.type === "PESSOA" ? EXTRA_PESSOA : 0);
}

/** Abaixo deste zoom os cards viram "dot": o enquadramento automático não desce disso. */
export const ZOOM_MINIMO_LEGIVEL = 0.42;
const MARGEM = 24;

export interface Camera {
	x: number;
	y: number;
	zoom: number;
}

function comTamanho(n: DossieNode) {
	return { ...n, width: LARGURA_CARD, height: alturaDoNo(n) };
}

/**
 * Calcula a câmera para enquadrar o grafo, descontando as sobreposições do topo
 * (faixa + legenda). Se tudo coubesse só em zoom ilegível, foca a pessoa e seus
 * vizinhos imediatos em um zoom legível (o resto é alcançado por pan e pelo rail).
 */
export function calcularCamera(
	nodes: DossieNode[],
	largura: number,
	altura: number,
	topoOcupado: number,
): Camera | null {
	const visiveis = nodes.filter((n) => !n.hidden);
	if (visiveis.length === 0 || largura <= 0 || altura <= 0) return null;
	const areaW = largura - 2 * MARGEM;
	const areaH = altura - topoOcupado - MARGEM;
	const paraCamera = (lista: DossieNode[], minZoom: number): Camera => {
		const vp = getViewportForBounds(getNodesBounds(lista.map(comTamanho)), areaW, areaH, minZoom, 1, 0.04);
		return { x: vp.x + MARGEM, y: vp.y + topoOcupado, zoom: vp.zoom };
	};
	const tudo = paraCamera(visiveis, 0.1);
	if (tudo.zoom >= ZOOM_MINIMO_LEGIVEL) return tudo;

	// Grafo grande demais: pessoa + coluna central de vizinhos em zoom legível.
	const pessoa = visiveis.find((n) => n.type === "PESSOA") ?? visiveis[0];
	const vizinhos = visiveis
		.filter((n) => n.id !== pessoa.id)
		.sort((a, b) => Math.abs(a.position.y - pessoa.position.y) - Math.abs(b.position.y - pessoa.position.y))
		.slice(0, 3);
	return paraCamera([pessoa, ...vizinhos], ZOOM_MINIMO_LEGIVEL);
}

interface Params {
	nodes: DossieNode[];
	edges: DossieEdge[];
	direcao: Direcao;
	setNodes: (nodes: DossieNode[]) => void;
	/** Nós que o usuário arrastou (não são reposicionados). */
	fixos: MutableRefObject<Set<string>>;
	/** Enquadra o grafo depois de cada layout enquanto o usuário não mexeu na câmera. */
	enquadrarAuto: boolean;
	/** O usuário já mexeu na câmera (pan/zoom): para de enquadrar sozinho. */
	usuarioMexeu: MutableRefObject<boolean>;
	/** Há faixa/legenda cobrindo o topo do canvas. */
	comFaixa: boolean;
}

/**
 * Roda o Dagre sempre que a topologia (ou a direção) muda.
 * Não depende de medição do DOM: usa a altura estimada do card.
 */
export function useDossieLayout({ nodes, edges, direcao, setNodes, fixos, enquadrarAuto, usuarioMexeu, comFaixa }: Params) {
	const { setViewport } = useReactFlow();
	const largura = useStore((s) => s.width);
	const altura = useStore((s) => s.height);
	const ultima = useRef("");
	const nodesRef = useRef(nodes);
	nodesRef.current = nodes;

	const enquadrar = useCallback(() => {
		requestAnimationFrame(() => {
			const cam = calcularCamera(nodesRef.current, largura, altura, comFaixa ? 112 : 24);
			if (cam) void setViewport(cam, { duration: 350 });
		});
	}, [largura, altura, comFaixa, setViewport]);

	useEffect(() => {
		const opts = { direcao, altura: alturaDoNo, fixos: fixos.current };
		const sig = assinaturaLayout(nodes, edges, opts);
		if (sig === ultima.current) return;
		ultima.current = sig;
		const r = calcularLayout(nodes, edges, opts);
		const novos = aplicarPosicoes(nodes, r);
		if (novos !== nodes) setNodes(novos);
		if (enquadrarAuto && !usuarioMexeu.current && nodes.length > 0) enquadrar();
	}, [nodes, edges, direcao, setNodes, fixos, enquadrarAuto, usuarioMexeu, enquadrar]);

	return { enquadrar };
}
