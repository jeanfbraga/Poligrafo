/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React, { useState } from 'react';
import SearchBar from '../../src/components/search/SearchBar';

// Mock useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const Wrapper = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUf, setSelectedUf] = useState('FEDERAL');
    return (
        <SearchBar
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            selectedUf={selectedUf}
            setSelectedUf={setSelectedUf}
            onSearch={vi.fn()}
            alcadas={[]}
        />
    );
};

describe('SearchBar VIP e Inexata', () => {
    it('Deve encontrar Lula com digitação parcial e sugerir na interface', async () => {
        render(<Wrapper />);

        const input = screen.getByPlaceholderText('ALVO: NOME DO POLÍTICO');
        
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'Inacio lula' } });
        
        await waitFor(() => {
            expect(screen.getByText('Luiz Inácio Lula da Silva')).toBeInTheDocument();
        });
    });
});
