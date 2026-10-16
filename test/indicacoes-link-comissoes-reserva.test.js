'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');
const {simularElegibilidadeSaque,extrairLink}=require('../src/domain/indicacoes-links-comissoes-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {criarAppAdminLaboratorio}=require('../src/laboratorio/servidor-catalogo');

test('link so ativa apos compra pequena, comissao por posicao e versoes 10%, 20%, 30% no caixa reserva',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const comprovantes=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({banco:repo.banco,contas,
  consultarPagamentoConfiavel:async id=>comprovantes.get(id)});
 const links=ponte.linksComissoes;
 // Datas ficticias crescentes: taxa nova nao reescreve movimentos passados.
 const dia=(n)=>'2030-01-'+String(n).padStart(2,'0')+'T12:00:00.000Z';
 const comprar=(id,conta,valor,quando)=> {
  comprovantes.set(id,{pedidoId:id,contaId:conta.contaId,produtoId:'curso-testado',
   valorCentavos:valor,confirmadoEm:dia(quando),status:STATUS_CONFIRMADO});
  return ponte.processar({pedidoId:id});
 };
 const a=contas.cadastrar({nome:'Indicador So Comissão',email:'indicador@exemplo.invalid',
  senha:'senha-ficticia-123456'});
 const alias=links.personalizar({contaId:a.contaId,apelido:'Vilela'});
 assert.equal(alias.apelido,'vilela');
 assert.equal(alias.ativo,false);
 assert.equal(extrairLink(alias.link).token,a.codigoConvite);
 assert.equal(links.resolver(alias.link).ativo,false);
 assert.equal(links.comissoesDaConta(a.contaId).totalSimuladoCentavos,0);
 // A primeira compra de qualquer valor ativa apenas o link, sem cadeira.
 const loja=await comprar('indicador-compra-50',a,5000,1);
 assert.equal(loja.posicaoCriada,false);
 assert.equal(loja.linkDivulgacaoLiberado,true);
 assert.equal(links.linkDaConta(a.contaId).ativo,true);
 assert.equal(ponte.consultar().filas.B.quantidade,0);
 // CPF + aceite sao possiveis depois de R$ 50, sem comprar cadeira.
 const adesoes=new AdesoesPosicoesDemoSQLite({ponte,relogio:()=>dia(1).replace('T12:00','T12:30')});
 assert.equal(adesoes.ativar({contaId:a.contaId,cpfFicticio:'11144477735',
  aceitaTermos:true,versaoTermos:'LOOP-DEMO-V1'}).ativadas,0);
 assert.equal(links.habilitadoBonificacoes(a.contaId,dia(2)),true);
 const b=contas.cadastrar({nome:'Comprador Convidado',email:'convidado@exemplo.invalid',
  senha:'senha-ficticia-123456',codigoIndicador:a.codigoConvite});
 const pequeno=await comprar('pedido-convidado-100',b,10000,2);
 assert.equal(pequeno.posicaoCriada,false);
 assert.equal(links.comissoesDaConta(a.contaId).quantidade,0);
 const primeira=await comprar('pedido-convidado-250',b,25000,3);
 assert.equal(primeira.posicaoCriada,true);
 assert.equal(primeira.comissaoSimuladaCentavos,2500);
 assert.equal(ponte.consultar().filas.A.quantidade,0,'indicador sem cadeira nao precisa estar na fila');
 assert.equal((await ponte.processar({pedidoId:'pedido-convidado-250'})).repetido,true);
 assert.equal(links.comissoesDaConta(a.contaId).quantidade,1);
 assert.equal(links.comissoesDaConta(a.contaId).faltaParaMinimoCentavos,0);
 assert.throws(()=>simularElegibilidadeSaque({
  saldoSimuladoCentavos:2500,valorSolicitadoCentavos:2400,cpfTermosConfirmados:true
 }),e=>e.codigo==='MINIMO_SAQUE_25_REAIS');
 // Proxima compra maior nao altera comissao da cadeira unica.
 const extra=await comprar('pedido-convidado-500',b,50000,4);
 assert.equal(extra.comissaoSimuladaCentavos,2500);
 // A taxa de 20% passa a valer a partir da revisao 2.
 links.taxas.agora=()=>dia(5);
 assert.equal(links.taxas.alterar({percentual:20,revisaoEsperada:1}).revisao,2);
 const vinte=await comprar('pedido-convidado-20',b,25000,6);
 assert.equal(vinte.comissaoSimuladaCentavos,2500);
 assert.equal(vinte.percentualBonusAplicado,10);
 assert.equal(vinte.indicadorElegivelBonusExtra,false);
 links.taxas.agora=()=>dia(7);
 assert.equal(links.taxas.alterar({percentual:30,revisaoEsperada:2}).revisao,3);
 const trinta=await comprar('pedido-convidado-30',b,25000,8);
 assert.equal(trinta.comissaoSimuladaCentavos,2500);
 assert.equal(trinta.indicadorElegivelBonusExtra,false);
 // O indicador compra sua propria posicao de R$250 no minimo vigente.
 // Sua posicao agora nasce ativa pois CPF e termos ja estavam confirmados.
 const posicaoPropria=await comprar('indicador-entra-loop',a,25000,9);
 assert.equal(posicaoPropria.posicaoCriada,true);
 assert.equal(posicaoPropria.statusAdesao,'ATIVA');
 const depoisDeEntrar=await comprar('pedido-convidado-com-bonus',b,25000,10);
 assert.equal(depoisDeEntrar.comissaoSimuladaCentavos,7500);
 assert.equal(depoisDeEntrar.percentualBonusAplicado,30);
 assert.equal(depoisDeEntrar.indicadorElegivelBonusExtra,true);
 const extrato=links.comissoesDaConta(a.contaId);
 assert.equal(extrato.quantidade,5);
 assert.equal(extrato.totalSimuladoCentavos,17500);
 assert.equal(extrato.atingiuMinimoSaque,true);
 assert.equal(extrato.minimoSaqueCentavos,2500);
 assert.equal(extrato.porcentagemAtual.percentual,30);
 assert.deepEqual(extrato.registros.map(x=>x.percentual),[10,10,10,10,30]);
 assert.deepEqual(extrato.registros.map(x=>x.valorCentavos),[2500,2500,2500,2500,7500]);
 assert.ok(extrato.registros.every(x=>x.cofreOrigem==='LOOP_DIREITA'));
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS total FROM admin_comissoes_reserva_v2_demo').get().total,5);
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS total FROM admin_comissoes_criterio_v2_demo WHERE ativo_no_loop=1').get().total,1);
 assert.equal(repo.banco.prepare('SELECT COUNT(*) AS total FROM admin_comissoes_indicacoes_demo').get().total,0);
 assert.deepEqual(simularElegibilidadeSaque({
  saldoSimuladoCentavos:17500,valorSolicitadoCentavos:10000,cpfTermosConfirmados:true
 }).transferenciaExecutada,false);
 // Rate changes do not touch already-created rows.
 assert.equal((await ponte.processar({pedidoId:'pedido-convidado-250'})).repetido,true);
 assert.equal(links.comissoesDaConta(a.contaId).totalSimuladoCentavos,17500);
 // O apelido nao muda o rastreio, links antigos seguem funcionando.
 const antigo=alias.link;
 const novo=links.personalizar({contaId:a.contaId,apelido:'Minha Rede'});
 assert.match(novo.link,/minha-rede/);
 assert.equal(links.resolver(antigo).indicadorId,a.contaId);
 assert.equal(links.resolver(novo.link).indicadorId,a.contaId);
 assert.equal(links.resolver(antigo).ativo,true);
});
test('painel controla porcentagem, convite inativo nao cadastra e link ativo cria conta sem CPF',async t=>{
 const repo=new RepositorioCatalogoSQLite({caminho:':memory:'});t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const root=contas.cadastrar({nome:'Origem Link Ficticio',email:'origem@exemplo.invalid',
  senha:'senha-ficticia-123456'});
 const segredo='token-admin-bonificacao-teste-2026-123456789';
 const server=criarAppAdminLaboratorio({repositorio:repo,segredo}).listen(0,'127.0.0.1');
 await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const headers={'Content-Type':'application/json',Authorization:'Bearer '+segredo};
 const admin=async(method,url,body)=>{
  const r=await fetch(base+'/api/admin/'+url,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json()};
 };
 const link='/laboratorio/convite/'+root.codigoConvite+'/vilela';
 const entrar=async(nome)=>{
  const response=await fetch(base+'/api/laboratorio/convite/cadastrar',{
   method:'POST',headers:{'Content-Type':'application/json','X-LOOP-LAB':'convite'},
   body:JSON.stringify({nome,email:nome.replaceAll(' ','-')+'@exemplo.invalid',
    telefone:'(24) 99999-8611',senha:'senha-ficticia-123456',link})
  });
  return {status:response.status,body:await response.json()};
 };
 const q=await fetch(base+'/api/laboratorio/convite/estado?link='+encodeURIComponent(link));
 assert.equal((await q.json()).cadastroPermitido,false);
 assert.equal((await entrar('Pessoa Impedida')).status,403);
 const pagina=await fetch(base+link);
 assert.equal(pagina.status,200);
 assert.match(await pagina.text(),/formConviteCliente/);
 const taxa=await admin('GET','indicacoes-taxa-demo');
 assert.equal(taxa.status,200);
 assert.equal(taxa.data.atual.percentual,10);
 assert.equal(taxa.data.origemExclusiva,'LOOP_DIREITA');
 assert.equal((await admin('POST','indicacoes-taxa-demo',{percentual:20,revisaoEsperada:1})).status,200);
 assert.equal((await admin('POST','indicacoes-taxa-demo',{percentual:101,revisaoEsperada:2})).status,400);
 assert.equal((await admin('POST','indicacoes-taxa-demo',{percentual:30,revisaoEsperada:1})).status,409);
 assert.equal((await admin('GET','indicacoes-taxa-demo')).data.atual.percentual,20);
 // Uma venda de R$50 e somente da loja, libera link.
 const links=require('../src/domain/indicacoes-links-comissoes-demo-sqlite');
 const servico=new links.IndicacoesLinksComissoesDemoSQLite({banco:repo.banco,contas});
 assert.equal(servico.linkDaConta(root.contaId).ativo,false);
 // Sem evento financeiro no browser: inject fixture confirmada em tabelas de teste.
 repo.banco.prepare(`INSERT INTO admin_ponte_vendas_loja_sem_loop_demo(
  pedido_id,conta_id,produto_id,valor_centavos,confirmado_em)
  VALUES (?,?,?,?,?)`).run('produto-50-link',root.contaId,'curso',5000,
   new Date().toISOString());
 assert.equal(servico.linkDaConta(root.contaId).ativo,true);
 const resolvido=await entrar('Pessoa Convidada');
 assert.equal(resolvido.status,201);
 assert.equal(resolvido.body.posicaoCriada,false);
 assert.equal(resolvido.body.linkDoNovoCliente.ativo,false);
 const encontrado=contas.buscar(resolvido.body.contaId);
 assert.equal(encontrado.indicadoPorId,root.contaId);
 assert.equal(encontrado.cpfColetado,false);
 const administracao=await(await fetch(base+'/admin/cadastro-participantes-demo')).text();
 assert.match(administracao,/formTaxaIndicacaoDemo/);
 assert.match(administracao,/percentualIndicacaoDemo/);
});
