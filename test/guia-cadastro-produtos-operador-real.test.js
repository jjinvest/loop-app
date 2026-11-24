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
 assert.match(js,/erros\.push\(\.\.\.entrega\.validarCampos\(\)/);
 assert.match(js,/Informe a taxa de entrega, mesmo que seja 0,00/);
 assert.match(js,/FORNECEDOR_MANUAL','PLANILHA_CSV/);
 assert.match(js,/if\(detalhe\)detalhe\.open=true/);
 assert.match(js,/entrada\.style\.outline='2px solid/);
 assert.match(js,/validarCampos\(\{paraVitrine=false\}=\{\}\)/);
 assert.match(js,/anuncio\.validarCampos\(\{paraVitrine:true\}\)/);
 assert.match(js,/if\(!foto\.temFoto\(\)\)/);
 assert.match(js,/Escolha uma foto de capa para publicar/);
 assert.match(js,/Informe o preço normal para exibir o produto na vitrine/);
 assert.match(js,/Para salvar na vitrine, corrija/);
 assert.match(js,/Corrigir e concluir este produto/);
 assert.doesNotMatch(js,/recortar\.type='checkbox'/);
 assert.match(js,/recortar\.textContent='Ajustar corte da foto \(opcional\)'/);
 assert.match(js,/recorteAtivo=!recorteAtivo/);
});

test('galeria profissional oferece dez fotos, capa, vídeo opcional e validação sem sair da ficha',()=>{
 const js=fonte('src/producao/operador-loja-fotos-real.js');
 const css=fonte('src/candidato/vitrine-horizontal.css');
 assert.match(js,/Array\.from\(\{length:10\},\(_,i\)=>editarFoto\(grade,i\+1\)\)/);
 assert.match(js,/Foto de capa/);
 assert.match(js,/previa\.width=1200;previa\.height=1200/);
 assert.match(js,/for\(const \{blob,posicao\} of imagens\)await salvarFoto/);
 assert.match(js,/await foto\.video\.salvar\(id,csrf\)/);
 assert.match(js,/produtoJaCriado\|\|informado\|\|idAutomatico/);
 assert.match(js,/const alvo=entrada\.type==='file'/);
 assert.match(js,/alvo\.scrollIntoView\(\{block:'center',behavior:'instant'\}\)/);
 assert.match(css,/\.akitemm-campo-pendente\{\s*border:2px solid #ff4d55!important/);
 assert.match(css,/\.akitemm-midia-grade/);
 const edicao=js.slice(js.indexOf('async function abrirProduto(id)'));
 assert.match(edicao,/const entrega=camposEntrega\(form\)/);
 assert.match(edicao,/foto\.carregar\(galeriaSalva\.fotos\)/);
});
