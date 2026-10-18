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

test('LOOP 0.3 integra escritorio real e duas abas sem criar aplicativo paralelo',()=>{
 const html=ler('participante-demo.html');
 const js=ler('loop-03-shell.js');
 const css=ler('loop-03-shell.css');
 assert.match(html,/\/laboratorio\/loop-03-shell.js/);
 assert.match(html,/\/laboratorio\/loop-03-shell.css/);
 for(const area of ['home','tabuleiro','posicoes','rede','financeiro']){
  assert.match(js,new RegExp('id="loop03-'+area+'"'));
 }
 assert.match(js,/LOOP <span>0\.3<\/span>/);
 assert.match(js,/PLATAFORMA DE CICLOS INTELIGENTES/);
 assert.match(js,/ESTRATÉGIA · ORGANIZAÇÃO · RESULTADOS/);
 assert.match(js,/Giros/);
 assert.match(js,/loop03Giros24/);
 assert.match(js,/loop03Publicacoes/);
 assert.doesNotMatch(js,/id="loop03-ativacoes"|loop03DistribuirIndicacao|loop03AtivacoesLista/);
 assert.match(js,/loop03-grade-posicoes/);
 assert.match(js,/Sem posição · Espaço disponível/);
 assert.match(js,/loop03-pendencia-ponto/);
 assert.match(js,/id="loop03Numero">#0000/);
 assert.match(js,/window\.Loop03Shell/);
 assert.match(css,/loop03-mapa-grade/);
 assert.match(css,/loop03-iluminada/);
 const participante=ler('participante-demo.js');
 assert.match(participante,/simbolo\.textContent=p\.cor==='DOURADO'\?'●':filaA\?'A':'B'/);
 assert.match(participante,/convitesValidadosFilaA\[i\]/);
 assert.match(participante,/p\.minha\?' · Minha: '\+nomeTitular/);
 assert.match(participante,/elementoPosicao\(valor,'Número'\)/);
 assert.doesNotMatch(participante,/nomeDeTerceiro/);
 assert.match(css,/loop03-inicial-fila/);

 assert.match(css,/loop03-aceso/);
 assert.match(css,/marcos-v6 span:nth-child\(even\)/);
 assert.doesNotThrow(()=>new Function(js));
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
 assert.doesNotMatch(shell,/setInterval\(/);
});
