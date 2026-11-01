'use strict';
// Leitura administrativa dos livros existentes. Nunca fabricar vinculo entre
// a venda que financia um giro e a posicao que conclui OUTRO ciclo.
function consultarOperacaoClienteLab({banco,contaId,limite=50,offset=0}={}){
 const falhar=codigo=>{const e=new Error(codigo);e.codigo=codigo;throw e;};
 if(typeof contaId!=='string'||!/^[a-f0-9-]{36}$/.test(contaId))falhar('CLIENTE_ID_INVALIDO');
 if(!Number.isSafeInteger(limite)||limite<1||limite>100||
    !Number.isSafeInteger(offset)||offset<0)falhar('PAGINACAO_INVALIDA');
 const tabelas=new Set(banco.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
 if(!tabelas.has('admin_contas_participantes_demo'))falhar('CADASTRO_SQLITE_INDISPONIVEL');
 const cliente=banco.prepare('SELECT id,nome FROM admin_contas_participantes_demo WHERE id=?').get(contaId);
 if(!cliente)falhar('CLIENTE_NAO_ENCONTRADO');
 const ausentes=[];
 function pagina(tabela,select,ordem){
  if(!tabelas.has(tabela)){ausentes.push(tabela);return {itens:[],total:null,limite,offset};}
  const total=banco.prepare('SELECT COUNT(*) n FROM '+tabela+' WHERE conta_id=?').get(contaId).n;
  const itens=banco.prepare(select+' WHERE conta_id=? ORDER BY '+ordem+' LIMIT ? OFFSET ?').all(contaId,limite,offset);
  return {itens,total,limite,offset};
 }
 const pedidos=pagina('admin_carrinho_loop_demo',
  'SELECT pedido_id AS pedidoId,total_centavos AS valorCentavos,criado_em AS criadoEm FROM admin_carrinho_loop_demo',
  'criado_em DESC,pedido_id DESC');
 for(const pedido of pedidos.itens){
  pedido.posicoes=[];
  if(tabelas.has('admin_ponte_compras_demo')){
   const principal=banco.prepare('SELECT posicao_id AS posicaoId FROM admin_ponte_compras_demo WHERE pedido_id=? AND conta_id=?')
    .get(pedido.pedidoId,contaId);
   if(principal)pedido.posicoes.push(principal.posicaoId);
   if(principal&&tabelas.has('admin_ponte_posicoes_adicionais_demo')){
    pedido.posicoes.push(...banco.prepare('SELECT posicao_id id FROM admin_ponte_posicoes_adicionais_demo WHERE pedido_id=? ORDER BY ordem')
     .all(pedido.pedidoId).map(p=>p.id));
   }
  }
  pedido.pagamentoSandbox=tabelas.has('akitemm_sandbox_cobrancas')?
   banco.prepare('SELECT status,valor_centavos AS valorCentavos,atualizado_em AS consultadoEm FROM akitemm_sandbox_cobrancas WHERE pedido_id=?')
    .get(pedido.pedidoId)||null:null;
  pedido.eventoQueFinanciouCiclo=tabelas.has('loop_v6_provisoes_eventos')?
   banco.prepare('SELECT giro,ordem,destino_cofre AS cofre,referencia_centavos AS referenciaCentavos FROM loop_v6_provisoes_eventos WHERE pedido_id=?')
    .get(pedido.pedidoId)||null:null;
 }
 const ciclosCentro=pagina('loop_v6_provisoes_ciclos',
  'SELECT giro,posicao_centro AS posicaoId,cofre_centro AS cofre,previsto_centro AS previstoCentavos FROM loop_v6_provisoes_ciclos',
  'giro DESC');
 const saquesBonus=pagina('admin_solicitacoes_saque_demo',
  'SELECT solicitacao_id AS solicitacaoId,tipo,valor_bruto_centavos AS brutoCentavos,taxa_centavos AS taxaCentavos,valor_liquido_centavos AS liquidoCentavos FROM admin_solicitacoes_saque_demo',
  'registrado_em DESC,solicitacao_id DESC');
 const saquesCentro=pagina('loop_v6_saques_centro_teste',
  'SELECT solicitacao_id AS solicitacaoId,valor_centavos AS valorCentavos,criado_em AS criadoEm FROM loop_v6_saques_centro_teste',
  'criado_em DESC,solicitacao_id DESC');
 for(const saque of saquesCentro.itens){
  saque.ultimoEvento=tabelas.has('loop_v6_eventos_saques_centro_teste')?
   banco.prepare('SELECT tipo,motivo,criado_em AS criadoEm FROM loop_v6_eventos_saques_centro_teste WHERE solicitacao_id=? ORDER BY sequencia DESC LIMIT 1')
    .get(saque.solicitacaoId)||null:null;
 }
 return {modo:'OPERACAO_CLIENTE_SQLITE_LAB',cliente,pedidos,ciclosCentro,
  saquesBonus,saquesCentro,fontesAusentes:ausentes,
  vinculoVendaCiclo:'PEDIDO_ID_DO_EVENTO_PERSISTIDO',
  vinculoContemplacao:'TITULAR_E_POSICAO_CENTRAL_DO_LIVRO',
  somenteLeitura:true,previsoesNaoLiquidadas:true,disponivelParaSaqueRealCentavos:0};
}
module.exports={consultarOperacaoClienteLab};
