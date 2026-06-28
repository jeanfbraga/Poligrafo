import { normalizeString, fetchWithTimeout } from '../../app/api/investigar/tse';
import { buscarOperacoesBNDES } from '@/services/integrations/bndes/client';
import { buscarInfracoesIbama } from '@/services/integrations/ibama/client';
import { buscarEnteSiconfi, consultarIndicadoresLRF } from '@/services/integrations/siconfi/client';
import { consultarPNAE, consultarFUNDEB, consultarPNATE } from '@/services/integrations/fnde/client';
import { listarAtividadesAuditoria } from '@/services/integrations/denasus/client';
import { buscarInabilitadosTCU, buscarCadirregTCU, buscarCertidaoTCU } from '@/services/integrations/tcu/client';
import { parse } from 'csv-parse/sync';

