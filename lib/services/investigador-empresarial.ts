import { normalizeString, fetchWithTimeout } from '../../app/api/investigar/tse';
import { buscarOperacoesBNDES } from '../../lib/bndes/client';
import { buscarInfracoesIbama } from '../../lib/ibama/client';
import { buscarEnteSiconfi, consultarIndicadoresLRF } from '../../lib/siconfi/client';
import { consultarPNAE, consultarFUNDEB, consultarPNATE } from '../../lib/fnde/client';
import { listarAtividadesAuditoria } from '../../lib/denasus/client';
import { buscarInabilitadosTCU, buscarCadirregTCU, buscarCertidaoTCU } from '../../lib/tcu/client';
import { parse } from 'csv-parse/sync';

