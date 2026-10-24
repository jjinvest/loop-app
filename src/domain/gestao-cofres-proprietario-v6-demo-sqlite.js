'use strict';

// Solicita MOVIMENTACOES DE GESTAO, nao executa retirada bancaria.
// Operacao do proprietario separada de giro, extrato e saque de cliente.
// A origem deve ser rastreada; nunca debita caixa contabil nem liquida valor.
const {disponibilidadeCofreDemo}=require('./disponibilidade-cofres-v6-demo-sqlite');
const COFRES=Object.freeze([
 'LOOP_CENTRO','LOOP_ESQUERDA','LOOP_DIREITA','LOOP_DOURADAS'
]);
const DESTINOS=Object.freeze([...COFRES,'EMPRESA_EXTERNA']);
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;return e;}
class GestaoCofresProprietarioV6DemoSQLite{
 constructor({banco,preLancamento,conciliacao,agora=()=>new Date().toISOString()}={}){
  if(!banco||preLancamento?.banco!==banco||conciliacao?.banco!==banco)
   throw new TypeError('Gestao exige livros e SQLite de laboratorio compartilhados');
  this.banco=banco;this.preLancamento=preLancamento;
  this.conciliacao=conciliacao;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_v6_gestao_cofres_solicitacoes_demo (',
   'movimento_id TEXT PRIMARY KEY NOT NULL,',
   'cofre_origem TEXT NOT NULL, destino TEXT NOT NULL,',
   'valor_centavos INTEGER NOT NULL CHECK(valor_centavos>0),',
   'justificativa TEXT NOT NULL, referencia_cofre_centavos INTEGER NOT NULL,',
   'status TEXT NOT NULL CHECK(status=?),',
   'criado_em TEXT NOT NULL, documento_json TEXT NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS loop_v6_gestao_cofres_imutavel_upd',
   "BEFORE UPDATE ON loop_v6_gestao_cofres_solicitacoes_demo BEGIN SELECT RAISE(ABORT,'solicitacao de gestao imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_v6_gestao_cofres_imutavel_del',
   "BEFORE DELETE ON loop_v6_gestao_cofres_solicitacoes_demo BEGIN SELECT RAISE(ABORT,'solicitacao de gestao imutavel'); END;"
  ].join('\n').replace('CHECK(status=?)',"CHECK(status='PENDENTE_CONCILIACAO_REAL')"));
 }
 _consultarCaixa(cofre,conferencia){
  const campos={
   LOOP_CENTRO:'cofreCentroRestanteSimuladoCentavos',
   LOOP_ESQUERDA:'cofreEsquerdaSimuladoCentavos',
   LOOP_DIREITA:'cofreDireitaSimuladoCentavos',
   LOOP_DOURADAS:'cofreDouradasSimuladoCentavos'
  };
  return conferencia[campos[cofre]];
 }
 solicitar({movimentoId,cofreOrigem,destino,valorCentavos,justificativa}={}){
  if(typeof movimentoId!=='string'||!/^mov-prop-[a-z0-9-]{6,70}$/.test(movimentoId))
   throw falha('MOVIMENTO_ID_INVALIDO');
  if(!COFRES.includes(cofreOrigem)||!DESTINOS.includes(destino)||cofreOrigem===destino)
   throw falha('ORIGEM_DESTINO_INVALIDOS');
  if(!Number.isSafeInteger(valorCentavos)||valorCentavos<1||valorCentavos>10000000000)
   throw falha('VALOR_INVALIDO');
  if(typeof justificativa!=='string'||justificativa.trim().length<8||
    justificativa.length>300||/[\u0000-\u001f\u007f]/.test(justificativa))
   throw falha('JUSTIFICATIVA_INVALIDA');
  const justificativaLimpa=justificativa.trim();
  const entrada=JSON.stringify({cofreOrigem,destino,valorCentavos,
    justificativa:justificativaLimpa});
  const b=this.banco;b.exec('BEGIN IMMEDIATE');
  try{
   const existente=b.prepare([
    'SELECT documento_json AS documento,status,referencia_cofre_centavos AS saldo',
    'FROM loop_v6_gestao_cofres_solicitacoes_demo WHERE movimento_id=?'
   ].join(' ')).get(movimentoId);
   if(existente){
    if(existente.documento!==entrada)throw falha('CONFLITO_IDEMPOTENCIA');
    b.exec('COMMIT');
    return {movimentoId,repetido:true,
      status:existente.status,saldoSimuladoNoPedidoCentavos:existente.saldo,
      dinheiroTransferidoCentavos:0};
   }
   const conf=this.conciliacao.conferir();
   if(conf.fase==='INATIVO')throw falha('COFRES_NAO_CONFIGURADOS');
   if(conf.quantidadeDivergencias>0)throw falha('CONCILIACAO_COFRES_DIVERGENTE');
   // Nao reutilizar dinheiro reservado para comissoes, douradas ou
   // outras solicitacoes. Mantem a operacao so como pedido de laboratorio.
   const bruto=this._consultarCaixa(cofreOrigem,conf);
   const caixa=disponibilidadeCofreDemo(b,{
    cofreId:cofreOrigem,saldoBrutoCentavos:bruto
   });
   const saldo=caixa.saldoLivreDemonstrativoCentavos;
   if(saldo<valorCentavos)
     throw falha('SALDO_DEMONSTRATIVO_INSUFICIENTE');
   // Solicitacao, nao transferencia ou estorno. Recursos simulados mantidos.
   const status='PENDENTE_CONCILIACAO_REAL';
   b.prepare([
    'INSERT INTO loop_v6_gestao_cofres_solicitacoes_demo',
    '(movimento_id,cofre_origem,destino,valor_centavos,justificativa,',
    'referencia_cofre_centavos,status,criado_em,documento_json)',
    'VALUES(?,?,?,?,?,?,?,?,?)'
   ].join(' ')).run(movimentoId,cofreOrigem,destino,valorCentavos,
    justificativaLimpa,saldo,status,this.agora(),entrada);
   b.exec('COMMIT');
   return {movimentoId,repetido:false,cofreOrigem,destino,valorCentavos,
    status,saldoSimuladoNoPedidoCentavos:saldo,
    confirmadoBancariamente:false,dinheiroTransferidoCentavos:0};
  }catch(e){b.exec('ROLLBACK');throw e;}
 }
 listar({limite=20}={}){
  if(!Number.isSafeInteger(limite)||limite<1||limite>100)
   throw falha('LIMITE_INVALIDO');
  const registros=this.banco.prepare([
   'SELECT movimento_id AS movimentoId,cofre_origem AS cofreOrigem,',
   'destino,valor_centavos AS valorCentavos,justificativa,',
   'status,criado_em AS criadoEm',
   'FROM loop_v6_gestao_cofres_solicitacoes_demo',
   'ORDER BY criado_em DESC,movimento_id DESC LIMIT ?'
  ].join(' ')).all(limite);
  return {modo:'SOLICITACOES_DE_GESTAO_EXCLUSIVAMENTE_FICTICIAS',
   registros,autorizacaoDeTransferenciaReal:false,
   totalDebitadoDosCofresCentavos:0,dinheiroTransferidoCentavos:0,
   regra:'Solicitacoes permitidas a qualquer horario, sem movimentacao bancaria.'};
 }
}
module.exports={GestaoCofresProprietarioV6DemoSQLite};
