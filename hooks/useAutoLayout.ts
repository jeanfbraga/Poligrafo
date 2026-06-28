import { useEffect, useRef } from 'react';
import { Node, Edge, useReactFlow, useNodesInitialized } from '@xyflow/react';
import dagre from 'dagre';

export function useAutoLayout(nodes: Node[], edges: Edge[]) {
    const { setNodes, fitView } = useReactFlow();
    const isLayoutRunning = useRef(false);
    const lastLayoutSignature = useRef('');
    const nodesInitialized = useNodesInitialized();

    useEffect(() => {
        // Assinatura única do grafo atual (quais nós e arestas existem)
        const currentSignature = nodes.map(n => n.id).join(',') + '|' + edges.map(e => e.id).join(',');

        // Roda o layout apenas se houverem nós suficientes, não estiver rodando, e todos já estiverem desenhados/medidos
        // E PRINCIPALMENTE: Apenas se a assinatura do grafo mudou (evita loop infinito)
        if (nodes.length < 2 || isLayoutRunning.current || !nodesInitialized || currentSignature === lastLayoutSignature.current) {
            return;
        }

        isLayoutRunning.current = true;
        lastLayoutSignature.current = currentSignature;

        // Instancia o grafo Dagre
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));
        
        // Define opções do layout (rankdir LR = Esquerda para Direita, TB = Topo para Baixo)
        // O nodeSep e rankSep definem o espaçamento obrigatório em pixels, garantindo ZERO sobreposição
        dagreGraph.setGraph({ 
            rankdir: 'TB', 
            nodesep: 100, // Espaçamento horizontal entre os nós
            ranksep: 200, // Espaçamento vertical entre os "níveis" da investigação
            align: 'UL', // Alinhamento
        });

        // Alimenta os nós no Dagre com os tamanhos reais medidos
        nodes.forEach((n) => {
            // @ts-ignore
            const w = n.measured?.width || n.width || 350;
            // @ts-ignore
            const h = n.measured?.height || n.height || 150;
            
            dagreGraph.setNode(n.id, { width: w, height: h });
        });

        // Alimenta as arestas
        edges.forEach((e) => {
            dagreGraph.setEdge(e.source, e.target);
        });

        // Executa o cálculo matematicamente (é síncrono e instantâneo)
        dagre.layout(dagreGraph);

        // Pega as novas posições. O Dagre retorna coordenadas de Top-Left + Offset interno.
        const layoutedNodes = nodes.map((n) => {
            const nodeWithPosition = dagreGraph.node(n.id);

            // @ts-ignore
            const w = n.measured?.width || n.width || 350;
            // @ts-ignore
            const h = n.measured?.height || n.height || 150;

            // Transforma o centro do Dagre para o top-left do React Flow
            const targetX = nodeWithPosition.x - w / 2;
            const targetY = nodeWithPosition.y - h / 2;

            return {
                ...n,
                position: {
                    x: targetX,
                    y: targetY,
                },
            };
        });

        // Atualiza a tela de uma vez só!
        setNodes(layoutedNodes);
        
        // Dá um pequeno respiro pro React renderizar e centraliza a câmera
        setTimeout(() => {
            fitView({ padding: 0.3, duration: 800 });
            isLayoutRunning.current = false;
        }, 50);

    }, [nodes.length, edges.length, setNodes, nodesInitialized, fitView]);
}
