const m = require('./en-block.js');
console.log('module keys', Object.keys(m));
const en = m.en;
console.log('en type', typeof en);
if (en) {
  const need = require('./i18n-keys.json');
  const missing = need.filter((k) => !(k in en));
  console.log('en keys', Object.keys(en).length);
  console.log('missing', missing.length);
  console.log(missing);
}
