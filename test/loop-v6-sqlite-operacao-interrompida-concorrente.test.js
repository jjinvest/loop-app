'use strict';
// Carga de integraçao LOCAL: persistencia real SQLite em arquivo temporario.
// Uma unica transacao comercial produz um único registro; não cria dinheiro,
// CPF real, pagamentos Pix nem afirma 5000 conexões simultâneas.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {AdesoesPosicoesDemoSQLite}=require('../src/domain/adesoes-posicoes-demo-sqlite');
const {EscritorioIndividualDemo}=require('../src/domain/escritorio-individual-demo');
const {SolicitacoesSaqueDemoSQLite}=require('../src/domain/solicitacoes-saque-demo-sqlite');
const {disponibilidadeCofreDemo}=require('../src/domain/disponibilidade-cofres-v6-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

const SEGREDO='senha-segura-de-laboratorio-2026';
const INSTANTE='2036-09-20T12:00:00.000Z';
const REF='LOOP-DEMO-V1';

function prepararCenario(caminho,provas){
 const repositorio=new RepositorioCatalogoSQLite({caminho});
 const banco=repositorio.banco;
 const contas=new ContasParticipantesDemoSQLite({banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({banco,contas,relogio:()=>INSTANTE});
 const ponte=new PonteComprasConvitesDemoSQLite({banco,contas,pedidosIdentificados:pedidos,
  atribuicaoManualPorPosicao:true,relogio:()=>INSTANTE,
  consultarPagamentoConfiavel:async id=>provas.get(id)});
 return {repositorio,banco,contas,pedidos,ponte,
  adesoes:new AdesoesPosicoesDemoSQLite({ponte,relogio:()=>INSTANTE}),
  escritorio:new EscritorioIndividualDemo({contas,ponte}),
  saques:new SolicitacoesSaqueDemoSQLite({banco,contas,links:ponte.linksComissoes,relogio:()=>INSTANTE})};
}
function provar(m,provas,conta,id,valor,tipo='PDF'){
 const produtoId=tipo==='PDF'?'pdf-referencia-250':'produto-fisico-190';
 const pedido=m.pedidos.preparar({pedidoId:id,contaId:conta.contaId,
  produtoId,valorCentavos:valor});
 provas.set(id,{...pedido,confirmadoEm:INSTANTE,status:STATUS_CONFIRMADO});
 return id;
}
const sqlN=(b,sql,...params)=>b.prepare(sql).get(...params).n;
function contagens(b){
 return {
  vendasPDF:sqlN(b,'SELECT COUNT(*) AS n FROM admin_ponte_compras_demo'),
  vendasFisicas:sqlN(b,'SELECT COUNT(*) AS n FROM admin_ponte_vendas_loja_sem_loop_demo'),
  posicoes:sqlN(b,'SELECT COUNT(DISTINCT posicao_id) AS n FROM admin_ponte_compras_demo'),
  bonus:sqlN(b,'SELECT COALESCE(SUM(valor_centavos),0) AS n FROM admin_comissoes_reserva_v2_demo'),
  vinculos:sqlN(b,'SELECT COUNT(*) AS n FROM admin_loop_vinculos_indicacao_posicao_demo'),
  saques:sqlN(b,'SELECT COUNT(*) AS n FROM admin_solicitacoes_saque_demo')
 };
}

test('integração SQLite: 1000 pedidos, duplicatas cruzadas, falha de pagamento, reinício físico e painéis isolados',async t=>{
 const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-v6-sqlite-reinicio-'));
 t.after(()=>rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'clientes.sqlite');
 const provas=new Map();
 let m=prepararCenario(arquivo,provas);
 t.after(()=>{try{m.repositorio.fechar()}catch{}});
 const clientes=[];
 let processados=0,duplicados=0,reaberturas=0;
 for(let i=1;i<=500;i++){
  const conta=m.contas.cadastrar({nome:'Cliente Carga '+String(i).padStart(4,'0'),
   email:'carga-'+i+'@exemplo.invalid',senha:SEGREDO});
  clientes.push(conta);
  const codigo=String(i).padStart(4,'0');
  const idPDF=provar(m,provas,conta,'sql-'+codigo+'-pdf',25000);
  const idFisico=provar(m,provas,conta,'sql-'+codigo+'-fisico',19000,'FISICO');
  // Chamadas concorrentes no mesmo event loop: entrega de webhook repetida
  // por dois consumidores, idempotencia de banco e de contrato do pedido.
  const respostas=await Promise.all([
   m.ponte.processar({pedidoId:idPDF}),
   m.ponte.processar({pedidoId:idPDF}),
   m.ponte.processar({pedidoId:idFisico}),
   m.ponte.processar({pedidoId:idFisico})
  ]);
  assert.equal(respostas.filter(r=>r.criado===true).length,2);
  assert.equal(respostas.filter(r=>r.repetido===true).length,2);
  assert.equal(respostas.filter(r=>r.posicaoCriada===true).length,2);
  assert.equal(respostas.filter(r=>r.compraElegivelLoop===false).length,2);
  assert.equal(respostas.filter(r=>r.posicaoCriada===false).length,2);
  processados+=2;duplicados+=2;
  if(i===250){
   const antes=contagens(m.banco);
   assert.deepEqual([antes.vendasPDF,antes.vendasFisicas],[250,250]);
   m.repositorio.fechar();
   m=prepararCenario(arquivo,provas);
   reaberturas++;
   assert.deepEqual(contagens(m.banco),antes);
   // Repita pedidos de ANTES do reinicio; nenhuma cadeira extra pode nascer.
   for(const j of [1,30,60,90,120,150,200,250]){
    const id='sql-'+String(j).padStart(4,'0')+'-pdf';
    assert.equal((await m.ponte.processar({pedidoId:id})).repetido,true);
    duplicados++;
   }
   const sample=m.escritorio.consultar(clientes[4].contaId);
   assert.equal(sample.posicoes.length,1);
   assert.equal(sample.comprasLojaSemLoop.length,1);
   assert.equal(sample.vagasLivres,5);
  }
 }
 const final=contagens(m.banco);
 assert.deepEqual([final.vendasPDF,final.vendasFisicas,final.posicoes],[500,500,500]);
 assert.equal(final.bonus,0,'Compras azuis sem confirmação verde não reservam 10%');
 assert.equal(final.vinculos,0,'Não promover pessoas ou cadeiras sem aceite individual');
 assert.equal(final.saques,0);
 assert.equal(sqlN(m.banco,'SELECT COUNT(*) AS n FROM admin_ponte_posicoes_adicionais_demo'),0);
 assert.equal(sqlN(m.banco,'SELECT COUNT(DISTINCT conta_id) AS n FROM admin_ponte_compras_demo'),500);
 const perfilIds=[1,50,119,120,121,180,240,300,400,500];
 for(const j of perfilIds){
  const perfil=m.escritorio.consultar(clientes[j-1].contaId);
  assert.equal(perfil.posicoes.length,1);
  assert.equal(perfil.comprasLojaSemLoop.length,1);
  assert.equal(perfil.vagasLivres,5);
  assert.equal(perfil.posicoes[0].contaId,undefined,'Visão deve ser do próprio titular');
 }
 // Simulacao de falha do PSP interno ANTES de confirmar: sem registro/posição.
 const comprador=clientes[0];
 const pendente=provar(m,provas,comprador,'sql-pagamento-pendente',25000);
 provas.set(pendente,{...provas.get(pendente),status:'PENDENTE'});
 await assert.rejects(m.ponte.processar({pedidoId:pendente}),
  e=>e.codigo==='PAGAMENTO_NAO_CONFIRMADO');
 assert.deepEqual(contagens(m.banco),final);
 provas.set(pendente,{...provas.get(pendente),status:STATUS_CONFIRMADO});
 const recuperado=await m.ponte.processar({pedidoId:pendente});
 assert.equal(recuperado.posicaoCriada,true);
 assert.equal((await m.ponte.processar({pedidoId:pendente})).repetido,true);
 assert.equal(contagens(m.banco).vendasPDF,501);
 // PSP adulterado: nao muda titular, preco ou valor persistido.
 const idOriginal='sql-0001-pdf',copia=provas.get(idOriginal);
 provas.set(idOriginal,{...copia,valorCentavos:19000});
 await assert.rejects(m.ponte.processar({pedidoId:idOriginal}),
  e=>['VINCULO_DIVERGENTE','PEDIDO_DIVERGENTE'].includes(e.codigo));
 provas.set(idOriginal,copia);
 assert.equal((await m.ponte.processar({pedidoId:idOriginal})).repetido,true);
 assert.equal(contagens(m.banco).vendasPDF,501);
 // Duas conexões SQL independentes: o mesmo pedido chega a dois consumidores.
 // O banco deve registrar uma única compra, mesmo com Promise.all entre instâncias.
 const outra=prepararCenario(arquivo,provas);
 try{
  const idCompeticao=provar(m,provas,clientes[3],'sql-duas-conexoes-competem',25000);
  const [x,y]=await Promise.all([
   m.ponte.processar({pedidoId:idCompeticao}),
   outra.ponte.processar({pedidoId:idCompeticao})
  ]);
  assert.deepEqual([x,y].map(r=>r.repetido).sort(),[false,true]);
  assert.equal(contagens(m.banco).vendasPDF,502);
  assert.equal(contagens(outra.banco).vendasPDF,502);
  assert.equal(m.escritorio.consultar(clientes[3].contaId).posicoes.length,2);
  assert.equal(outra.escritorio.consultar(clientes[3].contaId).posicoes.length,2);
 }finally{outra.repositorio.fechar();}
 // Snapshot inválido dentro do teste: a transação falha e nunca deixa uma compra parcial.
 const snapshotAntes=m.banco.prepare('SELECT snapshot_json AS j FROM admin_ponte_estado_demo WHERE id=1').get().j;
 const quebra=provar(m,provas,clientes[1],'sql-quebra-snapshot',25000);
 m.banco.prepare("UPDATE admin_ponte_estado_demo SET snapshot_json='json-invalido' WHERE id=1").run();
 await assert.rejects(m.ponte.processar({pedidoId:quebra}),/Snapshot de laboratorio corrompido/);
 assert.equal(contagens(m.banco).vendasPDF,502);
 m.banco.prepare('UPDATE admin_ponte_estado_demo SET snapshot_json=? WHERE id=1').run(snapshotAntes);
 assert.equal((await m.ponte.processar({pedidoId:quebra})).posicaoCriada,true);
 assert.equal(contagens(m.banco).vendasPDF,503);
 const integridade=m.banco.prepare('PRAGMA integrity_check').get();
 assert.equal(Object.values(integridade)[0],'ok');
 const chaves=m.banco.prepare('PRAGMA foreign_key_check').all();
 assert.deepEqual(chaves,[]);
 console.log('LOOP_SQLITE_STRESS='+JSON.stringify({
  compradores:500,pedidosAprovados:1003,pedidosFisicos:500,pedidosPdf:503,
  escritoresSqliteIndependentes:2,
  duplicatasIgnoradas:duplicados+3,reaberturasBanco:reaberturas,
  falhasDePagamentoSemPosicao:1,errosDeSnapshotSemVendaParcial:1,
  visoesIndividuaisConferidas:perfilIds.length+1,
  comprovacaoBancariaReal:false,sqliteIntegridade:'ok'
 }));
});

test('SQLite: 2 cadeiras do titular, 2 verdes vinculados individualmente, bonus, saque, reserva e reinício',async t=>{
 const pasta=mkdtempSync(path.join(os.tmpdir(),'loop-v6-bonus-reinicio-'));
 t.after(()=>rmSync(pasta,{recursive:true,force:true}));
 const arquivo=path.join(pasta,'financeiro.sqlite'),provas=new Map();
 let m=prepararCenario(arquivo,provas);
 t.after(()=>{try{m.repositorio.fechar()}catch{}});
 const titular=m.contas.cadastrar({nome:'Titular Reserva',email:'titular@exemplo.invalid',senha:SEGREDO});
 const convidados=[
  m.contas.cadastrar({nome:'Convidado Alfa',email:'alfa@exemplo.invalid',
   senha:SEGREDO,codigoIndicador:titular.codigoConvite}),
  m.contas.cadastrar({nome:'Convidado Beta',email:'beta@exemplo.invalid',
   senha:SEGREDO,codigoIndicador:titular.codigoConvite})
 ];
 async function compra(c,id){
  provar(m,provas,c,id,25000);
  return m.ponte.processar({pedidoId:id});
 }
 const primeira=await compra(titular,'titular-reserva-1');
 const segunda=await compra(titular,'titular-reserva-2');
 assert.equal(m.escritorio.consultar(titular.contaId).posicoes.length,2);
 const adesao=(contaId,posicaoId,cpfFicticio)=>m.adesoes.ativar({
  contaId,posicaoId,cpfFicticio,aceitaTermos:true,versaoTermos:REF
 });
 adesao(titular.contaId,primeira.posicaoId,'11144477735');
 adesao(titular.contaId,segunda.posicaoId);
 const id1=await compra(convidados[0],'verde-indicado-1');
 const id2=await compra(convidados[1],'verde-indicado-2');
 assert.equal(contagens(m.banco).bonus,0,'Não bonificar azul');
 assert.equal(m.escritorio.consultar(titular.contaId).contadoresRede.totalIndicacoesConfirmadas,0);
 assert.throws(()=>m.ponte.atribuirIndicacao({
  contaId:titular.contaId,convidadoId:convidados[0].contaId,
  posicaoId:primeira.posicaoId
 }),e=>e.codigo==='INDICADO_AGUARDANDO_ATIVACAO');
 const a=adesao(convidados[0].contaId,id1.posicaoId,'12345678909');
 const b=adesao(convidados[1].contaId,id2.posicaoId,'52998224725');
 assert.deepEqual(a.bonificacoes.map(x=>x.valorComissaoCentavos),[2500]);
 assert.deepEqual(b.bonificacoes.map(x=>x.valorComissaoCentavos),[2500]);
 assert.equal(contagens(m.banco).bonus,5000);
 const primeiroVinculo=m.ponte.atribuirIndicacao({contaId:titular.contaId,
  convidadoId:convidados[0].contaId,posicaoId:primeira.posicaoId});
 assert.equal(primeiroVinculo.repetida,false);
 assert.equal(m.ponte.atribuirIndicacao({contaId:titular.contaId,
  convidadoId:convidados[0].contaId,posicaoId:primeira.posicaoId}).repetida,true);
 assert.throws(()=>m.ponte.atribuirIndicacao({contaId:titular.contaId,
  convidadoId:convidados[0].contaId,posicaoId:segunda.posicaoId}),
  e=>e.codigo==='INDICACAO_JA_VINCULADA');
 const visao=m.escritorio.consultar(titular.contaId);
 assert.equal(visao.contadoresRede.totalIndicacoesConfirmadas,2);
 assert.equal(visao.contadoresRede.jaDistribuidas,1);
 assert.equal(visao.contadoresRede.aDistribuir,1);
 assert.equal(visao.posicoes.find(p=>p.posicaoId===segunda.posicaoId).indicacoesRecebidas,0);
 const idSaque='saque-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
 const tentativa=()=>m.saques.registrar({contaId:titular.contaId,solicitacaoId:idSaque,
  tipo:'BONUS',valorSolicitadoCentavos:2500});
 const saque=tentativa();
 assert.equal(saque.repetida,false);
 assert.equal(saque.origemExclusiva,'LOOP_DIREITA');
 assert.equal(saque.valorLiquidoCentavos,2425);
 assert.equal(tentativa().repetida,true);
 assert.equal(m.saques.consultar(titular.contaId).bonusDisponivelSimuladoCentavos,2500);
 assert.equal(m.saques.consultar(convidados[0].contaId).historico.length,0);
 // O livro da reserva deve reduzir pela comissão, e NÃO reduzir novamente
 // porque foi solicitado saque (compromisso já registrado).
 const cofre=disponibilidadeCofreDemo(m.banco,{cofreId:'LOOP_DIREITA',
  saldoBrutoCentavos:50000});
 assert.equal(cofre.compromissoBonificacoesCentavos,5000);
 assert.equal(cofre.saldoLivreDemonstrativoCentavos,45000);
 assert.equal(m.banco.prepare('PRAGMA foreign_key_check').all().length,0);
 m.repositorio.fechar();
 m=prepararCenario(arquivo,provas);
 assert.equal(contagens(m.banco).bonus,5000);
 assert.equal(contagens(m.banco).vinculos,1);
 assert.equal(contagens(m.banco).saques,1);
 assert.equal(m.ponte.atribuirIndicacao({contaId:titular.contaId,
  convidadoId:convidados[0].contaId,posicaoId:primeira.posicaoId}).repetida,true);
 assert.equal(m.saques.registrar({contaId:titular.contaId,solicitacaoId:idSaque,
  tipo:'BONUS',valorSolicitadoCentavos:2500}).repetida,true);
 const segundoVinculo=m.ponte.atribuirIndicacao({contaId:titular.contaId,
  convidadoId:convidados[1].contaId,posicaoId:segunda.posicaoId});
 assert.equal(segundoVinculo.repetida,false);
 const visaoFinal=m.escritorio.consultar(titular.contaId);
 assert.equal(visaoFinal.contadoresRede.jaDistribuidas,2);
 assert.equal(visaoFinal.contadoresRede.aDistribuir,0);
 assert.equal(visaoFinal.posicoes.find(p=>p.posicaoId===primeira.posicaoId).indicacoesRecebidas,1);
 assert.equal(visaoFinal.posicoes.find(p=>p.posicaoId===segunda.posicaoId).indicacoesRecebidas,1);
 assert.equal(contagens(m.banco).bonus,5000);
 assert.equal(disponibilidadeCofreDemo(m.banco,{cofreId:'LOOP_DIREITA',
  saldoBrutoCentavos:50000}).saldoLivreDemonstrativoCentavos,45000);
 console.log('LOOP_SQLITE_FINANCEIRO='+JSON.stringify({
  clientes:3,posicoes:4,verdesConfirmados:2,
  indicacoesVinculadas:2,bonusApenasVerdesCentavos:5000,
  solicitacoesSaque:1,taxaSaqueCentavos:0,
  reservaBrutaSimuladaCentavos:50000,compromissoBonusCentavos:5000,
  reservaLivreSimuladaCentavos:45000,
  reinicioConservouHistorico:true,pagamentoReal:false
 }));
});
