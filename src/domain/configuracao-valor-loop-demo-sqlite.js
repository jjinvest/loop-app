'use strict';

// Parametro financeiro VERSIONADO de laboratorio, nunca de pagamentos reais.
// Cada versao inicia em um marco temporal confiavel do servidor. Historico
// append-only preserva a referencia das posicoes existentes.
const {VALOR_PADRAO_LOOP_CENTAVOS}=require('./valor-padrao-loop');
const MARCO_INICIAL='1970-01-01T00:00:00.000Z';
function falha(codigo,mensagem){const e=new Error(mensagem);e.codigo=codigo;return e;}
function instante(s){
 if(typeof s!=='string'||!Number.isFinite(Date.parse(s))||
    new Date(s).toISOString()!==s)throw falha('HORARIO_INVALIDO','Horario ISO UTC invalido');
 return s;
}
function dinheiro(n){
 if(!Number.isSafeInteger(n)||n<100||n>100000000){
  throw falha('VALOR_INVALIDO','Referencia de teste entre R$1,00 e R$1.000.000,00');
 }
 return n;
}
function mapear(r){
 return {revisao:r.revisao,valorCentavos:r.valor_centavos,
  vigenteDesde:r.vigente_desde,registradoEm:r.registrado_em};
}
class ConfiguracaoValorLoopDemoSQLite{
 constructor({banco,agora=()=>new Date().toISOString()}={}){
  if(!banco||typeof banco.prepare!=='function')throw new TypeError('SQLite de laboratorio obrigatorio');
  if(typeof agora!=='function')throw new TypeError('Relogio interno obrigatorio');
  this.banco=banco;this.agora=agora;
  banco.exec(`
   CREATE TABLE IF NOT EXISTS admin_valor_loop_versoes_demo(
    revisao INTEGER PRIMARY KEY CHECK(revisao>=1),
    valor_centavos INTEGER NOT NULL CHECK(valor_centavos>=100 AND valor_centavos<=100000000),
    vigente_desde TEXT NOT NULL UNIQUE,
    registrado_em TEXT NOT NULL
   );
   CREATE TRIGGER IF NOT EXISTS admin_valor_loop_versoes_no_update
    BEFORE UPDATE ON admin_valor_loop_versoes_demo
    BEGIN SELECT RAISE(ABORT,'versao de valor LOOP imutavel'); END;
   CREATE TRIGGER IF NOT EXISTS admin_valor_loop_versoes_no_delete
    BEFORE DELETE ON admin_valor_loop_versoes_demo
    BEGIN SELECT RAISE(ABORT,'versao de valor LOOP imutavel'); END;
   INSERT INTO admin_valor_loop_versoes_demo(revisao,valor_centavos,vigente_desde,registrado_em)
   SELECT 1,25000,'1970-01-01T00:00:00.000Z','1970-01-01T00:00:00.000Z'
   WHERE NOT EXISTS(SELECT 1 FROM admin_valor_loop_versoes_demo);
  `);
 }
 atual(){
  const row=this.banco.prepare(`
   SELECT * FROM admin_valor_loop_versoes_demo ORDER BY revisao DESC LIMIT 1
  `).get();
  if(!row)throw new Error('Referencia de laboratorio ausente');
  return mapear(row);
 }
 historico(){
  return this.banco.prepare(`
   SELECT * FROM admin_valor_loop_versoes_demo ORDER BY revisao
  `).all().map(mapear);
 }
 vigenteEm(dataISO){
  instante(dataISO);
  const row=this.banco.prepare(`
   SELECT * FROM admin_valor_loop_versoes_demo
   WHERE vigente_desde<=? ORDER BY vigente_desde DESC LIMIT 1
  `).get(dataISO);
  if(!row)throw falha('HORARIO_INVALIDO','Compra anterior a origem da tabela');
  return mapear(row);
 }
 alterar({valorCentavos,revisaoEsperada}={}){
  dinheiro(valorCentavos);
  if(!Number.isSafeInteger(revisaoEsperada)||revisaoEsperada<1){
   throw falha('REVISAO_INVALIDA','Revisao anterior obrigatoria');
  }
  this.banco.exec('BEGIN IMMEDIATE');
  try{
   const anterior=this.atual();
   if(anterior.revisao!==revisaoEsperada){
    throw falha('CONFLITO_REVISAO','Configuracao alterada por outra operacao');
   }
   if(anterior.valorCentavos===valorCentavos){
    this.banco.exec('COMMIT');
    return {...anterior,alterado:false};
   }
   const inicio=instante(this.agora());
   if(inicio<=anterior.vigenteDesde){
    throw falha('HORARIO_INVALIDO','Nova vigencia deve ser posterior ao marco anterior');
   }
   const nova={revisao:anterior.revisao+1,valorCentavos,
    vigenteDesde:inicio,registradoEm:inicio};
   this.banco.prepare(`
    INSERT INTO admin_valor_loop_versoes_demo
      (revisao,valor_centavos,vigente_desde,registrado_em)
    VALUES (?,?,?,?)
   `).run(nova.revisao,nova.valorCentavos,nova.vigenteDesde,nova.registradoEm);
   this.banco.exec('COMMIT');
   return {...nova,alterado:true};
  }catch(err){this.banco.exec('ROLLBACK');throw err;}
 }
 resumo(){
  return {modo:'CONFIGURACAO_VALOR_LOOP_LOCAL_FICTICIA',
   atual:this.atual(),historico:this.historico(),
   filaUnica:true,semPagamentoReal:true,semAlterarHistorico:true,
   semRecalculoAutomaticoDePosicoesAntigas:true};
 }
}

// Apenas cenario de comparacao, nao define quem fica com dinheiro de verdade.
// Simula a ideia proposta: em ciclo de referencia antiga, destinar
// o excedente da parcela atual ao caixa empresarial.
function compararParcelaAntigaComNova({
 valorCentroOriginalCentavos,valorNovaVendaLoopCentavos,
 evento='PARTICIPANTE'
}={}){
 dinheiro(valorCentroOriginalCentavos);
 dinheiro(valorNovaVendaLoopCentavos);
 if(!['PARTICIPANTE','EMPRESA'].includes(evento))throw falha('DESTINO_INVALIDO','Evento invalido');
 const valorParticipanteCentavos=evento==='PARTICIPANTE'?
  Math.min(valorCentroOriginalCentavos,valorNovaVendaLoopCentavos):0;
 const valorEmpresaPropostoCentavos=valorNovaVendaLoopCentavos-valorParticipanteCentavos;
 return {
  modo:'CENARIO_MATEMATICO_SEM_TRANSFERENCIA',
  valorCentroOriginalCentavos,valorNovaVendaLoopCentavos,
  evento,valorParticipanteCentavos,valorEmpresaPropostoCentavos,
  diferencaDeReferenciaCentavos:valorNovaVendaLoopCentavos-valorCentroOriginalCentavos,
  dinheiroMovimentado:false,obrigacaoRealDefinida:false,
  necessitaRevisaoJuridicoContabil:true
 };
}
module.exports={ConfiguracaoValorLoopDemoSQLite,compararParcelaAntigaComNova,
 MARCO_INICIAL};
