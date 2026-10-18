'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');

const raiz=path.resolve(__dirname,'..');
const arquivos=Object.freeze({
  "catraca.backup.js": "d805c8c2ebb895f45aa8b15d52858764321b93fc",
  "catraca.backup2.js": "25a2cbb44f519e16ba0deb9974d8a138836ea2a9",
  "filas.backup.js": "213dde40ed5c779e13d2fa98e481bc8bc48d6c1c",
  "filas.backup2.js": "332d711e25e9b2627c5a422cdadd0351e7365f70"
});
function hashBlobGit(bytes){
 return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
}

test('backups de rotas antigos ficam isolados, imutaveis em conteudo e fora de src/routes',()=>{
 for(const [nome,shaEsperado] of Object.entries(arquivos)){
  const origem=path.join(raiz,'src','routes',nome);
  const arquivo=path.join(raiz,'archive','legacy','routes',nome+'.txt');
  assert.equal(fs.existsSync(origem),false,'backup executavel nao pode permanecer: '+nome);
  assert.equal(fs.existsSync(arquivo),true,'backup deve ser preservado: '+nome);
  assert.equal(hashBlobGit(fs.readFileSync(arquivo)),shaEsperado,'backup alterado: '+nome);
 }
 const sobras=fs.readdirSync(path.join(raiz,'src','routes')).filter(nome=>/\.backup(?:\d+)?\.js$/i.test(nome));
 assert.deepEqual(sobras,[],'novo backup executavel adicionado as rotas ativas');
});

test('aplicacao continua usando rotas ativas e proibe imports de backups legados',()=>{
 const server=fs.readFileSync(path.join(raiz,'src','server.js'),'utf8');
 assert.match(server,/require\(['"]\.\/routes\/filas['"]\)/);
 assert.match(server,/require\(['"]\.\/routes\/catraca['"]\)/);
 assert.match(server,/require\(['"]\.\/middleware\/proteger-simulacao['"]\)/);
 assert.doesNotMatch(server,/\.backup|archive\/legacy/);
 const texto=fs.readFileSync(path.join(raiz,'docs','ISOLAMENTO_PROTOTIPOS_ANTIGOS_LOOP_03.md'),'utf8');
 assert.match(texto,/NÃO foram eliminados/);
 assert.match(texto,/COMANDO_MESTRE_LOOP_03_CONTINUIDADE/);
});
