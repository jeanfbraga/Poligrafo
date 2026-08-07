import * as cheerio from 'cheerio';

async function run() {
  const url = `https://www.camara.leg.br/deputados/209787/pessoal-gabinete?ano=2024`;
  const res = await fetch(url, {
      headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  $('.table tbody tr').slice(0, 5).each((i, el) => {
    const tds = $(el).find('td');
    console.log(i, $(tds[0]).text().trim(), '|', $(tds[1]).text().trim(), '|', $(tds[2]).text().trim(), '|', $(tds[3]).text().trim());
  });
}
run();
