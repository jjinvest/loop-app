'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const fonte=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');
test('central nao envia cadastro com campos incompletos e oferece atalho e foco',()=>{
 const js=fonte('src/producao/interface-admin-comercial-client.js');
 assert.match(js,/form\.noValidate=true/);
 assert.match(js,/if\(!guiaProdutoNovo\.validar\(\)\)return/);
 assert.match(js,/if\(!guiaOfertaNova\.validar\(\)\)return/);
 for(const id of ['novoProdutoId','novoProdutoTitulo','ofertaProdutoId','ofertaDistribuidorId','ofertaSku','ofertaPreco','ofertaPrioridade'])
  assert.ok(js.includes("'"+id+"'"),'Campo não verificado: '+id);
 assert.match(js,/setAttribute\('aria-invalid','true'\)/);
 assert.match(js,/scrollIntoView\(\{block:'center',behavior:'smooth'\}\)/);
});
test('loja valida taxa, cidades e dados do fornecedor antes de criar produto',()=>{
 const js=fonte('src/producao/operador-loja-fotos-real.js');
 assert.match(js,/erros\.push\(\.\.\.entrega\.validarCampos\(\)\)/);
 assert.match(js,/Informe a taxa de entrega, mesmo que seja 0,00/);
 assert.match(js,/FORNECEDOR_MANUAL','PLANILHA_CSV/);
 assert.match(js,/if\(detalhe\)detalhe\.open=true/);
 assert.match(js,/entrada\.style\.outline='2px solid/);
});
