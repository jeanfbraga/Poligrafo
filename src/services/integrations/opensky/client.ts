export interface FlightInfo {
    icao24: string;
    callsign: string;
    originCountry: string;
    timePosition: number | null;
    lastContact: number;
    longitude: number | null;
    latitude: number | null;
    baroAltitude: number | null;
    onGround: boolean;
    velocity: number | null;
    trueTrack: number | null;
    verticalRate: number | null;
    sensors: number[] | null;
    geoAltitude: number | null;
    squawk: string | null;
    spi: boolean;
    positionSource: number;
}

const OPENSKY_API = 'https://opensky-network.org/api';

/**
 * Busca o estado atual de voo de uma aeronave pelo seu ICAO24 address.
 * Limite gratuito: 400 req/dia sem autenticação, ou 4000 req/dia com auth.
 */
export async function buscarVoosAeronave(icao24: string): Promise<FlightInfo[]> {
    try {
        const url = `${OPENSKY_API}/states/all?icao24=${icao24.toLowerCase()}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        // Se houver credenciais opcionais (Username/Password), pode adicionar Basic Auth
        const headers: Record<string, string> = {};
        if (process.env.OPENSKY_USERNAME && process.env.OPENSKY_PASSWORD) {
            headers['Authorization'] = 'Basic ' + Buffer.from(`${process.env.OPENSKY_USERNAME}:${process.env.OPENSKY_PASSWORD}`).toString('base64');
        }

        const response = await fetch(url, { signal: controller.signal, headers });
        clearTimeout(timeout);

        if (!response.ok) {
            console.warn(`[OpenSky] Erro HTTP ${response.status} ao buscar aeronave ${icao24}`);
            return [];
        }

        const data = await response.json();
        if (!data || !data.states || data.states.length === 0) {
            return [];
        }

        // OpenSky retorna um array de arrays onde a ordem dos elementos importa
        return data.states.map((state: any[]) => ({
            icao24: state[0],
            callsign: state[1]?.trim(),
            originCountry: state[2],
            timePosition: state[3],
            lastContact: state[4],
            longitude: state[5],
            latitude: state[6],
            baroAltitude: state[7],
            onGround: state[8],
            velocity: state[9],
            trueTrack: state[10],
            verticalRate: state[11],
            sensors: state[12],
            geoAltitude: state[13],
            squawk: state[14],
            spi: state[15],
            positionSource: state[16]
        }));
    } catch (e) {
        console.error(`[OpenSky] Erro ao buscar aeronave ${icao24}:`, e);
        return [];
    }
}
