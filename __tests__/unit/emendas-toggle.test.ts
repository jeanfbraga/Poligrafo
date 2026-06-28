import { describe, it, expect } from 'vitest';

// Lógica idêntica ao handleToggleEmendas de app/page.tsx
function toggleEmendas(hubId: string, nodes: any[], edges: any[]) {
  const hubNode = nodes.find(n => n.id === hubId);
  if (!hubNode) return { nodes, edges };
  const wasExpanded = !!hubNode.data?.isExpanded;
  const nextExpanded = !wasExpanded;

  const updatedNodes = nodes.map(n => {
    if (n.id === hubId) {
      return { ...n, data: { ...n.data, isExpanded: nextExpanded } };
    }
    if (n.type === 'EMENDA' && n.id.startsWith('emenda-')) {
      return { ...n, hidden: !nextExpanded };
    }
    return n;
  });
  
  const updatedEdges = edges.map(e => {
    if (e.source === hubId && e.id.startsWith('edge-emenda-hub-')) {
      return { ...e, hidden: !nextExpanded };
    }
    return e;
  });

  return { nodes: updatedNodes, edges: updatedEdges };
}

describe('🔄 Lógica de Toggle de Emendas no Canvas', () => {
  it('deve expandir emendas colocando hidden: false nas emendas e edges vinculadas', () => {
    const initialNodes = [
      { id: 'hub-1', type: 'EMENDA_RESUMO', data: { isExpanded: false } },
      { id: 'emenda-1', type: 'EMENDA', hidden: true },
      { id: 'emenda-2', type: 'EMENDA', hidden: true },
      { id: 'outros-1', type: 'CONTRATO', hidden: false }
    ];

    const initialEdges = [
      { id: 'edge-emenda-hub-emenda-1', source: 'hub-1', target: 'emenda-1', hidden: true },
      { id: 'edge-emenda-hub-emenda-2', source: 'hub-1', target: 'emenda-2', hidden: true },
      { id: 'other-edge', source: 'outros-1', target: 'hub-1', hidden: false }
    ];

    const { nodes, edges } = toggleEmendas('hub-1', initialNodes, initialEdges);

    // Hub node should now be expanded
    const hubNode = nodes.find(n => n.id === 'hub-1');
    expect(hubNode?.data.isExpanded).toBe(true);

    // Emendas should not be hidden
    expect(nodes.find(n => n.id === 'emenda-1')?.hidden).toBe(false);
    expect(nodes.find(n => n.id === 'emenda-2')?.hidden).toBe(false);
    // Other nodes should remain unchanged
    expect(nodes.find(n => n.id === 'outros-1')?.hidden).toBe(false);

    // Edges connected to the hub should not be hidden
    expect(edges.find(e => e.id === 'edge-emenda-hub-emenda-1')?.hidden).toBe(false);
    expect(edges.find(e => e.id === 'edge-emenda-hub-emenda-2')?.hidden).toBe(false);
    expect(edges.find(e => e.id === 'other-edge')?.hidden).toBe(false);
  });

  it('deve recolher emendas colocando hidden: true nas emendas e edges vinculadas', () => {
    const initialNodes = [
      { id: 'hub-1', type: 'EMENDA_RESUMO', data: { isExpanded: true } },
      { id: 'emenda-1', type: 'EMENDA', hidden: false },
      { id: 'emenda-2', type: 'EMENDA', hidden: false }
    ];

    const initialEdges = [
      { id: 'edge-emenda-hub-emenda-1', source: 'hub-1', target: 'emenda-1', hidden: false },
      { id: 'edge-emenda-hub-emenda-2', source: 'hub-1', target: 'emenda-2', hidden: false }
    ];

    const { nodes, edges } = toggleEmendas('hub-1', initialNodes, initialEdges);

    // Hub node should now be collapsed
    const hubNode = nodes.find(n => n.id === 'hub-1');
    expect(hubNode?.data.isExpanded).toBe(false);

    // Emendas should be hidden
    expect(nodes.find(n => n.id === 'emenda-1')?.hidden).toBe(true);
    expect(nodes.find(n => n.id === 'emenda-2')?.hidden).toBe(true);

    // Edges connected to the hub should be hidden
    expect(edges.find(e => e.id === 'edge-emenda-hub-emenda-1')?.hidden).toBe(true);
    expect(edges.find(e => e.id === 'edge-emenda-hub-emenda-2')?.hidden).toBe(true);
  });
});
