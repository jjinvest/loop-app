'use strict';
// Provas adversariais com livro externo FICTICIO independente do carrinho.
// Nao usa PSP, webhook, dinheiro, pagamento ou CPF real.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {CarrinhoLojaLoopDemoSQLite}=require('../src/domain/carrinho-loja-loop-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {SolicitacoesSaqueDemoSQLite}=require('../src/domain/solicitacoes-saque-demo-sqlite');
const {disponibilidadeCofreDemo}=require('../src/domain/disponibilidade-cofres-v6-demo-sqlite');
const {auditarEntregasEstornosCarrinhoDemo}=require('../src/domain/auditoria-entregas-estornos-carrinho-demo');
const {auditarIntegridadeOperacionalDemo}=require('../src/domain/auditoria-integridade-operacional-demo');
const {auditarExtratoPspFicticioLoop}=require('../src/domain/auditoria-extrato-psp-ficticio-loop');

const AGORA='2036-09-20T12:00:00.000Z';
const SENHA='senha-segura-de-laboratorio-2026';
const REF='LOOP-DEMO-V1';
function produto(id,tipo,valor){
 return {id,nome:'Produto ficticio '+id,tipo,estado:'PUBLICADO',
  descricao:'Somente testes',precoCentavos:valor,
  entrega:tipo==='PDF'?'DOWNLOAD_APOS_CONFIRMACAO':'FORNECEDOR_INTEGRADO',
  fotos:[],videoApresentacaoUrl:null,detalhes:[]};
}
function abrir(caminho){
 const repo=new RepositorioCatalogoSQLite({caminho});
 if(!repo.buscar('pdf-250'))repo.salvar({produto:produto('pdf-250','PDF',25000),revisaoEsperada:0});
 if(!repo.buscar('pdf-100'))repo.salvar({produto:produto('pdf-100','PDF',10000),revisaoEsperada:0});
 if(!repo.buscar('fisico-190'))repo.salvar({produto:produto('fisico-190','FISICO',19000),revisaoEsperada:0});
 const banco=repo.banco;
 const contas=new ContasParticipantesDemoSQLite({banco});
 const pedidosIdentificados=new PedidosTitularidadeDemoSQLite({banco,contas,relogio:()=>AGORA});
 let carrinhos;
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco,contas,pedidosIdentificados,atribuicaoManualPorPosicao:true,
  relogio:()=>AGORA,consultarPagamentoConfiavel:async id=>carrinhos.comprovanteConfirmado(id)
 });
 carrinhos=new CarrinhoLojaLoopDemoSQLite({catalogo:repo,contas,pedidosIdentificados,ponte,
  relogio:()=>AGORA});
 return {repo,banco,contas,pedidosIdentificados,ponte,carrinhos,
  adesoes:new AdesoesPosicoesDemoSQLite({ponte,relogio:()=>AGORA}),
  saques:new SolicitacoesSaqueDemoSQLite({
   banco,contas,links:ponte.linksComissoes,relogio:()=>AGORA})};
}
function cadastro(m,id,codigoIndicador){
 return m.contas.cadastrar({nome:'Conta Auditoria '+id,
  email:'auditoria-'+id+'@exemplo.invalid',senha:SENHA,
  ...(codigoIndicador?{codigoIndicador}:{})});
}
function criar(m,conta,id,produtoId){
 const c=m.carrinhos.criar({pedidoId:id,contaId:conta.contaId,
  itens:[{produtoId,quantidade:1}]});
 return c;
}
function event(m,pedidoId,tipo,id){
 return m.carrinhos.registrarEvento({pedidoId,tipo,eventoId:id});
}
async function confirmar(m,id,eventoId){
 event(m,id,'CONFIRMAR_FICTICIO',eventoId);
 return m.carrinhos.sincronizar(id);
}
function externo(m,pedidoId,tipo,eventoId,extras={}){
 const p=m.pedidosIdentificados.buscar(pedidoId);
 return {pedidoId,tipo,eventoId,intentoPagamentoId:p.intentoPagamentoId,
  valorCentavos:p.valorCentavos,...extras};
}
function auditar(m,eventos){
 return auditarExtratoPspFicticioLoop({carrinhos:m.carrinhos,eventosExternosFicticios:eventos});
}
function pos(m){
 return m.banco.prepare('SELECT COUNT(*) AS n FROM admin_ponte_compras_demo').get().n;
}
function reserva(m){
 return m.banco.prepare(`SELECT COALESCE(SUM(valor_centavos),0) AS n
  FROM admin_comissoes_reserva_v2_demo`).get().n;
}
function snapshot(m){
 return JSON.stringify({estado:m.ponte._restaurar().exportarSnapshot(),
  posicoes:pos(m),bonus:reserva(m),
  saques:m.banco.prepare('SELECT COUNT(*) AS n FROM admin_solicitacoes_saque_demo').get().n,
  pedidos:m.carrinhos.listar().pedidos.map(x=>[x.pedidoId,x.situacaoPagamentoFicticio])});
}
function linha(d,id){return d.linhas.find(p=>p.pedidoId===id);}
function alertas(d,id){return linha(d,id).alertas;}
function validarIntegridade(m){
 assert.equal(Object.values(m.banco.prepare('PRAGMA integrity_check').get())[0],'ok');
 assert.deepEqual(m.banco.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(auditarIntegridadeOperacionalDemo(m.ponte).totalAlertas,0);
}
test('extrato independente confere PDF e fisico, ignora replay identico sem duplicar posicao',
 {timeout:90000},async t=>{
 const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-audit-psp-ok-'));
 t.after(()=>rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'pedidos.sqlite');
 let m=abrir(arquivo);
 t.after(()=>{try{m.repo.fechar()}catch{}});
 const a=cadastro(m,'pdf-ok'),b=cadastro(m,'fisico-ok');
 criar(m,a,'pedido-psp-pdf','pdf-250');
 criar(m,b,'pedido-psp-fisico','fisico-190');
 assert.equal((await confirmar(m,'pedido-psp-pdf','local-pdf-conf')).posicaoCriada,true);
 assert.equal((await confirmar(m,'pedido-psp-fisico','local-fisico-conf')).posicaoCriada,false);
 const p=externo(m,'pedido-psp-pdf','CONFIRMACAO_FICTICIA','extrato-pdf');
 const q=externo(m,'pedido-psp-fisico','CONFIRMACAO_FICTICIA','extrato-fisico');
 const antes=snapshot(m);
 const r=auditar(m,[p,q,p,q]);
 assert.equal(r.situacao,'SEM_DIVERGENCIAS_NESTA_AMOSTRA');
 assert.equal(r.totais.reenviosIdenticosIgnorados,2);
 assert.equal(r.totais.pedidosComAlertas,0);
 assert.equal(pos(m),1);
 assert.equal(snapshot(m),antes,'Auditoria nao escreve no SQLite');
 m.repo.fechar();
 m=abrir(arquivo);
 assert.equal(auditar(m,[q,p,p]).situacao,'SEM_DIVERGENCIAS_NESTA_AMOSTRA');
 assert.equal(snapshot(m),antes);
 validarIntegridade(m);
 console.log('LOOP_CONCILIACAO_EXTRATO_OK='+JSON.stringify({
  pedidos:2,confirmacoesExternasFicticias:2,replaysIdenticos:2,
  posicoesUnicas:1,integridade:'ok',somenteLeitura:true,pspReal:false}));
});
test('estorno independente identifica posicao, bonus, saque simulado e preserva reservas',
 {timeout:90000},async t=>{
 const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-audit-psp-refund-'));
 t.after(()=>rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'refund.sqlite');
 let m=abrir(arquivo);
 t.after(()=>{try{m.repo.fechar()}catch{}});
 const a=cadastro(m,'indicador');
 criar(m,a,'pedido-indicador','pdf-100');
 await confirmar(m,'pedido-indicador','local-base');
 m.adesoes.ativar({contaId:a.contaId,
  cpfFicticio:'11144477735',aceitaTermos:true,versaoTermos:REF});
 const b=cadastro(m,'indicado',a.codigoConvite);
 criar(m,b,'pedido-indicado-estorno','pdf-250');
 assert.equal((await confirmar(m,'pedido-indicado-estorno','local-indicado')).posicaoCriada,true);
 const q=m.carrinhos.buscar('pedido-indicado-estorno').posicaoId;
 const ac=m.adesoes.ativar({contaId:b.contaId,posicaoId:q,
  cpfFicticio:'12345678909',aceitaTermos:true,versaoTermos:REF});
 assert.equal(ac.bonificacoes.length,1);
 assert.equal(reserva(m),2500);
 const saque=m.saques.registrar({contaId:a.contaId,
  solicitacaoId:'saque-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  tipo:'BONUS',valorSolicitadoCentavos:2500});
 assert.equal(saque.taxaPercentual,0);
 assert.equal(saque.valorLiquidoCentavos,2500);
 const ext=[
  externo(m,'pedido-indicador','CONFIRMACAO_FICTICIA','psp-base'),
  externo(m,'pedido-indicado-estorno','CONFIRMACAO_FICTICIA','psp-ven'),
  externo(m,'pedido-indicado-estorno','ESTORNO_FICTICIO','psp-refund')
 ];
 const antes=snapshot(m);
 const r=auditar(m,ext);
 assert.equal(r.situacao,'EXIGE_REVISAO');
 assert.deepEqual(alertas(r,'pedido-indicado-estorno'),[
  'ESTORNO_EXTERNO_NAO_REFLETIDO_LOCALMENTE',
  'ESTORNO_EXTERNO_COM_POSICAO_PRESERVADA',
  'ESTORNO_EXTERNO_COM_BONUS_PROVISIONADO',
  'INDICADOR_COM_SAQUE_SIMULADO_E_ESTORNO',
  'POSICAO_SEM_COBERTURA_DO_EXTRATO_FICTICIO'
 ]);
 assert.equal(r.totais.estornosExternosValidos,1);
 assert.equal(r.totais.posicoesExpostas,1);
 assert.equal(r.totais.bonusProvisionadoExpostoCentavos,2500);
 assert.equal(r.totais.indicadoresComSolicitacaoDeSaqueSimulada,1);
 assert.equal(snapshot(m),antes);
 assert.equal(disponibilidadeCofreDemo(m.banco,{
  cofreId:'LOOP_DIREITA',saldoBrutoCentavos:50000}).saldoLivreDemonstrativoCentavos,47500);
 // Estorno LOCAL tambem e historico; nao apaga posicao nem reversao financeira.
 event(m,'pedido-indicado-estorno','ESTORNAR_FICTICIO','local-estorno-indicado');
 const l=auditar(m,ext);
 assert.ok(!alertas(l,'pedido-indicado-estorno').includes('ESTORNO_EXTERNO_NAO_REFLETIDO_LOCALMENTE'));
 assert.ok(alertas(l,'pedido-indicado-estorno').includes('ESTORNO_EXTERNO_COM_POSICAO_PRESERVADA'));
 assert.equal(auditarEntregasEstornosCarrinhoDemo({carrinhos:m.carrinhos}).totais.estornadosComComissao,1);
 assert.equal(reserva(m),2500);
 validarIntegridade(m);
 m.repo.fechar();
 m=abrir(arquivo);
 assert.equal(auditar(m,ext).totais.bonusProvisionadoExpostoCentavos,2500);
 assert.equal(reserva(m),2500);
 validarIntegridade(m);
 console.log('LOOP_CONCILIACAO_ESTORNO='+JSON.stringify({
  estornoIndependenteDetectado:true,posicoesExpostas:1,
  bonusProvisionadoCentavos:2500,solicitacaoSaqueSimuladaCentavos:2500,
  taxaParticipanteCentavos:0,caixaLivreDemonstrativoCentavos:47500,
  aposReinicio:true,estornoAutomatico:false,pspReal:false}));
});
test('divergencias: pagamento local sem extrato; extra pendente; estorno local sem comprovante',
 async t=>{
 const m=abrir(':memory:');t.after(()=>m.repo.fechar());
 const a=cadastro(m,'divergencias');
 criar(m,a,'pedido-sem-extrato','pdf-250');
 await confirmar(m,'pedido-sem-extrato','local-sem-extrato');
 criar(m,a,'pedido-pendente','pdf-100');
 criar(m,a,'pedido-estorno-local','pdf-100');
 await confirmar(m,'pedido-estorno-local','local-estorno-base');
 event(m,'pedido-estorno-local','ESTORNAR_FICTICIO','local-estorno-final');
 const eventos=[
  externo(m,'pedido-pendente','CONFIRMACAO_FICTICIA','psp-pendente'),
  externo(m,'pedido-estorno-local','CONFIRMACAO_FICTICIA','psp-nao-estornado')
 ];
 const antes=snapshot(m),r=auditar(m,eventos);
 assert.deepEqual(alertas(r,'pedido-sem-extrato'),[
  'CONFIRMACAO_LOCAL_SEM_EXTRATO_EXTERNO',
  'POSICAO_SEM_COBERTURA_DO_EXTRATO_FICTICIO']);
 assert.deepEqual(alertas(r,'pedido-pendente'),['EXTRATO_CONFIRMADO_MAS_LOCAL_PENDENTE']);
 assert.deepEqual(alertas(r,'pedido-estorno-local'),['ESTORNO_LOCAL_NAO_COMPROVADO_NO_EXTRATO']);
 assert.equal((await m.carrinhos.sincronizar('pedido-pendente')).situacao,'AGUARDANDO_PAGAMENTO');
 assert.equal(pos(m),1);
 assert.equal(snapshot(m),antes);
 validarIntegridade(m);
});
test('adulteracao de valor/intento, evento orfao, duplicidade de IDs e confirmacoes distintas',
 async t=>{
 const m=abrir(':memory:');t.after(()=>m.repo.fechar());
 const pessoa=cadastro(m,'fraude');
 criar(m,pessoa,'pedido-fraude','pdf-250');
 await confirmar(m,'pedido-fraude','local-fraude');
 const ok=externo(m,'pedido-fraude','CONFIRMACAO_FICTICIA','evento-falso-1');
 const eventos=[
  ok,
  {...ok,eventoId:'evento-valor',valorCentavos:25001},
  {...ok,eventoId:'evento-intento',intentoPagamentoId:'intent-falso'},
  {...ok,eventoId:'evento-falso-1',valorCentavos:20000},
  {...ok,eventoId:'evento-falso-2'},
  {...ok,eventoId:'evento-falso-2'},
  {...ok,eventoId:'evento-sem-pedido',pedidoId:'pedido-desconhecido'}
 ];
 const antes=snapshot(m),r=auditar(m,eventos);
 assert.equal(r.situacao,'EXIGE_REVISAO');
 assert.equal(r.totais.idsConflitantes,1);
 assert.equal(r.totais.reenviosIdenticosIgnorados,1);
 assert.equal(r.totais.eventosExternosOrfaos,1);
 assert.deepEqual(alertas(r,'pedido-fraude'),[
  'ID_EXTERNO_CONFLITANTE','VALOR_EXTERNO_DIVERGENTE',
  'INTENTO_EXTERNO_DIVERGENTE','CONFIRMACOES_EXTERNAS_MULTIPLAS']);
 assert.equal(r.alertasGlobais.length,2);
 assert.equal(pos(m),1);
 assert.equal(snapshot(m),antes);
 assert.ok(!JSON.stringify(r).includes(pessoa.contaId));
 assert.ok(!JSON.stringify(r).includes(pessoa.email));
 assert.throws(()=>auditar(m,[{...ok,valorCentavos:NaN}]),TypeError);
 assert.throws(()=>auditar(m,null),TypeError);
 validarIntegridade(m);
 console.log('LOOP_CONCILIACAO_DIVERGENCIAS='+JSON.stringify({
  eventosFicticios:7,replayIdenticoIgnorado:1,identificadoresConflitantes:1,
  eventosOrfaos:1,valorDivergenteDetectado:true,intentoDivergenteDetectado:true,
  confirmacoesDuasFontesDetectadas:true,dadosPessoaisNoRelatorio:false,
  alteracaoPosicoes:false}));
});
