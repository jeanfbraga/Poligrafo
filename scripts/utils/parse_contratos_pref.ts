import fs from 'fs';
import * as cheerio from 'cheerio';

const html = fs.readFileSync('scripts/utils/aracaju_contratos_pref.html', 'utf-8');
const $ = cheerio.load(html);

console.log('Title:', $('title').text());
console.log('Iframes/Links:');
$('iframe, a').each((_, el) => {
	const src = $(el).attr('src') || $(el).attr('href') || '';
	const text = $(el).text().replace(/\s+/g, ' ').trim();
	if (src.includes('contrato') || src.includes('licitacao') || src.includes('aracaju') || src.includes('se.gov')) {
		console.log($(el).prop('tagName'), src, text.substring(0, 80));
	}
});
