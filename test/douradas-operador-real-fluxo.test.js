'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {IdentidadeClienteLoopReal}=
 require('../src/producao/identidade-cliente-loop-sqlite');
const {MotorLoopIntegradoSQLite}=
 require('../src/producao/motor-loop-integrado-sqlite');
const {DouradasOperadorSQLite}=
 require('../src/producao/douradas-operador-sqlite');
const raiz=path.resolve(__dirname,'..');
function montar(t){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 t.after(()=>db.close());
 const texto='Termos técnicos para testar a criação operacional de posições '+
  'douradas sem venda, débito, compra, saldo ou pagamento, em banco isolado. '+
  'Dados deste teste não são clientes reais e não ficam na produção.';
 new IdentidadeClienteLoopReal({
  banco:db,chaveEmail:randomBytes(32),chaveCifra:randomBytes(32),
  chaveCodigo:randomBytes(32),enviarEmail:async()=>true,
  termos:{versao:'LOOP-TERMOS-TESTE-DOURADAS',texto},
  privacidade:{versao:'LOOP-PRIV-TESTE-DOURADAS',texto}
 });
 const motor=new MotorLoopIntegradoSQLite({banco:db});
 const douradas=new DouradasOperadorSQLite({motor,agora:()=>1800000000000});
 return {db,motor,douradas};
}
test('posição dourada manual entra no motor e no cofre contábil, sem caixa',t=>{
 const {db,motor,douradas}=montar(t);
 assert.equal(douradas.consultar().douradasTotal,0);
 const idOperacao='dourada-primeira-prova-20261123';
 const primeiro=douradas.criar({idOperacao,motivo:'Criar reserva empresarial'});
 assert.equal(primeiro.repetida,false);
 assert.equal(primeiro.numero,1);
 const estado=motor._sim();
 assert.equal(estado.filas.filaB.length,1);
 const p=estado.filas.filaB[0];
 assert.equal(p.empresa,true);
 assert.equal(p.titularOperacional,'LOOP_EMPRESA');
 assert.equal(p.statusAdesao,'POSICAO_LOOP');
 assert.equal(p.origemOperacional,'ADMIN_MANUAL_SEM_COMPRA');
 const d=douradas.consultar();
 assert.equal(d.douradasTotal,1);
 assert.equal(d.douradasManuais,1);
 assert.equal(d.azuisPendentes,0);
 assert.equal(d.cofreDouradas.posicoesRegistradas,1);
 assert.equal(d.cofreDouradas.saldoCentavos,null);
 assert.equal(d.financeiroReal,false);
 assert.equal(d.nenhumaMovimentacaoFinanceiraExecutada,true);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM loop_real_motor_compras').get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM loop_real_motor_eventos').get().n,0);
 assert.deepEqual(motor.verificar(),{integridade:'OK',compras:0,eventos:0,giros:0});
 assert.equal(douradas.criar({idOperacao,motivo:'Criar reserva empresarial'}).repetida,true);
 assert.equal(douradas.consultar().douradasTotal,1);
 assert.throws(()=>douradas.criar({idOperacao,motivo:'Outra justificativa'}),
  /DOURADAS_REPLAY_DIVERGENTE/);
 assert.throws(()=>db.exec('DELETE FROM loop_real_douradas_operador'),
  /dourada administrativa imutavel/);
});
test('azul na fila não é dourada; só ao cruzar a vaga 6 converte e conta',t=>{
 const {motor,douradas}=montar(t);
 motor._transacao(sim=>sim.registrarPosicaoSimulada({
  nome:'Titular aguardando adesão',participanteId:'blue-001',
  adesaoPendente:true
 }));
 assert.equal(douradas.consultar().azuisPendentes,1);
 assert.equal(douradas.consultar().douradasConvertidasAzuis,0);
 motor._transacao(sim=>{
  const convertida=sim.tabuleiro.selecionar();
  assert.equal(convertida.empresa,true);
  assert.equal(convertida.statusAdesao,'PRAZO_ENCERRADO');
  assert.equal(convertida.motivoAssuncao,'SEM_CPF_E_TERMOS_NA_ENTRADA_VAGA_6');
  sim.tabuleiro.vagas[5]=convertida;
 });
 const d=douradas.consultar();
 assert.equal(d.azuisPendentes,0);
 assert.equal(d.douradasConvertidasAzuis,1);
 assert.equal(d.douradasTotal,1);
 assert.equal(d.cofreDouradas.entradaConversaoAzul,1);
 assert.equal(d.cofreDouradas.saldoCentavos,null);
 assert.equal(motor.verificar().integridade,'OK');
});
test('escritório e Central consultam o mesmo motor, sem mostrar bancada no escritório',()=>{
 const office=fs.readFileSync(path.join(raiz,
  'src/producao/interface-aprovada-contas.js'),'utf8');
 const central=fs.readFileSync(path.join(raiz,
  'src/producao/interface-admin-comercial-aprovada.js'),'utf8');
 const client=fs.readFileSync(path.join(raiz,
  'src/producao/interface-admin-comercial-client.js'),'utf8');
 const gate=fs.readFileSync(path.join(raiz,
  'src/producao/gateway-admin-comercial.js'),'utf8');
 const clock=fs.readFileSync(path.join(raiz,
  'src/producao/operacao-catraca-admin-sqlite.js'),'utf8');
 assert.match(office,/id="adminDouradasCriar"/);
 assert.match(office,/id="adminDouradasTotal"/);
 assert.match(office,/id="adminCofreDouradasSaldo"/);
 assert.doesNotMatch(office,/'<section id="adminTesteModulos"/);
 assert.match(central,/TESTES OPERACIONAIS · FILAS E CATRACA/);
 assert.match(central,/CENTRAL DO ADMINISTRADOR/);
 assert.match(client,/async function consultarBancadaCentral/);
 assert.match(gate,/app\.post\('\/api\/admin\/loop\/douradas',proteger,validarCsrf/);
 assert.match(gate,/new DouradasOperadorSQLite\(\{motor:motorLoop\}\)/);
 assert.match(clock,/_relatorioRelogioAcumulado/);
 assert.match(office,/const luzesDia=relogio\?\.luzesRelogioHoje/);
 assert.match(office,/luzesDia===0\?0:\(\(luzesDia-1\)%6\)\+1/);
 assert.match(office,/Luzes acesas hoje:/);
});
