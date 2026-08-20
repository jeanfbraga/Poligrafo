import fs from 'fs';
import * as cheerio from 'cheerio';

const html = fs.readFileSync('scripts/utils/aracaju_contrato_page.html', 'utf-8');
const $ = cheerio.load(html);

console.log('Title:', $('title').text());
console.log('Forms/Inputs/Links:');
$('form, a, table').each((_, el) => {
	const href = $(el).attr('href') || $(el).attr('action') || '';
	const text = $(el).text().replace(/\s+/g, ' ').trim();
	if (href || text) {
		console.log($(el).prop('tagName'), href, text.substring(0, 100));
	}
});
