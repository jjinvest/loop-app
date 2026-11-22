'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('AKITEMM reutiliza fotos privadas do LOOP em ambos os papeis e sessoes',()=>{
 const js=fs.readFileSync(path.join(__dirname,'..',
  'src/producao/interface-aprovada-loja.js'),'utf8');
 assert.match(js,/const clienteComFoto=!visitante&&typeof clienteNick==='string'/);
 assert.match(js,/\(!operadorAtivo\|\|visaoClienteLoja\)/);
 assert.match(js,/const semCliente=res.status===401\|\|\(operadorAtivo&&!visaoClienteLoja\)/);
 assert.match(js,/operadorAtivo\?'\/api\/admin\/operador\/foto-perfil':null/);
 assert.match(js,/data-foto-sessao/);
 assert.match(js,/fotoTitular\.naturalWidth>0/);
 assert.match(js,/fotoTitular\.src=caminho\+'\?versao='/);
});
