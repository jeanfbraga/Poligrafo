import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import congressoIndex from '../../src/services/integrations/data/congresso-index.json';
import municipaisIndex from '../../src/services/integrations/data/municipais-index.json';

const envPath = path.join(process.cwd(), '.env.local');
const env = dotenv.parse(fs.readFileSync(envPath));

const urlPrincipal = env.NEXT_PUBLIC_SUPABASE_URL;
const keyPrincipal = env.SUPABASE_SERVICE_ROLE_KEY;

if (!urlPrincipal || !keyPrincipal) {
	console.error('❌ Credenciais do Supabase ausentes no .env.local');
	process.exit(1);
}

const supabase = createClient(urlPrincipal, keyPrincipal, {
	auth: { autoRefreshToken: false, persistSession: false }
});

const ORGAOS_BASE = [
	{
		esfera: 'FEDERAL',
		poder: 'LEGISLATIVO',
		uf: 'BR',
		municipio: 'Brasília',
		nome: 'Câmara dos Deputados',
		sigla: 'CAMARA',
		cnpj: '00530352000159'
	},
	{
		esfera: 'FEDERAL',
		poder: 'LEGISLATIVO',
		uf: 'BR',
		municipio: 'Brasília',
		nome: 'Senado Federal',
		sigla: 'SENADO',
		cnpj: '00530279000137'
	},
	{
		esfera: 'FEDERAL',
		poder: 'EXECUTIVO',
		uf: 'BR',
		municipio: 'Brasília',
		nome: 'Presidência da República',
		sigla: 'PR',
		cnpj: '00394452000103'
	},
	{
		esfera: 'MUNICIPAL',
		poder: 'LEGISLATIVO',
		uf: 'SE',
		municipio: 'Aracaju',
		nome: 'Câmara Municipal de Aracaju',
		sigla: 'CMA',
		cnpj: '13149954000185'
	},
	{
		esfera: 'MUNICIPAL',
		poder: 'EXECUTIVO',
		uf: 'SE',
		municipio: 'Aracaju',
		nome: 'Prefeitura Municipal de Aracaju',
		sigla: 'PMA',
		cnpj: '13128784000184'
	},
	{
		esfera: 'MUNICIPAL',
		poder: 'LEGISLATIVO',
		uf: 'RJ',
		municipio: 'Rio de Janeiro',
		nome: 'Câmara Municipal do Rio de Janeiro',
		sigla: 'CMRJ',
		cnpj: '08317316000140'
	},
	{
		esfera: 'MUNICIPAL',
		poder: 'EXECUTIVO',
		uf: 'RJ',
		municipio: 'Rio de Janeiro',
		nome: 'Prefeitura da Cidade do Rio de Janeiro',
		sigla: 'PCRJ',
		cnpj: '42498600000171'
	},
	{
		esfera: 'MUNICIPAL',
		poder: 'LEGISLATIVO',
		uf: 'SP',
		municipio: 'São Paulo',
		nome: 'Câmara Municipal de São Paulo',
		sigla: 'CMSP',
		cnpj: '50176288000128'
	},
	{
		esfera: 'MUNICIPAL',
		poder: 'EXECUTIVO',
		uf: 'SP',
		municipio: 'São Paulo',
		nome: 'Prefeitura do Município de São Paulo',
		sigla: 'PMSP',
		cnpj: '46395000000139'
	},
	{
		esfera: 'ESTADUAL',
		poder: 'EXECUTIVO',
		uf: 'SE',
		municipio: null,
		nome: 'Governo do Estado de Sergipe',
		sigla: 'GOV_SE',
		cnpj: '13128792000120'
	},
	{
		esfera: 'ESTADUAL',
		poder: 'EXECUTIVO',
		uf: 'RJ',
		municipio: null,
		nome: 'Governo do Estado do Rio de Janeiro',
		sigla: 'GOV_RJ',
		cnpj: '42498675000152'
	},
	{
		esfera: 'ESTADUAL',
		poder: 'EXECUTIVO',
		uf: 'SP',
		municipio: null,
		nome: 'Governo do Estado de São Paulo',
		sigla: 'GOV_SP',
		cnpj: '46377222000129'
	},
	{
		esfera: 'ESTADUAL',
		poder: 'LEGISLATIVO',
		uf: 'RJ',
		municipio: null,
		nome: 'Assembleia Legislativa do Estado do Rio de Janeiro',
		sigla: 'ALERJ',
		cnpj: '30448981000108'
	},
	{
		esfera: 'ESTADUAL',
		poder: 'LEGISLATIVO',
		uf: 'SP',
		municipio: null,
		nome: 'Assembleia Legislativa do Estado de São Paulo',
		sigla: 'ALESP',
		cnpj: '43050497000184'
	}
];

const PRESIDENTES_EXTRA = [
	{
		nome: 'Luiz Inácio Lula da Silva',
		nomeUrna: 'Lula',
		cargo: 'PRESIDENTE',
		uf: 'BR',
		partido: 'PT',
		orgaoSigla: 'PR',
		anoInicio: 2023,
		foto: 'https://uvzynmgwfmdsdrwvgbsy.supabase.co/storage/v1/object/public/fotos-politicos/lula.jpg'
	},
	{
		nome: 'Jair Messias Bolsonaro',
		nomeUrna: 'Bolsonaro',
		cargo: 'PRESIDENTE',
		uf: 'BR',
		partido: 'PL',
		orgaoSigla: 'PR',
		anoInicio: 2019,
		anoFim: 2022,
		foto: 'https://uvzynmgwfmdsdrwvgbsy.supabase.co/storage/v1/object/public/fotos-politicos/bolsonaro.jpg'
	},
	{
		nome: 'Dilma Vana Rousseff',
		nomeUrna: 'Dilma',
		cargo: 'PRESIDENTE',
		uf: 'BR',
		partido: 'PT',
		orgaoSigla: 'PR',
		anoInicio: 2011,
		anoFim: 2016,
		foto: 'https://uvzynmgwfmdsdrwvgbsy.supabase.co/storage/v1/object/public/fotos-politicos/dilma.jpg'
	},
	{
		nome: 'Michel Miguel Elias Temer Lulia',
		nomeUrna: 'Michel Temer',
		cargo: 'PRESIDENTE',
		uf: 'BR',
		partido: 'MDB',
		orgaoSigla: 'PR',
		anoInicio: 2016,
		anoFim: 2018,
		foto: 'https://uvzynmgwfmdsdrwvgbsy.supabase.co/storage/v1/object/public/fotos-politicos/temer.jpg'
	}
];

async function seed() {
	console.log('====================================================');
	console.log('🚀 SEED DO MODELO CANÔNICO UNIFICADO');
	console.log('====================================================\n');

	// 1. Popula orgaos_publicos
	console.log('1. Populando orgaos_publicos...');
	const orgaosMap = new Map<string, string>(); // sigla -> id

	for (const org of ORGAOS_BASE) {
		const { data, error } = await supabase
			.from('orgaos_publicos')
			.upsert(org, { onConflict: 'esfera,poder,uf,municipio,sigla' })
			.select('id, sigla')
			.single();

		if (error) {
			console.warn(`   ⚠️ Erro ao inserir órgão ${org.sigla}:`, error.message);
		} else if (data) {
			orgaosMap.set(data.sigla, data.id);
		}
	}
	console.log(`   ✅ ${orgaosMap.size} órgãos cadastrados/atualizados.\n`);

	// 2. Carrega cadastro rico de deputados do camara_perfil_politico_cache se disponível
	console.log('2. Consultando camara_perfil_politico_cache para metadados ricos...');
	const perfilMap = new Map<string, any>();
	try {
		const { data: perfis } = await supabase
			.from('camara_perfil_politico_cache')
			.select('id_deputado, nome, cpf, data_nascimento, uf, url_foto');

		if (perfis && Array.isArray(perfis)) {
			for (const p of perfis) {
				const chave = (p.nome || '').trim().toLowerCase();
				perfilMap.set(chave, p);
				if (p.id_deputado) perfilMap.set(String(p.id_deputado), p);
			}
			console.log(`   ✅ ${perfis.length} perfis enriquecidos carregados.`);
		}
	} catch (e: any) {
		console.log('   (Perfis ricos indisponíveis no banco principal, usando dados dos índices locais).');
	}

	// 3. Constrói lista unificada de políticos
	console.log('\n3. Construindo cadastro unificado de políticos...');
	const politicosToInsert: any[] = [];
	const mandatosToInsert: any[] = [];

	// A. Congresso Nacional (Deputados e Senadores)
	for (const p of congressoIndex as any[]) {
		const orgaoSigla = p.casa === 'CAMARA' ? 'CAMARA' : 'SENADO';
		const orgaoId = orgaosMap.get(orgaoSigla);
		const cargo = p.casa === 'CAMARA' ? 'DEPUTADO_FEDERAL' : 'SENADOR';
		const perfilRico = perfilMap.get(String(p.id)) || perfilMap.get(p.nome.trim().toLowerCase());

		const cpf = perfilRico?.cpf ? String(perfilRico.cpf).replace(/\D/g, '') : null;
		const foto = p.id
			? `https://uvzynmgwfmdsdrwvgbsy.supabase.co/storage/v1/object/public/fotos-politicos/${p.id}.jpg`
			: null;

		politicosToInsert.push({
			cpf: cpf || undefined,
			nome_civil: perfilRico?.nome || p.nome,
			nome_urna: p.nome,
			data_nascimento: perfilRico?.data_nascimento || null,
			uf_naturalidade: p.uf || null,
			foto_url: foto,
			biografia: `Parlamentar em exercício: ${cargo} por ${p.uf} (${p.partido || 'Sem Partido'})`,
			_meta: {
				orgaoId,
				cargo,
				partido: p.partido,
				anoInicio: 2023,
				anoFim: 2026,
				idOriginal: p.id
			}
		});
	}

	// B. Presidentes
	for (const pres of PRESIDENTES_EXTRA) {
		const orgaoId = orgaosMap.get(pres.orgaoSigla);
		politicosToInsert.push({
			nome_civil: pres.nome,
			nome_urna: pres.nomeUrna,
			uf_naturalidade: pres.uf,
			foto_url: pres.foto,
			biografia: `Presidente da República do Brasil (${pres.partido})`,
			_meta: {
				orgaoId,
				cargo: pres.cargo,
				partido: pres.partido,
				anoInicio: pres.anoInicio,
				anoFim: pres.anoFim || null
			}
		});
	}

	// C. Municipais e Estaduais Integrados (Aracaju, RJ, SP, Governadores)
	for (const mun of municipaisIndex as any[]) {
		let orgaoSigla = 'CMA';
		if (mun.orgao === 'CMA') orgaoSigla = 'CMA';
		else if (mun.orgao === 'CMRJ') orgaoSigla = 'CMRJ';
		else if (mun.orgao === 'CMSP') orgaoSigla = 'CMSP';
		else if (mun.casa === 'PREFEITURA') {
			if (mun.uf === 'SE') orgaoSigla = 'PMA';
			else if (mun.uf === 'RJ') orgaoSigla = 'PCRJ';
			else if (mun.uf === 'SP') orgaoSigla = 'PMSP';
		} else if (mun.casa === 'GOVERNO_ESTADUAL') {
			if (mun.uf === 'SE') orgaoSigla = 'GOV_SE';
			else if (mun.uf === 'RJ') orgaoSigla = 'GOV_RJ';
			else if (mun.uf === 'SP') orgaoSigla = 'GOV_SP';
		}

		const orgaoId = orgaosMap.get(orgaoSigla);
		const cargoNorm = (mun.cargo || 'Vereador').toUpperCase().replace(/\s+/g, '_');

		politicosToInsert.push({
			nome_civil: mun.nome,
			nome_urna: mun.nome,
			uf_naturalidade: mun.uf,
			biografia: `${mun.cargo || 'Agente Público'} em ${mun.municipio || mun.uf} (${mun.orgao || mun.partido})`,
			_meta: {
				orgaoId,
				cargo: cargoNorm,
				partido: mun.partido,
				anoInicio: 2025,
				anoFim: 2028
			}
		});
	}

	console.log(`   📦 Total de ${politicosToInsert.length} agentes políticos estruturados para inserção.`);

	// 4. Inserção em lotes de politicos e geração de mandatos
	console.log('\n4. Gravando politicos e mandatos no Supabase...');
	let totalPoliticos = 0;
	let totalMandatos = 0;

	for (const item of politicosToInsert) {
		const meta = item._meta;
		const payload = {
			cpf: item.cpf || null,
			nome_civil: item.nome_civil,
			nome_urna: item.nome_urna,
			data_nascimento: item.data_nascimento || null,
			uf_naturalidade: item.uf_naturalidade || null,
			foto_url: item.foto_url || null,
			biografia: item.biografia || null
		};

		// Tenta buscar se já existe por nome ou CPF
		let politicoId: string | null = null;
		let query = supabase.from('politicos').select('id');
		if (payload.cpf) {
			query = query.eq('cpf', payload.cpf);
		} else {
			query = query.eq('nome_civil', payload.nome_civil);
		}

		const { data: existente } = await query.limit(1).maybeSingle();

		if (existente?.id) {
			politicoId = existente.id;
			await supabase.from('politicos').update(payload).eq('id', politicoId);
		} else {
			const { data: novo, error: errNovo } = await supabase
				.from('politicos')
				.insert(payload)
				.select('id')
				.single();

			if (novo?.id) {
				politicoId = novo.id;
				totalPoliticos++;
			} else if (errNovo) {
				// Se deu conflito de CPF, tenta recuperar
				const { data: recuperado } = await supabase
					.from('politicos')
					.select('id')
					.eq('nome_civil', payload.nome_civil)
					.maybeSingle();
				if (recuperado?.id) politicoId = recuperado.id;
			}
		}

		// Cria/atualiza o mandato
		if (politicoId && meta?.orgaoId) {
			const mandatoPayload = {
				politico_id: politicoId,
				orgao_id: meta.orgaoId,
				cargo: meta.cargo,
				partido: meta.partido || null,
				ano_inicio: meta.anoInicio || 2023,
				ano_fim: meta.anoFim || null,
				situacao: 'TITULAR'
			};

			const { error: errMandato } = await supabase
				.from('mandatos')
				.upsert(mandatoPayload, {
					onConflict: 'politico_id,orgao_id,cargo,ano_inicio'
				});

			if (!errMandato) {
				totalMandatos++;
			}
		}
	}

	console.log(`\n====================================================`);
	console.log(`✅ SEED CONCLUÍDO COM SUCESSO!`);
	console.log(`   - Órgãos públicos: ${orgaosMap.size}`);
	console.log(`   - Políticos cadastrados: ${totalPoliticos}`);
	console.log(`   - Mandatos vinculados: ${totalMandatos}`);
	console.log(`====================================================`);
}

seed().catch(err => {
	console.error('❌ Erro fatal durante seed:', err);
	process.exit(1);
});
