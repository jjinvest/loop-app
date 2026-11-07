'use strict';
// Projecao operacional unica do Escritório: mesmo SQLite de loja, titular e motor.
// Leitura de laboratorio. Nao inventa clientes, ciclos, saldos nem saques.
const {DEPARTAMENTOS}=require('./escritorio-admin-departamentos-candidato');
const {auditarRelacoesPspCandidato}=require('./auditoria-relacional-psp-candidato-sqlite');
const AREAS=Object.freeze({
 CLIENTES:{descricao:'Contas cadastradas na identidade unificada de ensaio.',acoes:['BUSCAR_CLIENTES','CRIAR_MISSAO']},
 PEDIDOS:{descricao:'Pedidos da loja, titulares e estados persistidos no mesmo SQLite.',acoes:['BUSCAR_PEDIDOS','CONFERIR_PSP','CRIAR_MISSAO']},
 PRODUTOS:{descricao:'Catálogo compartilhado com a loja e as novas cotações.',acoes:['EDITAR_PRODUTOS','CRIAR_MISSAO']},
 ENTREGAS:{descricao:'Preparações de entrega do laboratório, sem expedição real.',acoes:['PREPARAR_ENTREGA','BUSCAR_PEDIDOS','CRIAR_MISSAO']},
 INDICACOES:{descricao:'Vínculos de cadastro e indicações efetivamente qualificadas pelo motor de ensaio.',acoes:['VER_POSICOES','CRIAR_MISSAO']},
 POSICOES:{descricao:'Vínculos de posições de ensaio por pedido e titular.',acoes:['VER_POSICOES','VER_CATRACA','CRIAR_MISSAO']},
 FILAS:{descricao:'Filas A e B do próprio motor, respeitando 3A:1B.',acoes:['VER_CATRACA','VER_POSICOES']},
 TABULEIRO:{descricao:'Centro, vagas, eventos e giros do motor V6 existente.',acoes:['VER_CATRACA','VER_AGENDA','CRIAR_MISSAO']},
 COFRES:{descricao:'Cofres comerciais indisponíveis até escrituração e conciliação homologadas.',acoes:['CONFERIR_COBERTURA','CRIAR_MISSAO']},
 SAQUES:{descricao:'Saques comerciais bloqueados até custódia, saldo e PSP homologados.',acoes:['CONFERIR_COBERTURA','CRIAR_MISSAO']},
 SEGURANCA:{descricao:'Integridade relacional, backup e travas de ativação do laboratório.',acoes:['CONFERIR_BACKUP','CONFERIR_COBERTURA','CRIAR_MISSAO']},
 OUTROS:{descricao:'Acompanhamento operacional registrado e auditável.',acoes:['CRIAR_MISSAO','VER_MISSOES']}
});
function falha(codigo){const e=new Error(codigo);e.codigo=codigo;throw e;}
function paginaSQL(banco,base,parametros,pagina,mapper){
 const total=banco.prepare('SELECT COUNT(*) AS n '+base).get(...parametros).n;
 const registros=banco.prepare('SELECT * '+base+' LIMIT 20 OFFSET ?').all(...parametros,pagina*20).map(mapper);
 return {total,registros};
}
function resumoPares(...pares){return pares.map(([rotulo,valor])=>({rotulo,valor}));}
function criarPaginaOperacional({banco,catalogo,motorConta,codigo,pagina=0}={}){
 if(!Object.hasOwn(AREAS,codigo))falha('DEPARTAMENTO_INVALIDO');
 if(!Number.isSafeInteger(pagina)||pagina<0||pagina>10000)falha('PAGINA_INVALIDA');
 if(typeof banco?.prepare!=='function'||typeof catalogo?.listar!=='function'||
    typeof motorConta?.consultar!=='function')falha('FONTE_UNICA_INDISPONIVEL');
 const nome=DEPARTAMENTOS.find(x=>x[0]===codigo)[1];
 const definicao=AREAS[codigo];
 return async function executar(){
  const saida={codigo,nome,descricao:definicao.descricao,
   estado:['COFRES','SAQUES'].includes(codigo)?'BLOQUEADO_COMERCIAL':'OPERACIONAL_LAB',
   acoes:definicao.acoes,metricas:[],registros:[],total:0,pagina,porPagina:20,
   haMais:false,laboratorio:true,financeiroReal:false};
  let resultado={registros:[],total:0};
  const db=banco;
  const total=tabela=>db.prepare('SELECT COUNT(*) AS n FROM '+tabela).get().n;
  if(codigo==='CLIENTES'){
   resultado=paginaSQL(db,
    'FROM (SELECT id,nick,criado_em FROM akitemm_conta_unica_candidata ORDER BY criado_em DESC,id DESC)',
    [],pagina,x=>({id:x.id,titulo:x.nick,detalhe:'Cadastro de ensaio · '+x.id}));
   saida.metricas=resumoPares(['Contas cadastradas',resultado.total]);
  }else if(codigo==='PEDIDOS'){
   resultado=paginaSQL(db,[
    'FROM (SELECT p.prepedido_id AS id,c.nick,p.total_centavos AS totalCentavos,',
    'COALESCE(a.estado,p.estado) AS situacao FROM akitemm_checkout_prepedidos_staging p',
    'JOIN akitemm_conta_unica_candidata c ON c.id=p.titular_id',
    'LEFT JOIN akitemm_prepedido_asaas_sandbox_staging a',
    'ON a.prepedido_id=p.prepedido_id AND a.titular_id=p.titular_id',
    'ORDER BY p.criado_em DESC,p.prepedido_id DESC)'
   ].join(' '),[],pagina,x=>({id:x.id,prepedidoId:x.id,titulo:x.nick,
    detalhe:x.id+' · '+x.situacao+' · R$ '+(x.totalCentavos/100).toFixed(2)+' (pedido de ensaio)'}));
   saida.metricas=resumoPares(['Pré-pedidos',resultado.total],
    ['Conciliação','Somente comprovação PSP Sandbox, sem liquidação real']);
  }else if(codigo==='PRODUTOS'){
   const todos=await catalogo.listar();
   resultado={total:todos.length,registros:todos.slice(pagina*20,(pagina+1)*20).map(p=>({
    id:p.id,produtoId:p.id,titulo:p.nome,detalhe:p.id+' · '+p.estado+' · '+p.tipo
   }))};
   saida.metricas=resumoPares(['Produtos no catálogo',resultado.total],
    ['Publicados no ensaio',todos.filter(p=>p.estado==='PUBLICADO').length]);
  }else if(codigo==='ENTREGAS'){
   resultado=paginaSQL(db,[
    'FROM (SELECT e.prepedido_id AS id,e.produto_id,e.estado,e.quantidade,c.nick',
    'FROM akitemm_prepedido_entregas_sandbox_staging e',
    'JOIN akitemm_conta_unica_candidata c ON c.id=e.titular_id',
    'ORDER BY e.criado_em DESC,e.prepedido_id DESC,e.produto_id DESC)'
   ].join(' '),[],pagina,x=>({id:x.id,prepedidoId:x.id,titulo:x.nick+' · '+x.produto_id,
    detalhe:x.estado+' · quantidade '+x.quantidade}));
   saida.metricas=resumoPares(['Linhas de entrega simulada',resultado.total],
    ['Expedição real','Não habilitada']);
  }else if(codigo==='INDICACOES'){
   resultado=paginaSQL(db,[
    'FROM (SELECT i.indicado_id AS id,indicador.nick AS indicador,',
    'indicado.nick AS indicado,q.posicao_alvo_id AS posicaoId',
    'FROM akitemm_convites_candidatos_lab i',
    'JOIN akitemm_conta_unica_candidata indicador ON indicador.id=i.indicador_id',
    'JOIN akitemm_conta_unica_candidata indicado ON indicado.id=i.indicado_id',
    'LEFT JOIN akitemm_motor_indicacoes_qualificadas_lab q ON q.indicado_id=i.indicado_id',
    'ORDER BY i.criado_em DESC,i.indicado_id DESC)'
   ].join(' '),[],pagina,x=>({id:x.id,titulo:x.indicador+' indicou '+x.indicado,
    detalhe:x.posicaoId?'Qualificada no ensaio · posição #'+x.posicaoId:
     'Cadastro vinculado · compra ainda não qualificada'}));
   saida.metricas=resumoPares(['Cadastros indicados',resultado.total],
    ['Indicações qualificadas no ensaio',total('akitemm_motor_indicacoes_qualificadas_lab')]);
  }else if(codigo==='POSICOES'){
   resultado=paginaSQL(db,[
    'FROM (SELECT l.numero_posicao AS id,l.prepedido_id AS prepedidoId,',
    'l.ordinal,c.nick FROM akitemm_motor_ensaio_lotes_pedido l',
    'JOIN akitemm_conta_unica_candidata c ON c.id=l.titular_id',
    'ORDER BY l.numero_posicao DESC)'
   ].join(' '),[],pagina,x=>({id:String(x.id),prepedidoId:x.prepedidoId,
    titulo:'#'+x.id+' · '+x.nick,detalhe:'Pedido '+x.prepedidoId+' · unidade '+x.ordinal}));
   saida.metricas=resumoPares(['Posições vinculadas ao ensaio',resultado.total],
    ['Posições comerciais reais',0]);
  }else if(codigo==='FILAS'||codigo==='TABULEIRO'){
   const m=motorConta.consultar();
   if(codigo==='FILAS'){
    const filas=[
     ...m.filaA.map(x=>({...x,fila:'A'})),
     ...m.filaB.map(x=>({...x,fila:'B'}))];
    resultado={total:filas.length,registros:filas.slice(pagina*20,(pagina+1)*20).map(x=>({
     id:String(x.id),titulo:'Posição #'+x.id+' · Fila '+x.fila,
     detalhe:x.empresa?'Empresa (ensaio)':'Titular da posição no motor (ensaio)'}))};
    saida.metricas=resumoPares(['Fila A',m.filaA.length],['Fila B',m.filaB.length],
     ['Alimentação',m.ordemAlimentacao]);
   }else{
    const itens=[
     ...(m.tabuleiro.centro?[{...m.tabuleiro.centro,vaga:'Centro'}]:[]),
     ...m.tabuleiro.vagas.flatMap((x,i)=>x?[{...x,vaga:'Vaga '+(i+1)}]:[])];
    resultado={total:itens.length,registros:itens.slice(pagina*20,(pagina+1)*20).map(x=>({
     id:String(x.id),titulo:x.vaga+' · posição #'+x.id,
     detalhe:x.empresa?'Empresa (ensaio)':'Ocupação do motor (ensaio)'}))};
    saida.metricas=resumoPares(['Ocupantes',itens.length],
     ['Eventos do ciclo',m.tabuleiro.eventosNoCiclo+'/6'],
     ['Ciclos concluídos',m.tabuleiro.ciclosConcluidos],
     ['Catraca',m.catraca.estado],['Modo de execução',m.agenda.modoExecucao]);
   }
  }else if(codigo==='COFRES'||codigo==='SAQUES'){
   saida.metricas=resumoPares(['Saldo real','Não habilitado'],
    ['Movimentação financeira','Bloqueada para operação comercial']);
  }else if(codigo==='SEGURANCA'){
   const sqlOk=db.prepare('PRAGMA quick_check').get().quick_check==='ok';
   const fks=db.prepare('PRAGMA foreign_key_check').all().length;
   const psps=auditarRelacoesPspCandidato({banco:db});
   saida.metricas=resumoPares(['SQLite íntegro',sqlOk?'SIM':'NÃO'],
    ['Vínculos de chave estrangeira inconsistentes',fks],
    ['Inconsistências PSP/relacionais',psps.totalInconsistencias]);
   saida.estado=sqlOk&&fks===0&&psps.totalInconsistencias===0?
    'AUDITORIA_LAB':'REVISAR_INTEGRIDADE_LAB';
  }else{
   resultado=paginaSQL(db,[
    "FROM (SELECT id,titulo,situacao FROM akitemm_admin_missoes_staging",
    "WHERE departamento='OUTROS' ORDER BY atualizado_em DESC,id DESC)"
   ].join(' '),[],pagina,x=>({id:x.id,titulo:x.titulo,detalhe:'Missão '+x.situacao}));
   saida.metricas=resumoPares(['Missões operacionais diversas',resultado.total]);
  }
  saida.total=resultado.total;saida.registros=resultado.registros;
  saida.haMais=(pagina+1)*20<resultado.total;
  saida.mensagem=saida.estado==='BLOQUEADO_COMERCIAL'?
   'Controle de ensaio disponível para auditoria e missões; operação comercial e saldo real permanecem bloqueados.':
   resultado.total===0?'Ainda não há registros deste departamento no SQLite. Os controles abaixo continuam disponíveis.':
   'Dados operacionais consultados na mesma base do cliente, loja e motor.';
  return saida;
 };
}
module.exports={criarPaginaOperacional,AREAS};
