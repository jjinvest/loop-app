'use strict';
// Livro FINANCEIRO REAL, separado de staging e do simulador.
// Nenhuma leitura fabrica movimentos. Lancamentos exigem prova externa
// autenticada + evento do motor, nunca dados de um formulario/cliente.
// Em producao, sem adaptadores PSP/adesao/Pix homologados, o livro
// existe e e auditavel, mas nenhum credito nem debito e habilitado.
const LIMITE=1_000_000_000_000,MINIMO=2500,BASE=25000,RETORNO=75000;
const TITULAR=/^titular-[a-f0-9-]{36}$/;
const REF=/^[A-Za-z0-9:_-]{3,120}$/;
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function inteiro(x){return Number.isSafeInteger(x)&&x>0&&x<=LIMITE;}
class LivroFinanceiroRealSQLite{
 constructor({banco,provas=null,agora=()=>Date.now()}={}){
  if(typeof banco?.prepare!=='function'||typeof banco?.exec!=='function'||
     typeof agora!=='function'||!banco.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='loop_real_contas'"
     ).get()||!banco.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='loop_real_motor_compras'"
     ).get()||!banco.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='loop_real_motor_qualificacoes'"
     ).get())falha('LIVRO_FINANCEIRO_EXIGE_MOTOR_E_IDENTIDADE_REAIS');
  this.banco=banco;this.provas=provas;this.agora=agora;
  banco.exec([
   'CREATE TABLE IF NOT EXISTS loop_real_fin_lancamentos(',
   'id INTEGER PRIMARY KEY,origem TEXT NOT NULL UNIQUE,',
   'titular_id TEXT NOT NULL REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
   "grupo TEXT NOT NULL CHECK(grupo IN ('BONUS','POSICAO')),",
   "movimento TEXT NOT NULL CHECK(movimento IN ('CREDITO','DEBITO')),",
   'posicao_id INTEGER,valor_centavos INTEGER NOT NULL',
   'CHECK(valor_centavos>0 AND valor_centavos<=1000000000000),',
   'comprovante_id TEXT NOT NULL,criado_em INTEGER NOT NULL',
   'CHECK(criado_em>0),',
   "CHECK((grupo='BONUS' AND posicao_id IS NULL) OR",
   "(grupo='POSICAO' AND posicao_id>0)));",
   'CREATE INDEX IF NOT EXISTS idx_fin_lanc_titular',
   'ON loop_real_fin_lancamentos(titular_id,id);',
   'CREATE INDEX IF NOT EXISTS idx_fin_lanc_posicao',
   'ON loop_real_fin_lancamentos(titular_id,posicao_id,id);',
   'CREATE TRIGGER IF NOT EXISTS loop_fin_sem_update',
   'BEFORE UPDATE ON loop_real_fin_lancamentos BEGIN',
   "SELECT RAISE(ABORT,'lancamento imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_fin_sem_delete',
   'BEFORE DELETE ON loop_real_fin_lancamentos BEGIN',
   "SELECT RAISE(ABORT,'lancamento imutavel'); END;",
   'CREATE TABLE IF NOT EXISTS loop_real_fin_saques_pagos(',
   'saque_id TEXT PRIMARY KEY,titular_id TEXT NOT NULL',
   'REFERENCES loop_real_contas(id) ON DELETE RESTRICT,',
   "grupo TEXT NOT NULL CHECK(grupo IN ('BONUS','POSICAO')),",
   'valor_centavos INTEGER NOT NULL CHECK(valor_centavos>=2500),',
   'referencia_pix TEXT NOT NULL UNIQUE,confirmado_em INTEGER NOT NULL);',
   'CREATE TRIGGER IF NOT EXISTS loop_fin_saque_sem_update',
   'BEFORE UPDATE ON loop_real_fin_saques_pagos BEGIN',
   "SELECT RAISE(ABORT,'saque imutavel'); END;",
   'CREATE TRIGGER IF NOT EXISTS loop_fin_saque_sem_delete',
   'BEFORE DELETE ON loop_real_fin_saques_pagos BEGIN',
   "SELECT RAISE(ABORT,'saque imutavel'); END;"
  ].join(' '));
 }
 _titular(id){
  if(typeof id!=='string'||!TITULAR.test(id)||
     !this.banco.prepare('SELECT 1 FROM loop_real_contas WHERE id=?').get(id))
   falha('FIN_TITULAR_NAO_RECONHECIDO');
 }
 _prova(metodo,args,estado){
  if(typeof this.provas?.[metodo]!=='function')
   falha('FIN_COMPROVACAO_EXTERNA_NAO_HOMOLOGADA');
  const resultado=this.provas[metodo](Object.freeze({...args}));
  if(!resultado||resultado.ambiente!=='PRODUCAO'||
     resultado.estado!==estado||
     typeof resultado.comprovanteId!=='string'||
     !REF.test(resultado.comprovanteId))
   falha('FIN_COMPROVANTE_EXTERNO_NAO_CONFIRMADO');
  return resultado.comprovanteId;
 }
 _transacao(fn){
  const externa=this.banco.isTransaction===true;
  if(!externa)this.banco.exec('BEGIN IMMEDIATE');
  try{
   const resultado=fn();
   if(!externa)this.banco.exec('COMMIT');
   return resultado;
  }catch(e){
   if(!externa)this.banco.exec('ROLLBACK');
   throw e;
  }
 }
 _postar({origem,titularId,grupo,movimento,posicaoId=null,valor,comprovanteId}){
  if(!REF.test(origem)||!REF.test(comprovanteId)||
     !inteiro(valor)||!['BONUS','POSICAO'].includes(grupo)||
     !['CREDITO','DEBITO'].includes(movimento))
   falha('FIN_LANCAMENTO_INVALIDO');
  this._titular(titularId);
  if(grupo==='POSICAO'){
   if(!Number.isSafeInteger(posicaoId)||posicaoId<1||
      !this.banco.prepare(
       'SELECT 1 FROM loop_real_motor_compras WHERE posicao_id=? AND titular_id=?'
      ).get(posicaoId,titularId))
    falha('FIN_POSICAO_NAO_PERTENCE_A_TITULAR');
  }else if(posicaoId!==null)falha('FIN_BONUS_POSICAO_INDEVIDA');
  const anterior=this.banco.prepare(
   'SELECT * FROM loop_real_fin_lancamentos WHERE origem=?'
  ).get(origem);
  if(anterior){
   if(anterior.titular_id!==titularId||anterior.grupo!==grupo||
      anterior.movimento!==movimento||anterior.posicao_id!==posicaoId||
      anterior.valor_centavos!==valor||anterior.comprovante_id!==comprovanteId)
    falha('FIN_REPLAY_DIVERGENTE');
   return {repetido:true,origem};
  }
  const quando=this.agora();
  if(!Number.isSafeInteger(quando)||quando<1)falha('FIN_RELOGIO_INVALIDO');
  this.banco.prepare([
   'INSERT INTO loop_real_fin_lancamentos',
   '(origem,titular_id,grupo,movimento,posicao_id,',
   'valor_centavos,comprovante_id,criado_em) VALUES(?,?,?,?,?,?,?,?)'
  ].join(' ')).run(origem,titularId,grupo,movimento,posicaoId,
   valor,comprovanteId,quando);
  return {repetido:false,origem};
 }
 // 10% sobre a base qualificada R$250, UMA vez por indicado VERDE.
 // q sozinho pode ter vindo de ensaio: sem prova PSP+verde externa, rejeitar.
 registrarBonusPorIndicadoVerde({indicadoId}={}){
  if(typeof indicadoId!=='string'||!TITULAR.test(indicadoId))
   falha('FIN_INDICADO_INVALIDO');
  return this._transacao(()=>{
   const q=this.banco.prepare([
    'SELECT q.indicado_id,q.indicador_id,q.pedido_id,q.posicao_id,',
    'q.evento_id,c.titular_id AS comprador,c.valor_centavos AS pago,',
    'p.titular_id AS dono_posicao,v.indicador_id AS dono_convite',
    'FROM loop_real_motor_qualificacoes q',
    'JOIN loop_real_motor_compras c ON c.pedido_id=q.pedido_id',
    'JOIN loop_real_motor_compras p ON p.posicao_id=q.posicao_id',
    'JOIN loop_real_vinculos_indicacao v ON v.indicado_id=q.indicado_id',
    'WHERE q.indicado_id=?'
   ].join(' ')).get(indicadoId);
   if(!q||q.comprador!==indicadoId||
      q.indicador_id===indicadoId||
      q.indicador_id!==q.dono_convite||
      q.indicador_id!==q.dono_posicao||q.pago<BASE)
    falha('FIN_INDICACAO_NAO_QUALIFICADA');
   const comprovanteId=this._prova('confirmarIndicacaoVerde',{
    indicadoId,indicadorId:q.indicador_id,pedidoId:q.pedido_id,
    posicaoIndicado:q.posicao_id,eventoMotor:q.evento_id,
    baseCentavos:BASE
   },'PSP_LIQUIDADO_E_INDICADO_VERDE');
   return this._postar({origem:'bonus:'+indicadoId,
    titularId:q.indicador_id,grupo:'BONUS',movimento:'CREDITO',
    valor:BASE/10,comprovanteId});
  });
 }
 // Um crédito de 750 por posição contemplada e giro REAL comprovado.
 registrarContemplacaoComprovada({posicaoId,giroChave}={}){
  if(!Number.isSafeInteger(posicaoId)||posicaoId<1||
     !REF.test(giroChave)||!giroChave.startsWith('g:'))
   falha('FIN_CONTEMPLACAO_INVALIDA');
  return this._transacao(()=>{
   const p=this.banco.prepare(
    'SELECT pedido_id,titular_id FROM loop_real_motor_compras WHERE posicao_id=?'
   ).get(posicaoId);
   const giro=this.banco.prepare(
    "SELECT chave FROM loop_real_motor_eventos WHERE chave=? AND tipo='GIRO'"
   ).get(giroChave);
   if(!p||!giro)falha('FIN_CATRACA_SEM_GIRO_COMPROVADO');
   const comprovanteId=this._prova('confirmarContemplacao',{
    titularId:p.titular_id,posicaoId,pedidoId:p.pedido_id,
    giroChave,valorCentavos:RETORNO
   },'POSICAO_CONTEMPLADA_E_CAIXA_CONFIRMADO');
   return this._postar({origem:'centro:'+posicaoId,
    titularId:p.titular_id,grupo:'POSICAO',movimento:'CREDITO',
    posicaoId,valor:RETORNO,comprovanteId});
  });
 }
 _saldo(titularId,grupo,posicaoId=undefined){
  const filtro=posicaoId===undefined?'':' AND posicao_id=?';
  const parametros=posicaoId===undefined?[titularId,grupo]:
   [titularId,grupo,posicaoId];
  const r=this.banco.prepare([
   'SELECT COALESCE(SUM(CASE WHEN movimento=',
   "'CREDITO' THEN valor_centavos ELSE -valor_centavos END),0) AS saldo",
   'FROM loop_real_fin_lancamentos WHERE titular_id=? AND grupo=?',filtro
  ].join(' ')).get(...parametros);
  if(!Number.isSafeInteger(r.saldo)||r.saldo<0)falha('FIN_SALDO_INCONSISTENTE');
  return r.saldo;
 }
 // Débito apenas APÓS confirmação externa de Pix pago; distribui abatimento
 // entre posições, preservando a visibilidade do saldo individual.
 registrarPixPago({saqueId,titularId,grupo,valorCentavos}={}){
  if(!REF.test(saqueId)||!['BONUS','POSICAO'].includes(grupo)||
     !inteiro(valorCentavos)||valorCentavos<MINIMO)
   falha('FIN_SAQUE_INVALIDO');
  return this._transacao(()=>{
   this._titular(titularId);
   const comprova=this._prova('confirmarPixPago',{
    saqueId,titularId,grupo,valorCentavos
   },'PIX_LIQUIDADO_REAL');
   const anterior=this.banco.prepare(
    'SELECT * FROM loop_real_fin_saques_pagos WHERE saque_id=?'
   ).get(saqueId);
   if(anterior){
    if(anterior.titular_id!==titularId||anterior.grupo!==grupo||
       anterior.valor_centavos!==valorCentavos||
       anterior.referencia_pix!==comprova)
     falha('FIN_REPLAY_DIVERGENTE');
    return {repetido:true,saqueId};
   }
   if(this._saldo(titularId,grupo)<valorCentavos)
    falha('FIN_SALDO_INSUFICIENTE');
   const agora=this.agora();
   if(!Number.isSafeInteger(agora)||agora<1)falha('FIN_RELOGIO_INVALIDO');
   this.banco.prepare([
    'INSERT INTO loop_real_fin_saques_pagos',
    '(saque_id,titular_id,grupo,valor_centavos,referencia_pix,confirmado_em)',
    'VALUES(?,?,?,?,?,?)'
   ].join(' ')).run(saqueId,titularId,grupo,valorCentavos,comprova,agora);
   if(grupo==='BONUS'){
    this._postar({origem:'pix:'+saqueId,titularId,grupo,
     movimento:'DEBITO',valor:valorCentavos,comprovanteId:comprova});
   }else{
    const ativos=this.banco.prepare([
     'SELECT posicao_id,',
     "SUM(CASE WHEN movimento='CREDITO' THEN valor_centavos",
     'ELSE -valor_centavos END) AS saldo',
     'FROM loop_real_fin_lancamentos',
     "WHERE titular_id=? AND grupo='POSICAO'",
     'GROUP BY posicao_id HAVING saldo>0 ORDER BY posicao_id'
    ].join(' ')).all(titularId);
    let restante=valorCentavos;
    for(const pos of ativos){
     if(restante===0)break;
     const debito=Math.min(restante,pos.saldo);
     this._postar({origem:'pix:'+saqueId+':'+pos.posicao_id,
      titularId,grupo,movimento:'DEBITO',
      posicaoId:pos.posicao_id,valor:debito,comprovanteId:comprova});
     restante-=debito;
    }
    if(restante!==0)falha('FIN_RATEIO_DEBITO_INCONSISTENTE');
   }
   return {repetido:false,saqueId};
  });
 }
 consultar({titularId,posicaoId=null}={}){
  this._titular(titularId);
  if(posicaoId!==null&&(!Number.isSafeInteger(posicaoId)||posicaoId<1||
     !this.banco.prepare(
      'SELECT 1 FROM loop_real_motor_compras WHERE titular_id=? AND posicao_id=?'
     ).get(titularId,posicaoId)))
   falha('FIN_POSICAO_NAO_PERTENCE_A_TITULAR');
  const ganhos=this.banco.prepare([
   'SELECT COUNT(*) AS n FROM loop_real_fin_lancamentos',
   "WHERE titular_id=? AND grupo='BONUS' AND movimento='CREDITO'"
  ].join(' ')).get(titularId).n;
  const posicoes=this.banco.prepare([
   'SELECT posicao_id,',
   "SUM(CASE WHEN movimento='CREDITO' THEN valor_centavos",
   'ELSE -valor_centavos END) AS saldoCentavos',
   'FROM loop_real_fin_lancamentos',
   "WHERE titular_id=? AND grupo='POSICAO'",
   'GROUP BY posicao_id ORDER BY posicao_id'
  ].join(' ')).all(titularId);
  if(posicoes.some(x=>!Number.isSafeInteger(x.saldoCentavos)||
    x.saldoCentavos<0))falha('FIN_POSICAO_SALDO_NEGATIVO');
  const sBonus=this._saldo(titularId,'BONUS');
  const sPos=this._saldo(titularId,'POSICAO');
  if(posicoes.reduce((s,x)=>s+x.saldoCentavos,0)!==sPos)
   falha('FIN_TOTAL_POSICOES_DIVERGENTE');
  const sEscolhida=posicaoId===null?null:
   (posicoes.find(p=>p.posicao_id===posicaoId)?.saldoCentavos||0);
  return {
   origem:'LIVRO_FINANCEIRO_REAL',
   // Sem adaptador externo, o livro estrutural NAO representa caixa disponivel.
   saldosLiberados:this.provas!==null,
   financeiroReal:this.provas!==null,
   minimoSaqueCentavos:MINIMO,taxaSaquePercentual:0,
   indicadosValidos:ganhos,
   saldoBonusCentavos:sBonus,
   saldoTotalPosicoesCentavos:sPos,
   posicaoSelecionadaId:posicaoId,
   saldoPosicaoSelecionadaCentavos:sEscolhida,
   posicoes:posicoes.map(x=>({posicaoId:x.posicao_id,
    saldoCentavos:x.saldoCentavos})),
   saqueRealHabilitado:false
  };
 }
 historico({titularId,limite=100}={}){
  this._titular(titularId);
  if(!Number.isSafeInteger(limite)||limite<1||limite>100)
   falha('FIN_LIMITE_HISTORICO_INVALIDO');
  const rows=this.banco.prepare([
   'SELECT origem,grupo,movimento,posicao_id,valor_centavos,criado_em',
   'FROM loop_real_fin_lancamentos WHERE titular_id=?',
   'ORDER BY id DESC LIMIT ?'
  ].join(' ')).all(titularId,limite);
  return {origem:'LIVRO_FINANCEIRO_REAL',registros:rows.map(r=>({
   origem:r.origem,grupo:r.grupo,movimento:r.movimento,
   posicaoId:r.posicao_id,valorCentavos:r.valor_centavos,
   criadoEm:r.criado_em,
   descricao:(r.grupo==='BONUS'?'Bônus por indicação':
    'Saldo de posição '+r.posicao_id)+(r.movimento==='DEBITO'?
    ' · Saque Pix confirmado':' · Crédito confirmado')
  }))};
 }
 verificar(){
  const ids=this.banco.prepare(
   'SELECT DISTINCT titular_id FROM loop_real_fin_lancamentos'
  ).all();
  for(const r of ids){
   this._titular(r.titular_id);
   this.consultar({titularId:r.titular_id});
  }
  return {integridade:'OK',contasAuditadas:ids.length};
 }
}
module.exports={LivroFinanceiroRealSQLite};
