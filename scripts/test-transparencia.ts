import { buscarEmendas } from "../../src/app/api/investigar/etl_extractors";
import { buscarConveniosTransferegov } from "../../src/services/integrations/transferegov/client";

async function main() {
	const start = Date.now();
	console.log("Iniciando buscarEmendas...");
	const { emendas } = await buscarEmendas("Glauber de Medeiros Braga");
	console.log(`buscarEmendas finalizou em ${Date.now() - start}ms com ${emendas.length} itens.`);

	// We can test CNPJ for TCU/Convenios. Glauber doesn't have a CNPJ, but let's test a slow endpoint.
}

main().catch(console.error);
