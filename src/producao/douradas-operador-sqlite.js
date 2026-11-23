'use strict';
// Douradas administrativas no mesmo motor SQLite, sem evento de venda,
// crédito, cofre financeiro, saque ou desconto no caixa. A titularidade
// operacional é LOOP_EMPRESA; a identificação pública é o número da posição.
const ID=/^[A-Za-z0-9_-]{12,100}$/;
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
class DouradasOperadorSQLite{
 constructor({motor,agora=()=>Date.now()}={}){
  if(typeof motor?._transacao!=='function'||
    typeof motor?._sim!=='function'||
    typeof motor?.banco?.prepare!=='function'||
    typeof agora!=='function')erro('DOURADAS_MOTOR_REAL_INDISPONIVEL');
  this.motor=motor;this.banco=motor.banco;this.agora=agora;
  this.banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_douradas_operador(',
   'id_operacao TEXT PRIMARY KEY,numero INTEGER NOT NULL UNIQUE CHECK(numero>0),',
   'origem TEXT NOT NULL CHECK(origem=\'ADMIN_MANUAL_SEM_COMPRA\'),',
   'motivo TEXT NOT NULL,registrada_em INTEGER NOT NULL CHECK(registrada_em>0));',
   'CREATE TRIGGER IF NOT EXISTS loop_real_douradas_operador_bloquear_update',
   "BEFORE UPDATE ON loop_real_douradas_operador BEGIN",
   "SELECT RAISE(ABORT,'dourada administrativa imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_real_douradas_operador_bloquear_delete',
   "BEFORE DELETE ON loop_real_douradas_operador BEGIN",
   "SELECT RAISE(ABORT,'dourada administrativa imutavel'); END;"
  ].join(' '));
 }
 criar({idOperacao,motivo}={}){
  if(typeof idOperacao!=='string'||!ID.test(idOperacao)||
     typeof motivo!=='string'||motivo.trim().length<8||motivo.length>200)
   erro('DOURADAS_COMANDO_INVALIDO');
  const ts=this.agora();
  if(!Number.isSafeInteger(ts)||ts<=0)erro('DOURADAS_RELOGIO_INVALIDO');
  return this.motor._transacao(sim=>{
   const anterior=this.banco.prepare([
    'SELECT numero,motivo FROM loop_real_douradas_operador',
    'WHERE id_operacao=?'
   ].join(' ')).get(idOperacao);
   if(anterior){
    if(anterior.motivo!==motivo.trim())
     erro('DOURADAS_REPLAY_DIVERGENTE');
    return {repetida:true,numero:anterior.numero};
   }
   const p=sim.registrarPosicaoSimulada({
    nome:'Posição dourada LOOP',participanteId:'LOOP_EMPRESA'
   });
   const pos=sim.filas.filaB.find(x=>x.id===p.posicao.id);
   if(!pos||pos.empresa===true)erro('DOURADAS_CRIACAO_DIVERGENTE');
   pos.empresa=true;pos.titularOperacional='LOOP_EMPRESA';
   pos.statusAdesao='POSICAO_LOOP';
   pos.origemOperacional='ADMIN_MANUAL_SEM_COMPRA';
   pos.motivoAssuncao='ADMIN_MANUAL_SEM_COMPRA';
   pos.criadaEm=new Date(ts).toISOString();
   this.banco.prepare([
    'INSERT INTO loop_real_douradas_operador',
    '(id_operacao,numero,origem,motivo,registrada_em)',
    "VALUES(?,?,'ADMIN_MANUAL_SEM_COMPRA',?,?)"
   ].join(' ')).run(idOperacao,pos.id,motivo.trim(),ts);
   return {repetida:false,numero:pos.id};
  });
 }
 consultar(){
  const sim=this.motor._sim();
  const numerosManuais=this.banco.prepare([
   'SELECT numero FROM loop_real_douradas_operador ORDER BY numero'
  ].join(' ')).all().map(x=>x.numero);
  const todos=[...sim.filas.filaA,...sim.filas.filaB,
   sim.tabuleiro.centro,...sim.tabuleiro.vagas,
   ...sim.tabuleiro.ciclosConcluidos.flatMap(x=>
    [x.centro,...(x.vagas??[])]
   )].filter(Boolean);
  const vistos=new Map();
  for(const p of todos)if(Number.isSafeInteger(p.id)&&p.id>0){
   const anterior=vistos.get(p.id);
   if(!anterior||(!anterior.empresa&&p.empresa))
    vistos.set(p.id,p);
  }
  for(const n of numerosManuais){
   const p=vistos.get(n);
   if(!p||!p.empresa||
      p.origemOperacional!=='ADMIN_MANUAL_SEM_COMPRA')
    erro('DOURADAS_AUDITORIA_MOTOR_DIVERGENTE');
  }
  let convertidasAzuis=0,desistentes=0;
  for(const p of vistos.values())if(p.empresa===true){
   if(p.motivoAssuncao==='SEM_CPF_E_TERMOS_NA_ENTRADA_VAGA_6'||
      p.statusAdesao==='PRAZO_ENCERRADO')convertidasAzuis++;
   if(p.motivoAssuncao==='DESISTENCIA_EXPRESSA_APOS_VAGA_6'||
      p.statusAdesao==='DESISTENTE')desistentes++;
  }
  const pendentes=[...sim.filas.filaA,...sim.filas.filaB,
   sim.tabuleiro.centro,...sim.tabuleiro.vagas].filter(Boolean);
  const azuis=new Set(pendentes.filter(x=>
   x.statusAdesao==='PENDENTE'&&x.empresa!==true).map(x=>x.id)).size;
  const total=numerosManuais.length+convertidasAzuis+desistentes;
  if(![total,azuis].every(Number.isSafeInteger))
   erro('DOURADAS_CONTAGEM_INVALIDA');
  return {fonte:'SNAPSHOT_E_REGISTROS_AUDITADOS_MESMO_SQLITE',
   somenteLeitura:true,financeiroReal:false,
   criacaoDouradaAdministrativaHabilitada:true,
   douradasManuais:numerosManuais.length,
   douradasConvertidasAzuis:convertidasAzuis,
   douradasPorDesistencia:desistentes,
   douradasTotal:total,azuisPendentes:azuis,
   destinoFinanceiroDouradas:'COFRE_DOURADAS_100_POR_CENTO',
   cofreDouradas:{posicoesRegistradas:total,entradaManual:numerosManuais.length,
    entradaConversaoAzul:convertidasAzuis,
    entradaDesistencia:desistentes,
    moeda:'BRL',saldoCentavos:null,estado:'AGUARDANDO_CONCILIACAO_BANCARIA',
    destino:'100_POR_CENTO_COFRE_DOURADAS'},
   saldoDouradasCentavos:null,saldoDouradasConciliado:false,
   nenhumaMovimentacaoFinanceiraExecutada:true};
 }
}
module.exports={DouradasOperadorSQLite};
