import fs from 'fs';
import * as cheerio from 'cheerio';

const html = fs.readFileSync('scripts/utils/aracaju_portal_contratos.html', 'utf-8');
const $ = cheerio.load(html);

console.log('Title:', $('title').text());
console.log('Inputs / Selects / Form actions:');
$('input, select, form').each((_, el) => {
	const id = $(el).attr('id') || $(el).attr('name') || '';
	const type = $(el).attr('type') || $(el).prop('tagName');
	console.log(type, id);
});
