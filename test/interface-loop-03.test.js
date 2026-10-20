'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');
const raiz=path.resolve(__dirname,'..','src','laboratorio');
const ler=nome=>readFileSync(path.join(raiz,nome),'utf8');

test('LOOP 3.0 integra escritorio real e duas abas sem criar aplicativo paralelo',()=>{
 const html=ler('participante-demo.html');
 const js=ler('loop-03-shell.js');
 const css=ler('loop-03-shell.css');
 const cosmos=ler('loop-30-cosmos.css');
 assert.match(html,/\/laboratorio\/loop-03-shell.js/);
 assert.match(html,/\/laboratorio\/loop-03-shell.css/);
 assert.match(html,/\/laboratorio\/loop-30-cosmos\.css/);
 assert.ok(html.indexOf('/laboratorio/loop-03-shell.css')<
  html.indexOf('/laboratorio/loop-30-cosmos.css'));
 assert.match(cosmos,/@keyframes loop30Nebulosa/);
 assert.match(cosmos,/@keyframes loop30Estrelas/);
 assert.match(cosmos,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(cosmos,/\.loop03-pagina::before/);
 assert.match(cosmos,/\.loop03-pagina::after/);
 assert.match(cosmos,/#loop03-tabuleiro \.loop03-mapa-grade/);
 assert.ok(html.indexOf('/css/loop-futurista-v6.css')<html.indexOf('/laboratorio/loop-03-shell.css'));
 assert.match(js,/shell\.prepend\(shell\.querySelector\('\.loop03-banner-topo'\)\)/);
 for(const area of ['home','tabuleiro','posicoes','rede','financeiro']){
  assert.match(js,new RegExp('id="loop03-'+area+'"'));
 }
 assert.match(js,/LOOP <span>3\.0<\/span>/);
 assert.doesNotMatch(js,/LOOP (?:0\.3|<span>0\.3<\/span>|<em>0\.3<\/em>)/);
 assert.match(ler('admin-loop03.html'),/LOOP <em>3\.0<\/em>/);
 assert.match(ler('participante-demo.html'),/<title>LOOP 3\.0/);
 assert.match(js,/PLATAFORMA DE CICLOS INTELIGENTES/);
 assert.match(js,/ESTRATÉGIA · ORGANIZAÇÃO · RESULTADOS/);
 assert.match(js,/Giros/);
 assert.match(js,/loop03Giros24/);
 assert.match(js,/loop03Publicacoes/);
 assert.doesNotMatch(js,/id="loop03-ativacoes"|loop03DistribuirIndicacao|loop03AtivacoesLista/);
 // Seis destinos exatos, uma unica lateral sem ativacoes.
 const indiceMenu=js.indexOf('<nav aria-label="Áreas do escritório">');
 assert.ok(indiceMenu>=0);
 const menu=js.slice(indiceMenu,js.indexOf('</nav>',indiceMenu));
 const identificadores=[...menu.matchAll(/data-loop03-aba="([^"]+)"|href="(\/loja)"/g)]
  .map(m=>m[1]||m[2]);
 assert.deepEqual(identificadores,
  ['home','tabuleiro','posicoes','rede','financeiro','/loja']);
 assert.doesNotMatch(menu,/Ativações|Ativacoes|Minhas Ativações/i);
 assert.match(css,/\.loop03-atalhos-legados\{display:none!important\}/);
 assert.match(js,/loop03-grade-posicoes/);
 assert.match(js,/Espaço disponível/);
 assert.match(js,/Indicações: /);
 assert.match(js,/loop03-cpf-cartao/);
 assert.match(js,/loop03TermosFundo/);
 assert.match(css,/loop03-status-confirmacao-pendente/);
 assert.match(js,/loop03-cartao-selo/);
 assert.match(css,/loop03-cartao-identidade/);
 assert.match(js,/loop03-pendencia-ponto/);
 assert.match(js,/loop03-equipe-linha/);
 assert.match(js,/loop03-fila-equipe-/);
 assert.match(css,/#loop03ListaEquipe\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(js,/id="loop03Numero">#0000/);
 assert.match(js,/window\.Loop03Shell/);
 assert.match(css,/loop03-mapa-grade/);
 assert.match(css,/loop03-iluminada/);
 const participante=ler('participante-demo.js');
 // Dourado nao tem letra; A e branco na bola amarela; B e preto na branca.
 assert.match(participante,/simbolo\.textContent=p\.cor==='DOURADO'\?'':filaA\?'A':'B'/);
 assert.match(participante,/POSICAO_AZUL_NAO_PODE_ENTRAR_NA_FILA_A/);
 assert.match(css,/loop03-inicial-fila\.loop03-a:not\(\.loop03-dourada\)/);
 assert.match(css,/loop03-inicial-fila\.loop03-b:not\(\.loop03-dourada\):not\(\.loop03-azul\)/);
 assert.match(css,/loop03-inicial-fila\.loop03-azul/);
 assert.match(css,/loop03-bonequinho-indicacoes/);
 assert.match(participante,/convitesValidadosFilaA\[i\]/);
 assert.match(participante,/loop03-quantidade-a-direita/);
 assert.match(participante,/dados\.append\(boneco,quantidade\)/);
 assert.match(participante,/dados\.append\(referencia\)/);
 assert.match(js,/id="loop03RedeTotalPosicoes">0/);
 assert.match(js,/id="loop03RedeADistribuir">0/);
 assert.match(js,/visao\.contadoresRede\?\.aDistribuir/);
 assert.match(css,/loop03-cabecalho-equipe/);
 assert.match(participante,/referencia\.textContent='#'\+p\.posicaoId;/);
 assert.doesNotMatch(participante,/Minha: '\+nomeTitular/);
 assert.match(participante,/elementoPosicao\(valor,'Número'\)/);
 assert.match(participante,/bloco\.dataset\.vagaNumero=classe\.slice\(5\)/);
 assert.match(participante,/indice\.className='loop03-indice-vaga-visivel'/);
 assert.match(cosmos,/\.espaco-tabuleiro-demo>\.loop03-indice-vaga-visivel/);
 assert.match(participante,/numero\.textContent='#'\+valor\.posicaoId/);
 assert.match(participante,/valor\.minha&&typeof nomeTitular==='string'/);
 assert.match(participante,/nome\.textContent=nomeTitular\.trim\(\)/);
 assert.match(cosmos,/loop03-ocupante-identidade/);
 assert.match(cosmos,/content:attr\(data-vaga-numero\)!important/);
 assert.match(participante,/valor\?\.cor==='DOURADO'/);
 assert.match(js,/id="loop03CoroaVisor"/);
 assert.match(js,/e\('loop03CoroaVisor'\)\.hidden=!dentroDaCatraca/);
 assert.doesNotMatch(participante,/nomeDeTerceiro/);
 assert.match(css,/loop03-inicial-fila/);

 assert.match(css,/loop03-aceso/);
 assert.match(css,/marcos-v6 span:nth-child\(even\)/);
 assert.doesNotThrow(()=>new Function(js));
 const lojaCss=ler('loja-cliente-demo.css');
 assert.match(lojaCss,/produto-loja-loop\.produto-loja-loop-especial/);
 assert.match(lojaCss,/#e8bc58/); // ouro no contorno
 assert.match(lojaCss,/#5a318e/); // roxo na tarja
 assert.doesNotMatch(lojaCss,/#e14b52|#ad1a29|#ed5353/); // tarja vermelha descartada
});

test('publicacoes escolhidas pelo administrador tem apenas leitura publica, sem dados internos',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});
 t.after(()=>repo.fechar());
 const segredo='chave-escritorio-local-0.3-teste';
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo}).listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const rota=base+'/api/laboratorio/loop03/publicacoes';
 const resposta=await fetch(rota);
 assert.equal(resposta.status,200);
 assert.deepEqual((await resposta.json()).publicacoes,[]);
 const corpo={tipo:'AKITEMM',titulo:'Vitrine AKITEMM',
  descricao:'Produtos selecionados pelo operador para apresentacao na loja.',linkDestino:'/loja'};
 const post=await fetch(base+'/api/admin/escritorio-demo/publicacoes',{
  method:'POST',
  headers:{Authorization:'Bearer '+segredo,'Content-Type':'application/json'},
  body:JSON.stringify(corpo)
 });
 assert.equal(post.status,201);
 const lista=await (await fetch(rota)).json();
 assert.equal(lista.publicacoes.length,1);
 assert.equal(lista.publicacoes[0].titulo,corpo.titulo);
 assert.equal(lista.publicacoes[0].linkDestino,'/loja');
 assert.equal(Object.hasOwn(lista.publicacoes[0],'id'),false);
 assert.equal(Object.hasOwn(lista.publicacoes[0],'situacao'),false);
 assert.equal((await fetch(base+'/laboratorio/loop-03-shell.js')).status,200);
 assert.equal((await fetch(base+'/laboratorio/loop-03-shell.css')).status,200);
});

test('marcos do ciclo usam contagem REAL do motor de laboratorio, sem registrar pagamento',()=>{
 const dominio=readFileSync(path.resolve(raiz,'..','domain','escritorio-individual-demo.js'),'utf8');
 const shell=ler('loop-03-shell.js');
 assert.match(dominio,/simulador\.tabuleiro\.vendasDoCiclo\.length/);
 assert.match(dominio,/modo:'LABORATORIO_SEM_PAGAMENTOS'/);
 assert.match(shell,/visao\.progressoCiclo\?\.eventosValidos/);
 assert.match(shell,/i<etapa/);
 assert.match(shell,/andamento ainda nao disponivel/);
 // Nenhum contador do motor deve ser simulado com temporizador.
 // O UNICO setInterval permitido nesta tela troca FOTOS REAIS da AKITEMM,
 // sem criar pedido, saldo, movimento do tabuleiro ou evento financeiro.
 assert.match(shell,/if\(vitrineLista\.length>1\)intervaloVitrine=setInterval/);
 const semRotacaoVitrine=shell.replace(/let vitrineLista=\[\];[\s\S]*?function encerrar\(\)/,'function encerrar()');
 assert.doesNotMatch(semRotacaoVitrine,/setInterval\(/);
});


test('template administrativo: segundo caixa, reservas e capacidade estimada nao sao saldo bancario',()=>{
 const html=ler('financeiro-admin-demo.html'),js=ler('financeiro-admin-demo.js');
 for(const id of ['caixa2BrutoFinanceiroDemo','caixa2BonusFinanceiroDemo',
  'caixa2DouradasFinanceiroDemo','caixa2GestaoFinanceiroDemo',
  'caixa2LivreFinanceiroDemo','caixaCentralSeparadoFinanceiroDemo',
  'caixa2CapacidadeFinanceiroDemo','atualizarCaixa2FinanceiroDemo']){
  assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(js,new RegExp(id));
 }
 assert.match(js,/Math\.floor\(livre\/valor\)/);
 assert.match(html,/não autorização/);
 assert.match(js,/Sem banco|Nenhum dinheiro bancário/);
});
