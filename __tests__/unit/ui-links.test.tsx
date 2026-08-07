/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MobileView from '../../src/components/layout/MobileView';
import '@testing-library/jest-dom';
import React from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// ResizeObserver and scrollTo mock needed for jsdom / components
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

HTMLElement.prototype.scrollTo = function () {};

describe('MobileView UI Document Links', () => {
    const defaultProps = {
        edges: [],
        evidencias: [],
        isLoading: false,
        displayedStatus: '',
        isTyping: false,
        handlePivotCNPJ: vi.fn(),
        handleSocioSearch: vi.fn(),
        onNovaBusca: vi.fn(),
        onExportDossie: vi.fn(),
        isExporting: false,
        selectedUf: 'FEDERAL',
        setSelectedUf: vi.fn(),
        alcadas: [],
        onSearch: vi.fn(),
        searchTerm: '',
        setSearchTerm: vi.fn(),
        statusMessage: '',
    };

    it('Scenario 1: Câmara Deputy expense WITHOUT document URL should show Câmara portal link', async () => {
        const nodes = [
            { id: '1', type: 'PESSOA', data: { label: 'Yandra Moura', casa: 'CAMARA', cargo: 'Deputada Federal' } },
            { id: '2', type: 'DESPESA', data: { label: 'PASSAGEM AÉREA', urlDocumento: null, valor: 1000 } }
        ];

        render(<MobileView {...defaultProps} nodes={nodes} />);
        
        // Find the card and click to open Drawer
        const card = screen.getByText('PASSAGEM AÉREA').closest('div');
        expect(card).toBeInTheDocument();
        if (card) card.click();

        // After click, the drawer should show "Portal de Dados da Câmara"
        const camaraLink = await screen.findByRole('link', { name: /Portal de Dados da Câmara/i });
        expect(camaraLink).toBeInTheDocument();
        expect(camaraLink).toHaveAttribute('href', 'https://dadosabertos.camara.leg.br/');
        
        // Ensure no Senado link is present
        const senadoLink = screen.queryByRole('link', { name: /Portal do Senado/i });
        expect(senadoLink).not.toBeInTheDocument();
    });

    it('Scenario 2: Senado Senator expense WITHOUT document URL should show Senado portal link', async () => {
        const nodes = [
            { id: '1', type: 'PESSOA', data: { label: 'Senador Fulano', casa: 'SENADO', cargo: 'Senador da República' } },
            { id: '2', type: 'DESPESA', data: { label: 'ALUGUEL DE IMÓVEIS', urlDocumento: null, valor: 5000 } }
        ];

        render(<MobileView {...defaultProps} nodes={nodes} />);
        
        const card = screen.getByText('ALUGUEL DE IMÓVEIS').closest('div');
        if (card) card.click();

        // Should show "Portal do Senado"
        const senadoLink = await screen.findByRole('link', { name: /Portal do Senado/i });
        expect(senadoLink).toBeInTheDocument();
        expect(senadoLink).toHaveAttribute('href', 'https://www12.senado.leg.br/transparencia');
        
        // Ensure no Camara link is present
        const camaraLink = screen.queryByRole('link', { name: /Portal de Dados da Câmara/i });
        expect(camaraLink).not.toBeInTheDocument();
    });

    it('Scenario 3: Any politician expense WITH document URL should show the exact document link', async () => {
        const nodes = [
            { id: '1', type: 'PESSOA', data: { label: 'Deputado Cicrano', casa: 'CAMARA', cargo: 'Deputado Federal' } },
            { id: '2', type: 'DESPESA', data: { label: 'COMBUSTÍVEL', urlDocumento: 'https://www.camara.leg.br/documentos/12345.pdf', valor: 250 } }
        ];

        render(<MobileView {...defaultProps} nodes={nodes} />);
        
        const card = screen.getByText('COMBUSTÍVEL').closest('div');
        if (card) card.click();

        // Should show "VER NOTA DIGITALIZADA"
        const notaLink = await screen.findByRole('link', { name: /VER NOTA DIGITALIZADA/i });
        expect(notaLink).toBeInTheDocument();
        expect(notaLink).toHaveAttribute('href', 'https://www.camara.leg.br/documentos/12345.pdf');
    });

    it('Scenario 4: ALERJ Deputy expense WITHOUT document URL should show ALERJ portal link', async () => {
        const nodes = [
            { id: '1', type: 'PESSOA', data: { label: 'Deputado Carioca', casa: 'ALERJ', cargo: 'Deputado Estadual' } },
            { id: '2', type: 'DESPESA', data: { label: 'ALIMENTAÇÃO', urlDocumento: null, valor: 200 } }
        ];

        render(<MobileView {...defaultProps} nodes={nodes} />);
        
        const card = screen.getByText('ALIMENTAÇÃO').closest('div');
        if (card) card.click();

        // Should show "Transparência ALERJ"
        const alerjLink = await screen.findByRole('link', { name: /Transparência ALERJ/i });
        expect(alerjLink).toBeInTheDocument();
        expect(alerjLink).toHaveAttribute('href', 'https://www.alerj.rj.gov.br/Transparencia/');
    });

    it('Scenario 5: Prefeitura expense WITHOUT document URL should show local transparency link using root URI', async () => {
        const nodes = [
            { id: '1', type: 'PESSOA', data: { label: 'Prefeito João', casa: 'PREFEITURA', uri: 'https://transparencia.cidade.sp.gov.br', cargo: 'Prefeito' } },
            { id: '2', type: 'DESPESA', data: { label: 'EVENTO', urlDocumento: null, valor: 50000 } }
        ];

        render(<MobileView {...defaultProps} nodes={nodes} />);
        
        const card = screen.getByText('EVENTO').closest('div');
        if (card) card.click();

        // Should show "Portal da Transparência" pointing to the original URI
        const prefLink = await screen.findByRole('link', { name: /Portal da Transparência/i });
        expect(prefLink).toBeInTheDocument();
        expect(prefLink).toHaveAttribute('href', 'https://transparencia.cidade.sp.gov.br');
    });
});
