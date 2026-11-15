'use strict';
// Preparação da estrutura comercial DEFINITIVA no SQLite real.
// O bootstrap não cadastra clientes, não cria pedidos, não cobra, não
// atribui posições, não aciona PSP/fornecedor e não movimenta dinheiro.
// Todas as peças compartilham UM SQLite operacional, diferente do
// SQLite persistente de fotos/PDF e do banco da prévia.
const {MotorLoopIntegradoSQLite}=require('./motor-loop-integrado-sqlite');
const {LivroFinanceiroRealSQLite}=require('./livro-financeiro-real-sqlite');
const {OperacaoCatracaAdminSQLite}=require('./operacao-catraca-admin-sqlite');
const {AuditoriaOperacionalSQLite}=require('./auditoria-operacional-sqlite');
const {ManutencaoComercialSQLite}=require('./manutencao-comercial-sqlite');
const {CatalogoMultiDistribuidoresSQLite}=require('./catalogo-multidistribuidores-sqlite');
const {ControleEconomicoLojaSQLite}=require('./controle-economico-loja-sqlite');
const {SessaoAdminComercialSQLite}=require('./sessao-admin-comercial-sqlite');
const {montarComercialSemHomologacao}=require('./montar-comercial-sem-homologacao');
const {PreflightCapacidadeCheckoutSQLite}=require('./preflight-capacidade-checkout-sqlite');
const {RecuperacaoReservasCheckoutSQLite}=require('./recuperacao-reservas-checkout-sqlite');
const {PedidosFornecedorOutbox}=require('./pedidos-fornecedor-outbox');
const {DatabaseSync}=require('node:sqlite');
function falha(c){const e=new Error(c);e.codigo=c;throw e;}
function prepararNucleoComercialRealFechado({banco,ambiente=process.env}={}){
 if(!banco||typeof banco.prepare!=='function'||typeof banco.exec!=='function')
  falha('NUCLEO_REAL_BANCO_NAO_CONFIGURADO');
 if(ambiente.LOOP_REAL_NUCLEO_COMERCIAL_INTERNO!=='SIM'||
    ambiente.LOOP_REAL_CADASTRO_GO!=='NAO'||
    ambiente.LOOP_REAL_APROVACAO_DOCUMENTOS!=='NAO'||
    ambiente.LOOP_REAL_DADOS_SEPARADOS!=='SIM'||
    ambiente.LOOP_CLIENTES_LAB==='SIM'||
    ambiente.LOOP_MODO_SIMULACAO==='1')
  falha('NUCLEO_REAL_PREPARACAO_FECHADA_OBRIGATORIA');
 const segredo=n=>{
  const v=ambiente[n];
  if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))
   falha('NUCLEO_REAL_CHAVE_AUSENTE_'+n);
  return Buffer.from(v,'hex');
 };
 const chaveAuditoria=segredo('LOOP_REAL_CHAVE_AUDITORIA');
 const chavePedidos=segredo('LOOP_REAL_CHAVE_PEDIDOS');
 const chaveAdmin=segredo('LOOP_REAL_CHAVE_ADMIN');
 const segredos=[chaveAuditoria,chavePedidos,chaveAdmin,
  segredo('LOOP_REAL_CHAVE_EMAIL'),segredo('LOOP_REAL_CHAVE_CIFRA'),
  segredo('LOOP_REAL_CHAVE_CODIGO'),segredo('LOOP_REAL_CHAVE_BACKUP')];
 for(let i=0;i<segredos.length;i++)
  for(let j=i+1;j<segredos.length;j++)
   if(segredos[i].equals(segredos[j]))
    falha('NUCLEO_REAL_CUSTODIAS_NAO_INDEPENDENTES');
 const credencial=ambiente.LOOP_REAL_ADMIN_CREDENCIAL;
 if(typeof credencial!=='string'||credencial.length<24||
    credencial.length>256)falha('NUCLEO_REAL_ADMIN_INDISPONIVEL');
 // Nenhum dado pessoal nasce aqui. A migração, se aprovada, tem
 // ferramenta e autorização próprias e NUNCA herda saldos de ensaio.
 if(banco.prepare('SELECT COUNT(*) AS n FROM loop_real_contas').get().n!==0)
  falha('NUCLEO_REAL_REQUER_MIGRACAO_CONTROLADA');
 const motor=new MotorLoopIntegradoSQLite({banco});
 const financeiro=new LivroFinanceiroRealSQLite({banco});
 const catraca=new OperacaoCatracaAdminSQLite({banco,motor});
 const auditoria=new AuditoriaOperacionalSQLite({banco,chaveAuditoria});
 const manutencao=new ManutencaoComercialSQLite({banco,auditoria});
 const catalogo=new CatalogoMultiDistribuidoresSQLite({
  banco,distribuidorHomologado:()=>false,auditoria,manutencao
 });
 new ControleEconomicoLojaSQLite({banco,auditoria,manutencao});
 // A autenticação administrativa fica preparada no banco; não se abre
 // qualquer rota/admin pública nesta etapa sem o release formal.
 new SessaoAdminComercialSQLite({
  banco,chaveAdmin,credencialAdmin:credencial
 });
 const comercial=montarComercialSemHomologacao({
  banco,chavePedidos,auditoria,manutencao,catalogoLeitura:catalogo
 });
 // Persistir a outbox definitiva com respostas externas fechadas.
 // Nenhum adaptador ou transporte de fornecedor pode sair deste bootstrap.
 new PedidosFornecedorOutbox({
  banco,chavePedidos,
  registro:{obter:()=>null},
  consultarPagamentoConciliado:async()=>null,
  consultarPedidoAprovado:async()=>null,
  consultarLiberacaoCustoFornecedor:async()=>null
 });
 const preflight=new PreflightCapacidadeCheckoutSQLite({
  banco,motor,classificacaoLoop:comercial.classificacaoLoop
 });
 const reservas=new RecuperacaoReservasCheckoutSQLite({banco,preflight});
 const provas={
  motor:motor.verificar(),
  financeiro:financeiro.verificar(),
  catraca:catraca.verificar(),
  auditoria:(()=>{const r=auditoria.verificar();return {
   integridade:r.integra===true?'OK':'DIVERGENTE'};})(),
  cores:comercial.classificacaoLoop.verificar(),
  eventos:comercial.eventosComerciais.verificar(),
  preflight:preflight.verificar(),
  reservas:reservas.verificar()
 };
 for(const [nome,prova] of Object.entries(provas)){
  if(!prova||prova.integridade!=='OK')
   falha('NUCLEO_REAL_INTEGRIDADE_'+nome.toUpperCase());
 }
 return Object.freeze({
  nucleoRealPersistente:true,mesmoSqliteOperacional:true,
  componentesIntegrados:Object.keys(provas),
  cadastroLiberado:false,checkoutLiberado:false,
  fornecedoresLiberados:false,pagamentosLiberados:false,
  saquesLiberados:false,simulacaoImportada:false,
  catracaPausada:catraca.consultar().pausada,
  pedidosReais:comercial.leituraPedidos.contarDoTitular?0:null
 });
}
// Prova read-only no volume REAL. Não aceita IDs fornecidos pelo navegador.
function consultarNucleoComercialRealFechado({arquivo,permitirTeste=false}={}){
 if(arquivo!=='/dados-reais/clientes.sqlite'&&
    !(permitirTeste===true&&process.env.NODE_ENV!=='production'&&
      typeof arquivo==='string'&&arquivo.endsWith('.sqlite')))
  falha('NUCLEO_REAL_DIAGNOSTICO_ORIGEM_INVALIDA');
 const db=new DatabaseSync(arquivo,{readOnly:true});
 try{
  const necessarias=[
   'loop_real_contas','loop_real_motor_estado',
   'loop_real_fin_lancamentos','loop_real_catraca_admin_politica',
   'loja_real_auditoria_admin','loja_real_manutencao_comercial',
   'loja_real_sessoes_admin','loja_real_produtos',
   'loja_real_ofertas_distribuidores','loja_real_custos_ofertas',
   'loja_real_pedidos','loja_real_custos_pedido',
   'loja_real_outbox_fornecedor','loop_real_eventos_comerciais',
   'loop_real_regras_cor','loop_real_checkout_reservas_posicoes',
   'loop_real_checkout_reconsultas_pendentes'
  ];
  const tabelas=new Set(db.prepare(
   "SELECT name FROM sqlite_master WHERE type='table'"
  ).all().map(x=>x.name));
  if(necessarias.some(t=>!tabelas.has(t))||
     db.prepare('PRAGMA quick_check').get().quick_check!=='ok')
   falha('NUCLEO_REAL_ESQUEMA_OU_INTEGRIDADE_DIVERGENTE');
  const contar=t=>db.prepare('SELECT COUNT(*) AS n FROM '+t).get().n;
  const contas=contar('loop_real_contas'),
        pedidos=contar('loja_real_pedidos'),
        giros=contar('loop_real_catraca_admin_giros'),
        lancamentos=contar('loop_real_fin_lancamentos');
  const p=db.prepare(
   'SELECT modo FROM loop_real_catraca_admin_politica WHERE id=1'
  ).get();
  if(contas!==0||pedidos!==0||giros!==0||lancamentos!==0||
     p?.modo!=='PAUSADA')
   falha('NUCLEO_REAL_PREPARACAO_NAO_E_VAZIA_OU_PAUSADA');
  return Object.freeze({
   origem:'SQLITE_OPERACIONAL_REAL',estruturaIntegra:true,
   componentes:necessarias.length,contas:0,pedidos:0,
   giros:0,lancamentosFinanceiros:0,catracaPausada:true,
   cadastroAberto:false,checkoutAberto:false,
   pagamentosHabilitados:false,saquesHabilitados:false
  });
 }finally{db.close();}
}

module.exports={prepararNucleoComercialRealFechado,consultarNucleoComercialRealFechado};
