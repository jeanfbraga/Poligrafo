import * as cheerio from 'cheerio';


async function test() {
    console.log("Fetching HTML...");
    const html = await fetch("https://www.camara.leg.br/deputados/220593/pessoal-gabinete?ano=2024").then(res => res.text());
    const $ = cheerio.load(html);
    
    console.log("Parsing table...");
    const servidores = [];
    $('.tabela-padrao tbody tr').each((i, el) => {
        const nome = $(el).find('td').eq(0).text().trim();
        const cargo = $(el).find('td').eq(1).text().trim();
        const periodo = $(el).find('td').eq(2).text().trim();
        if (nome) {
            servidores.push({ nome, cargo, periodo });
        }
    });

    console.log("Result:", servidores.slice(0, 5));
}

test();
