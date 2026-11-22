'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const raiz=path.resolve(__dirname,'..');
const ler=p=>fs.readFileSync(path.join(raiz,p),'utf8');
test('foto da AKITEMM lê a mesma origem autenticada de cliente ou operador',()=>{
 const s=ler('src/producao/interface-aprovada-loja.js');
 assert.match(s,/\/api\/admin\/operador\/foto-perfil/);
 assert.match(s,/\/api\/contas\/foto-perfil/);
 assert.match(s,/const bloqueado=visitante&&!operadorAtivo;/);
 assert.match(s,/const caminho=bloqueado\?null:operadorAtivo\?/);
 assert.doesNotMatch(s,/operadorAtivo&&visaoClienteLoja\)\)/);
 assert.match(s,/caminhoFotoAtual!==caminho/);
 assert.match(s,/consulta===consultaFotoLoja\)fotoTitular.hidden=false/);
 assert.match(s,/credentials:'same-origin',cache:'no-store'/);
 assert.match(s,/r.headers.get\('content-type'\)/);
 assert.match(s,/fotoTitular.src=url/);
});
test('loja real invalida cache do Android sem alterar o template visual aprovado',()=>{
 const r=ler('src/producao/interface-aprovada-loop.js');
 assert.match(r,/interface-aprovada-loja\.js/);
 assert.match(r,/loja\.js\?rev=/);
 assert.match(r,/createHash\('sha256'\)/);
 const original=ler('src/laboratorio/loja-cliente-demo.html');
 assert.match(original,/id="akitemmFotoTitular"/);
});

test('AKITEMM não duplica controle de visão que pertence ao LOOP',()=>{
 const op=ler('src/producao/operador-loja-fotos-real.js');
 assert.doesNotMatch(op,/function sincronizarAlternanciaVisao/);
 assert.doesNotMatch(op,/Visão do Administrador|Visão do Cliente/);
 assert.match(op,/document.getElementById\('akitemmAlternarVisao'\)\?\.remove\(\)/);
});
