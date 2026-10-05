// Menjalankan semua file *.test.js di folder tests dengan node:test bawaan.
const { run } = require('node:test');
const { spec } = require('node:test/reporters');
const fs = require('node:fs');
const path = require('node:path');

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).map((f) => path.join(__dirname, f));
run({ files }).on('test:fail', () => { process.exitCode = 1; }).compose(spec).pipe(process.stdout);
