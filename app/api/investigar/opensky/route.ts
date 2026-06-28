import { NextResponse } from 'next/server';
import { buscarVoosAeronave } from '../../../../lib/opensky/client';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { icao24 } = body;

        if (!icao24 || typeof icao24 !== 'string' || !/^[a-fA-F0-9]{6}$/.test(icao24)) {
            return NextResponse.json({ error: 'ICAO24 inválido (deve possuir exatamente 6 caracteres hexadecimais)' }, { status: 400 });
        }

        const voos = await buscarVoosAeronave(icao24);

        if (voos.length === 0) {
            return NextResponse.json({ 
                success: true, 
                message: 'Aeronave no chão ou sem transponder ativo no momento.',
                data: []
            });
        }

        const nodes = voos.map(voo => ({
            id: `opensky-${voo.icao24}-${Date.now()}`,
            type: 'DESPESA', // Usamos despesa ou contrato, mas na interface o label que importa
            data: {
                label: `Voo Detectado: ${voo.callsign || voo.icao24}`,
                tipo: 'Rastreamento Aéreo (OpenSky)',
                valor: voo.baroAltitude ? `${Math.round(voo.baroAltitude)}m altitude` : 'N/A',
                documento: voo.icao24,
                motivo_ia: `Aeronave (${voo.icao24}) em voo sobre ${voo.originCountry}. Velocidade: ${voo.velocity ? Math.round(voo.velocity * 3.6) + ' km/h' : 'N/A'}.`,
                score_letalidade: 60 // Alerta médio, pode ser normal, mas é interessante
            }
        }));

        return NextResponse.json({ success: true, nodes });
    } catch (e: any) {
        console.error('[OpenSky API] Erro:', e.message);
        return NextResponse.json({ error: 'Erro interno ao buscar voos' }, { status: 500 });
    }
}
