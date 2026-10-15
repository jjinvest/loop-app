'use strict';

// Percurso MACRO do LOOP realocado no motor de simulação.
// Confirma do cadastro ate a CONCLUSAO FICTICIA do centro.
// A passagem entre a ponte e o tabuleiro exige passo de admin
// SIMULADO neste teste; nao existe integracao operacional pronta.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {RepositorioCatalogoSQLite}=require('../src/domain/repositorio-catalogo-sqlite');
const {ContasParticipantesDemoSQLite}=require('../src/domain/contas-participantes-demo-sqlite');
const {PedidosTitularidadeDemoSQLite}=require('../src/domain/pedidos-titularidade-demo-sqlite');
const {PonteComprasConvitesDemoSQLite}=require('../src/domain/ponte-compras-convites-demo-sqlite');
const {STATUS_CONFIRMADO}=require('../src/domain/processador-pedidos-simulados');

const DESTINOS=['PARTICIPANTE','EMPRESA','PARTICIPANTE','EMPRESA','PARTICIPANTE'];

function cenario(t){
 const pasta=fs.mkdtempSync(path.join(os.tmpdir(),'loop-percurso-macro-'));
 t.after(()=>fs.rmSync(pasta,{recursive:true,force:true}));
 const repo=new RepositorioCatalogoSQLite({caminho:path.join(pasta,'macro.sqlite')});
 t.after(()=>repo.fechar());
 const contas=new ContasParticipantesDemoSQLite({banco:repo.banco});
 const pedidos=new PedidosTitularidadeDemoSQLite({
  banco:repo.banco,contas,relogio:()=> '2026-10-15T09:00:00.000Z'
 });
 const comprovantes=new Map();
 const ponte=new PonteComprasConvitesDemoSQLite({
  banco:repo.banco,contas,pedidosIdentificados:pedidos,
  consultarPagamentoConfiavel:async id=>comprovantes.get(id),
  relogio:()=> '2026-10-15T09:05:00.000Z'
 });
 return {repo,contas,pedidos,comprovantes,ponte};
}
function cadastrar(m,nome,email,codigoIndicador=null){
 return m.contas.cadastrar({nome,email,senha:'senha-macro-ficticia-2026',codigoIndicador});
}
async function comprar(m,pedidoId,contaId,status=STATUS_CONFIRMADO){
 const pedido=m.pedidos.preparar({
  pedidoId,contaId,produtoId:'curso-pdf-macro-ficticio',
  valorCentavos:25000
 });
 m.comprovantes.set(pedidoId,{
  pedidoId,contaId,produtoId:pedido.produtoId,
  valorCentavos:pedido.valorCentavos,
  intentoPagamentoId:pedido.intentoPagamentoId,
  status,confirmadoEm:'2026-10-15T09:10:00.000Z'
 });
 return m.ponte.processar({pedidoId});
}
function guardarTabuleiroPreenchido(m){
 // Somente fixture interna do teste: ponte ainda NAO possui
 // operacao integrada de 'iniciar tabuleiro' ou 'girar'.
 const simulador=m.ponte._restaurar();
 const inicio=simulador.prepararTabuleiro();
 assert.equal(inicio.vagas.length,5);
 assert.ok(inicio.centro);
 assert.ok(inicio.vagas.every(Boolean));
 m.repo.banco.prepare(
  'UPDATE admin_ponte_estado_demo SET snapshot_json=? WHERE id=1'
 ).run(JSON.stringify(simulador.exportarSnapshot()));
}
function simularCincoVendasEGiro(motor,ciclo){
 for(let ordem=1;ordem<=5;ordem++){
  const venda=motor.registrarVendaNoCicloSimulada({
   vendaId:'evento-de-venda-ficticia-'+ciclo+'-'+ordem
  });
  assert.equal(venda.repetida,false);
  assert.equal(venda.venda.destinoPrevisto,DESTINOS[ordem-1]);
  assert.equal(venda.elegivelParaGiro,ordem===5);
 }
 const repeticao=motor.registrarVendaNoCicloSimulada({
  vendaId:'evento-de-venda-ficticia-'+ciclo+'-5'
 });
 assert.equal(repeticao.repetida,true);
 return motor.tentarGiro();
}

test('macro completo: cadastro e compra → B → convite com compra → A → vaga 5,4,3,2,1 → centro → ciclo concluido',async t=>{
 const m=cenario(t);
 // Um tabuleiro anterior em funcionamento, como no exemplo do usuario.
 // Seis pessoas ficticias ocupam centro e vagas 1..5 antes de o
 // protagonista comprar e ser promovido para a fila A.
 for(let i=1;i<=6;i++){
  const n=cadastrar(m,'Pessoa Anterior '+i,'anterior'+i+'@exemplo.invalid');
  const r=await comprar(m,'pedido-anterior-'+i,n.contaId);
  assert.equal(r.filaAtual,'B');
  assert.equal(r.criado,true);
 }
 guardarTabuleiroPreenchido(m);

 const titular=cadastrar(m,'Cliente Protagonista','cliente-macro@exemplo.invalid');
 const compra=await comprar(m,'pedido-protagonista',titular.contaId);
 assert.equal(compra.criado,true);
 assert.equal(compra.filaAtual,'B');
 let estado=m.ponte.consultar();
 assert.equal(estado.filas.B.pessoas.at(-1).participanteId,titular.contaId);
 assert.equal(estado.filas.A.quantidade,0);
 assert.equal(estado.compras.length,7);
 assert.equal(estado.vinculosIdentificados,7);

 const convidada=cadastrar(m,'Cliente Convidada','convidada-macro@exemplo.invalid',titular.codigoConvite);
 // Apenas cadastrar nao valida o convite e nao altera a fila.
 estado=m.ponte.consultar();
 assert.equal(estado.convites.length,0);
 assert.equal(estado.filas.A.quantidade,0);
 assert.equal(estado.filas.B.pessoas.some(p=>p.participanteId===titular.contaId),true);

 const validacao=await comprar(m,'pedido-convidada',convidada.contaId);
 assert.equal(validacao.indicacaoNova,true);
 estado=m.ponte.consultar();
 assert.equal(estado.convites.length,1);
 assert.equal(estado.convites[0].aplicadoNoMotor,true);
 assert.equal(estado.filas.A.quantidade,1);
 assert.equal(estado.filas.A.pessoas[0].participanteId,titular.contaId);
 assert.equal(estado.filas.B.pessoas.some(p=>p.participanteId===titular.contaId),false);
 assert.equal(estado.filas.B.pessoas[0].participanteId,convidada.contaId);
 assert.equal(estado.compras.length,8);
 assert.equal(estado.vinculosIdentificados,8);

 // Aqui entra o SIMULADOR DO TABULEIRO. Esta operacao nao e
 // automaticamente disparada pela ponte de pedidos na aplicacao.
 const simulador=m.ponte._restaurar();
 assert.equal(simulador.tabuleiro.centro.participanteId!==titular.contaId,true);
 assert.equal(simulador.tabuleiro.vagas.some(p=>p.participanteId===titular.contaId),false);
 assert.equal(simulador.tentarGiro().motivo,'CATRACA_PAUSADA');
 simulador.abrirCatraca();
 assert.equal(simulador.tentarGiro().motivo,'CICLO_INCOMPLETO');

 // O encerramento de um ciclo existente abre uma vaga na posicao 5;
 // o cliente na fila A e chamado ANTES da cliente na fila B.
 const primeiro=simularCincoVendasEGiro(simulador,1);
 assert.equal(primeiro.girou,true);
 assert.equal(primeiro.novaPosicao5.participanteId,titular.contaId);
 assert.equal(primeiro.novaPosicao5.origemFila,'A');
 assert.equal(simulador.tabuleiro.vagas[4].participanteId,titular.contaId);

 // Cada giro completo desloca UMA vaga por vez, sem pular lugar.
 const proximosLocais=['VAGA_4','VAGA_3','VAGA_2','VAGA_1','CENTRO'];
 for(let ciclo=2;ciclo<=6;ciclo++){
  const giro=simularCincoVendasEGiro(simulador,ciclo);
  assert.equal(giro.girou,true);
  const localEsperado=proximosLocais[ciclo-2];
  if(localEsperado==='CENTRO'){
   assert.equal(simulador.tabuleiro.centro.participanteId,titular.contaId);
  }else{
   const numero=Number(localEsperado.slice(-1));
   assert.equal(simulador.tabuleiro.vagas[numero-1].participanteId,titular.contaId);
  }
  // Ninguem salta do 5 para o centro sem os cinco movimentos.
 }
 assert.equal(simulador.tabuleiro.ciclosConcluidos.length,6);
 assert.equal(simulador.tabuleiro.ciclosConcluidos.some(
  c=>c.centro.participanteId===titular.contaId
 ),false);

 // Chegar ao centro NAO significa "dinheiro recebido": ainda
 // sao necessarias cinco vendas ficticias do SEU proprio ciclo.
 const conclusao=simularCincoVendasEGiro(simulador,7);
 assert.equal(conclusao.girou,true);
 assert.equal(conclusao.centroConcluido.participanteId,titular.contaId);
 assert.equal(simulador.tabuleiro.ciclosConcluidos.length,7);
 const historico=simulador.tabuleiro.ciclosConcluidos.at(-1);
 assert.equal(historico.centro.id,compra.posicaoId);
 assert.deepEqual(historico.vendas.map(v=>v.destinoPrevisto),DESTINOS);
 assert.equal(simulador.tabuleiro.centro.participanteId,convidada.contaId);
 assert.equal(simulador.estado().catraca.giros,7);
 assert.equal(simulador.estado().tabuleiro.vendasNoCiclo,0);
 assert.equal(m.ponte.consultar().catracaMovimentada,false);
 // Importante: ciclos daqui sao SOMENTE no objeto restaurado,
 // sem liberar saque/beneficio ou pagamento real em lugar algum.
});
test('sem compra do convidado, protagonista permanece na B e nao entra na fila A',async t=>{
 const m=cenario(t);
 const titular=cadastrar(m,'Protagonista Sem Convite','pessoa@exemplo.invalid');
 await comprar(m,'pedido-pessoa',titular.contaId);
 const convidada=cadastrar(m,'Convidada Pendente','pendente@exemplo.invalid',titular.codigoConvite);
 assert.ok(convidada);
 const estado=m.ponte.consultar();
 assert.equal(estado.filas.B.quantidade,1);
 assert.equal(estado.filas.A.quantidade,0);
 assert.equal(estado.convites.length,0);
 await assert.rejects(comprar(m,'pedido-pendente',convidada.contaId,'PENDENTE'),
  e=>e.codigo==='PAGAMENTO_NAO_CONFIRMADO');
 assert.equal(m.ponte.consultar().filas.A.quantidade,0);
 assert.equal(m.ponte.consultar().compras.length,1);
});
