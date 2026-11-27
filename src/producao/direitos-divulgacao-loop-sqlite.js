'use strict';
// Leitura da habilitacao comercial do link pessoal. Cadastro e nick nao
// autorizam divulgacao: compra confirmada de produto habilitador ou canal
// institucional explicitamente configurado pelo proprietário no servidor.
// Nenhuma rotina credita comissao, gera posicao ou movimenta a catraca.
const TITULAR=/^titular-[a-f0-9-]{36}$/;
const CORES_LINK=Object.freeze(['VERDE','ROXO','DOURADO','LARANJA']);
function erro(c){const e=new Error(c);e.codigo=c;throw e;}
function conferirBanco(banco){
 if(typeof banco?.prepare!=='function')erro('DIVULGACAO_BANCO_INVALIDO');
}
function fontesPresentes(banco){
 const nomes=['loja_real_pedidos','loop_real_fotos_regras_pedido'];
 const achados=banco.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN (?,?)"
 ).all(...nomes);
 return achados.length===nomes.length;
}
function liberadoPeloPedido(banco,titularId,antesDe=null){
 const partes=[
  'SELECT 1 FROM loja_real_pedidos p',
  'JOIN loop_real_fotos_regras_pedido f ON f.pedido_id=p.pedido_id',
  'WHERE p.titular_id=?',
  "AND p.status='APROVADO_PARA_EXPEDICAO'",
  'AND p.pagamento_id IS NOT NULL AND length(p.pagamento_id)>0',
  'AND f.revisao>0',
  "AND f.cor IN ('VERDE','ROXO','DOURADO','LARANJA')",
  ...(antesDe===null?[]:['AND p.atualizado_em<=?']),
  'LIMIT 1'
 ];
 return !!banco.prepare(partes.join(' ')).get(...(
  antesDe===null?[titularId]:[titularId,antesDe]
 ));
}
function consultarDivulgacao({banco,titularId,titularInstitucionalId=null}={}){
 conferirBanco(banco);
 if(typeof titularId!=='string'||!TITULAR.test(titularId))
  erro('DIVULGACAO_TITULAR_INVALIDO');
 if(titularInstitucionalId!==null&&!TITULAR.test(titularInstitucionalId))
  erro('DIVULGACAO_INSTITUCIONAL_INVALIDA');
 // Exceção explícita do canal do proprietário, injetada pelo servidor.
 // Não simula compra habilitadora nem altera direitos financeiros.
 const institucional=titularId===titularInstitucionalId&&!!banco.prepare(
  'SELECT 1 FROM loop_real_contas WHERE id=?').get(titularId);
 const pronta=fontesPresentes(banco);
 const compra=pronta&&liberadoPeloPedido(banco,titularId);
 const liberado=institucional||compra;
 return Object.freeze({
  fonte:institucional?'CANAL_INSTITUCIONAL_AUTORIZADO':
   'PEDIDO_PSP_CONFIRMADO_COM_FOTOGRAFIA_DA_COR',
  linkLiberado:liberado,compraHabilitadoraConfirmada:compra,
  cadastroSozinhoNaoLibera:true,cinzaNaoLibera:true,
  independeDeAdesaoAoLoop:true,participacaoLoopAtiva:false,
  financeiroReal:false
 });
}
// Apuracao de 10% apenas por ATIVACAO COMPROVADA e posicao do indicado.
// Link do indicador pode vir de VERDE abaixo de R$250; nao exige posicao
// propria. Cadastro, venda comum ou cor CINZA nunca geram comissao.
// Projecao somente leitura, NUNCA saldo sacavel nem pagamento automatico.
function consultarComissoesDivulgacao({banco,titularId,indicadoId=null}={}){
 conferirBanco(banco);
 if(typeof titularId!=='string'||!TITULAR.test(titularId))
  erro('DIVULGACAO_TITULAR_INVALIDO');
 if(indicadoId!==null&&(typeof indicadoId!=='string'||!TITULAR.test(indicadoId)))
  erro('DIVULGACAO_INDICADO_INVALIDO');
 const tabelasNecessarias=[
  'loop_real_vinculos_indicacao','loop_real_confirmacoes_cadastro',
  'loop_real_indicacoes_validas_financeiro','loop_real_motor_compras'
 ];
 const achadas=banco.prepare([
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN (",
  tabelasNecessarias.map(()=>'?').join(','),')'
 ].join(' ')).all(...tabelasNecessarias);
 const pronta=fontesPresentes(banco)&&achadas.length===tabelasNecessarias.length;
 const base={
  percentual:10,basePorAtivacaoCentavos:25000,
  bonusPorAtivacaoCentavos:2500,
  fonte:'ATIVACOES_COMPROVADAS_DE_INDICADOS_COM_POSICAO',
  somenteLeitura:true,financeiroReal:false,
  comissaoPagaCentavos:0,saldoLiberadoCentavos:0,
  nenhumaPosicaoLoopCriada:true,podeSacar:false
 };
 if(!pronta)return {...base,ativacoesValidas:0,vendasConfirmadas:0,
  comissaoAConferirCentavos:0,fonteCompleta:false};
 const livroExiste=!!banco.prepare([
  "SELECT 1 FROM sqlite_master WHERE type='table'",
  "AND name='loop_real_fin_lancamentos'"
 ].join(' ')).get();
 const consulta=[
  'SELECT COUNT(*) AS total FROM loop_real_vinculos_indicacao v',
  'JOIN loop_real_indicacoes_validas_financeiro q',
  'ON q.indicado_id=v.indicado_id AND q.indicador_id=v.indicador_id',
  'JOIN loop_real_confirmacoes_cadastro c',
  'ON c.titular_id=v.indicado_id',
  'JOIN loop_real_motor_compras m',
  'ON m.pedido_id=q.pedido_id AND m.titular_id=v.indicado_id',
  'JOIN loja_real_pedidos p',
  'ON p.pedido_id=q.pedido_id AND p.titular_id=v.indicado_id',
  'AND p.pagamento_id=q.pagamento_id',
  'WHERE v.indicador_id=?',
  ...(indicadoId===null?[]:['AND q.indicado_id=?']),
  'AND p.status=\'APROVADO_PARA_EXPEDICAO\'',
  'AND p.pagamento_id IS NOT NULL AND length(p.pagamento_id)>0',
  'AND m.posicao_id>0 AND m.valor_centavos>=25000',
  'AND q.confirmado_em>=c.confirmado_em',
  'AND q.confirmado_em>=v.registrado_em',
  'AND p.atualizado_em>=v.registrado_em',
  "AND (q.tipo='DOURADA_DIRETA' OR q.valor_qualificado_centavos>=25000)",
  'AND q.comprovante_bancario_id IS NOT NULL',
  'AND length(q.comprovante_bancario_id)>0',
  'AND EXISTS (SELECT 1 FROM loop_real_fotos_regras_pedido f',
  'WHERE f.pedido_id=p.pedido_id AND f.revisao>0',
  "AND ((q.tipo='DOURADA_DIRETA' AND f.cor='DOURADO')",
  "OR (q.tipo='COMPRA_250' AND f.cor IN ('VERDE','ROXO','DOURADO'))))",
  'AND EXISTS (SELECT 1 FROM loja_real_pedidos origem',
  'JOIN loop_real_fotos_regras_pedido f2',
  'ON f2.pedido_id=origem.pedido_id',
  'WHERE origem.titular_id=v.indicador_id',
  "AND origem.status='APROVADO_PARA_EXPEDICAO'",
  'AND origem.pagamento_id IS NOT NULL',
  'AND length(origem.pagamento_id)>0',
  'AND f2.revisao>0',
  "AND f2.cor IN ('VERDE','ROXO','DOURADO','LARANJA')",
  'AND origem.atualizado_em<=v.registrado_em)',
  ...(livroExiste?[
   'AND NOT EXISTS (SELECT 1 FROM loop_real_fin_lancamentos l',
   "WHERE l.origem='bonus:'||v.indicado_id",
   "AND l.grupo='BONUS' AND l.movimento='CREDITO')"
  ]:[])
 ].join(' ');
 const quantidade=banco.prepare(consulta).get(...(
  indicadoId===null?[titularId]:[titularId,indicadoId]
 ))?.total;
 if(!Number.isSafeInteger(quantidade)||quantidade<0||
    !Number.isSafeInteger(quantidade*2500))
  erro('DIVULGACAO_COMISSOES_EXCEDIDAS');
 return {...base,ativacoesValidas:quantidade,
  // Campo historico preservado para consumidores legados.
  vendasConfirmadas:quantidade,
  comissaoAConferirCentavos:quantidade*2500,fonteCompleta:true};
}
function verificarNickDivulgador({banco,nick,titularInstitucionalId=null}={}){
 conferirBanco(banco);
 if(typeof nick!=='string'||!/^[a-zA-Z]{1,12}$/.test(nick))
  erro('DIVULGACAO_NICK_INVALIDO');
 const id=banco.prepare(
  'SELECT id FROM loop_real_contas WHERE nick=?'
 ).get(nick)?.id;
 return id?consultarDivulgacao({banco,titularId:id,titularInstitucionalId}).linkLiberado:false;
}
module.exports={consultarDivulgacao,consultarComissoesDivulgacao,verificarNickDivulgador,CORES_LINK};
