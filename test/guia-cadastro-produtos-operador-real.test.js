'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const fonte=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');
test('API exige classificação explícita, capa e preço; opcionais não bloqueiam e vídeo aceita Range',async t=>{
 const express=require('express'),{once}=require('node:events');
 const {montarRotasCatalogoMidiaOperador}=require('../src/producao/rotas-catalogo-midia-operador');
 const app=express();app.use(express.json());
 let explicita=false,fotos=[],preco=null,publicacoes=0;
 const banco={};
 const midia={repo:{banco,buscar:()=>({id:'produto'}),listar:()=>[]},
  fotos:{banco,salvar:()=>{},listar:()=>({fotos}),abrir:()=>{}},
  video:{estado:()=>({arquivoAnexado:true}),abrir:()=>({conteudo:Buffer.alloc(1024,7)})}};
 montarRotasCatalogoMidiaOperador({app,catalogoMidia:midia,
  catalogoPrincipal:{listarProdutosAdministrativos:()=>[],buscarProdutoAdministrativo:()=>({produtoId:'produto'}),
   atualizarDescricaoProduto:()=>{},ativarProduto:()=>{publicacoes++;return {ativo:true};}},
  anunciosManuais:{consultar:()=>({precoCentavos:preco})},
  classificacaoLoop:{listarRegras:()=>({produtos:[{produtoId:'produto',regraExplicita:explicita,cor:'VERDE'}]})},
  autorizarOperador:(_req,_res,next)=>next(),validarCsrf:(_req,_res,next)=>next()});
 const srv=app.listen(0,'127.0.0.1');await once(srv,'listening');
 t.after(()=>new Promise(resolve=>srv.close(resolve)));
 const base='http://127.0.0.1:'+srv.address().port+'/api/admin/catalogo-midia/produtos/produto';
 const publicar=async()=>{const r=await fetch(base+'/publicacao',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"ativo":true}'});return {status:r.status,...await r.json()};};
 assert.deepEqual((await publicar()).campos,['classificacao']);
 explicita=true;fotos=[{posicao:2}];
 assert.deepEqual((await publicar()).campos,['fotoCapa']);
 fotos=[{posicao:1}];assert.deepEqual((await publicar()).campos,['precoNormal']);
 preco=100;assert.equal((await publicar()).status,200);assert.equal(publicacoes,1);
 const r=await fetch(base+'/video/arquivo',{headers:{Range:'bytes=0-99'}});
 assert.equal(r.status,206);assert.equal((await r.arrayBuffer()).byteLength,100);
 assert.equal((await fetch(base+'/video/arquivo',{headers:{Range:'bytes=2048-'}})).status,416);
});
test('classificação cinza selecionada é gravada explicitamente, sem usar a cor padrão como confirmação',async()=>{
 const vm=require('node:vm'),js=fonte('src/producao/operador-loja-fotos-real.js');
 const a=js.indexOf(' async function salvarCor('),b=js.indexOf(' async function publicarFoto(',a);
 const chamadas=[];
 const ctx={fetchJson:async(rota,opcoes)=>{
  chamadas.push({rota,opcoes});
  return opcoes?{cor:'CINZA',revisao:1}:{produtos:[{produtoId:'produto',cor:'CINZA',minimo:1,roxasPorUnidade:0,revisao:0,regraExplicita:false}]};
 }};
 vm.runInNewContext(js.slice(a,b),ctx);
 await ctx.salvarCor('produto','csrf','CINZA');
 assert.equal(chamadas.length,2);
 assert.equal(JSON.parse(chamadas[1].opcoes.body).cor,'CINZA');
 assert.equal(JSON.parse(chamadas[1].opcoes.body).revisaoEsperada,0);
});
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
 assert.match(js,/while\(detalhe\)\{detalhe\.open=true/);
 assert.match(js,/entrada\.style\.outline='2px solid/);
 assert.match(js,/validarCampos\(\{paraVitrine=false\}=\{\}\)/);
 assert.match(js,/anuncio\.validarCampos\(\{paraVitrine:true\}\)/);
 assert.match(js,/if\(!foto\.temFoto\(\)&&!capaSalva\)/);
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
 assert.match(css,/\.akitemm-campo-pendente\{\s*border:2px solid #e6bd73!important/);
 assert.match(css,/\.akitemm-midia-grade/);
 const edicao=js.slice(js.indexOf('async function abrirProduto(id)'));
 assert.match(edicao,/const entrega=camposEntrega\(form\)/);
 assert.match(edicao,/foto\.carregar\(galeriaSalva\.fotos\)/);
});
