'use strict';

// Contrato versionado para futuras APIs de dropshipping.
// Este registro so consulta dados internos/simulados; nao transmite pedidos
// nem enderecos, nao tem credenciais e nao faz chamadas HTTP.
// Adaptadores podem implementar listarProdutos() como capacidade OPCIONAL;
// os metodos de estoque/status do contrato v1 permanecem inalterados.
const CONTRATO_FORNECEDOR = 1;

function codigo(x, campo) {
  if (typeof x !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(x)) {
    throw new Error(campo + ' invalido');
  }
  return x;
}

class RegistroFornecedores {
  constructor() {
    this.adaptadores = new Map();
  }

  registrar({ fornecedorId, adaptador } = {}) {
    codigo(fornecedorId,'fornecedorId');
    if (!adaptador || adaptador.versaoContrato !== CONTRATO_FORNECEDOR ||
        typeof adaptador.consultarEstoque !== 'function' ||
        typeof adaptador.consultarStatus !== 'function') {
      throw new Error('Adaptador nao atende ao contrato v1');
    }
    if (this.adaptadores.has(fornecedorId)) {
      throw new Error('Fornecedor ja cadastrado; use substituir de forma explicita');
    }
    this.adaptadores.set(fornecedorId, adaptador);
  }

  substituir({ fornecedorId, adaptador } = {}) {
    codigo(fornecedorId,'fornecedorId');
    if (!this.adaptadores.has(fornecedorId)) throw new Error('Fornecedor nao encontrado');
    if (!adaptador || adaptador.versaoContrato !== CONTRATO_FORNECEDOR ||
        typeof adaptador.consultarEstoque !== 'function' ||
        typeof adaptador.consultarStatus !== 'function') {
      throw new Error('Adaptador nao atende ao contrato v1');
    }
    this.adaptadores.set(fornecedorId, adaptador);
  }

  obter(fornecedorId) {
    codigo(fornecedorId,'fornecedorId');
    const adapter = this.adaptadores.get(fornecedorId);
    if (!adapter) throw new Error('Fornecedor nao cadastrado');
    return adapter;
  }

  // Diagnostico de encaixe tecnico; nao executa chamadas externas nem
  // afirma que um parceiro fisico inexiste. O fornecedor pode ja estar
  // contratado e apenas nao ter sido conectado a plataforma AKITEMM.
  diagnosticarIntegracao({fornecedorId}={}){
    codigo(fornecedorId,'fornecedorId');
    const adaptador=this.adaptadores.get(fornecedorId);
    if(!adaptador)return {
      fornecedorId,adaptadorConectado:false,apiHomologada:false,
      freteRealDisponivel:false,pedidosExternosDisponiveis:false,
      consultaStatusDisponivel:false,checkoutHabilitado:false,
      pendencias:['ADAPTADOR_API_FORNECEDOR_NAO_CONECTADO']
    };
    const recursos={
      consultarEstoque:typeof adaptador.consultarEstoque==='function',
      consultarStatus:typeof adaptador.consultarStatus==='function',
      cotarFrete:typeof adaptador.cotarFrete==='function',
      enviarPedidoIdempotente:
        typeof adaptador.enviarPedidoIdempotente==='function',
      consultarPedidoPorChave:
        typeof adaptador.consultarPedidoPorChave==='function'
    };
    const pendencias=Object.entries(recursos).filter(([,ok])=>!ok)
      .map(([nome])=>'API_SEM_'+nome.toUpperCase());
    return {fornecedorId,adaptadorConectado:true,
      apiHomologada:false,
      freteRealDisponivel:recursos.cotarFrete,
      pedidosExternosDisponiveis:recursos.enviarPedidoIdempotente,
      consultaStatusDisponivel:recursos.consultarStatus,
      checkoutHabilitado:false,
      pendencias};
  }

  async consultarEstoque({ fornecedorId, sku } = {}) {
    codigo(sku,'sku');
    const resposta = await this.obter(fornecedorId).consultarEstoque({ sku });
    if (!resposta || typeof resposta !== 'object' ||
        !Number.isSafeInteger(resposta.quantidade) || resposta.quantidade < 0) {
      throw new Error('Fornecedor retornou estoque invalido');
    }
    return {
      fornecedorId,
      sku,
      quantidade: resposta.quantidade,
      disponivel: resposta.quantidade > 0
    };
  }

  // Contrato OPCIONAL de cotacao de frete direto com o fornecedor.
  // Nao existe tarifa padrao nem fallback inventado: ate conectar a
  // API autorizada da franquia, nenhuma cotacao sera exibida no checkout.
  async cotarFrete({ fornecedorId, cepDestino, itens } = {}) {
    codigo(fornecedorId,'fornecedorId');
    if (typeof cepDestino !== 'string' ||
        !/^[0-9]{5}-?[0-9]{3}$/.test(cepDestino)) {
      throw new Error('CEP de destino invalido');
    }
    if (!Array.isArray(itens) || itens.length < 1 || itens.length > 20) {
      throw new Error('Itens de cotacao invalidos');
    }
    const vistos=new Set();
    const validados=itens.map(item=>{
      if(!item || typeof item!=='object' || Array.isArray(item)) {
        throw new Error('Item de cotacao invalido');
      }
      const sku=codigo(item.sku,'sku');
      if(!Number.isSafeInteger(item.quantidade) ||
         item.quantidade<1 || item.quantidade>50 ||
         vistos.has(sku)) {
        throw new Error('Quantidade ou SKU de frete invalido');
      }
      vistos.add(sku);
      return {sku,quantidade:item.quantidade};
    });
    const adaptador=this.obter(fornecedorId);
    if(typeof adaptador.cotarFrete!=='function'){
      throw new Error('FRETE_FORNECEDOR_NAO_INTEGRADO');
    }
    // Somente CEP e SKUs, sem nome, CPF ou endereco completo.
    const resposta=await adaptador.cotarFrete({
      cepDestino:cepDestino.replace('-',''),itens:validados
    });
    if(!resposta || !Array.isArray(resposta.opcoes) ||
       resposta.opcoes.length<1 || resposta.opcoes.length>10) {
      throw new Error('FRETE_FORNECEDOR_RESPOSTA_INVALIDA');
    }
    const servicos=new Set();
    const opcoes=resposta.opcoes.map(x=>{
      if(!x || typeof x!=='object' ||
         typeof x.servicoId!=='string' ||
         !/^[A-Za-z0-9_-]{1,80}$/.test(x.servicoId) ||
         typeof x.cotacaoId!=='string' ||
         !/^[A-Za-z0-9_-]{1,120}$/.test(x.cotacaoId) ||
         servicos.has(x.servicoId) ||
         !Number.isSafeInteger(x.valorCentavos) ||
         x.valorCentavos<0 || x.valorCentavos>10000000 ||
         !Number.isSafeInteger(x.prazoDiasUteis) ||
         x.prazoDiasUteis<0 || x.prazoDiasUteis>120 ||
         typeof x.expiraEm!=='string' ||
         !Number.isFinite(Date.parse(x.expiraEm)) ||
         Date.parse(x.expiraEm)<=Date.now()) {
        throw new Error('FRETE_FORNECEDOR_RESPOSTA_INVALIDA');
      }
      servicos.add(x.servicoId);
      return {servicoId:x.servicoId,cotacaoId:x.cotacaoId,
        valorCentavos:x.valorCentavos,
        prazoDiasUteis:x.prazoDiasUteis,expiraEm:x.expiraEm};
    });
    return {
      fornecedorId,cepDestino:cepDestino.replace('-',''),opcoes,
      origem:'API_DO_FORNECEDOR',consultaRealizadaNoServidor:true,
      naoEhPagamento:true,
      // A confirmacao de preco/prazo continua dependente da API contratada.
      pedidoEnviadoAoFornecedor:false
    };
  }

  async consultarStatus({ fornecedorId, pedidoParceiroId } = {}) {
    codigo(pedidoParceiroId,'pedidoParceiroId');
    const resposta = await this.obter(fornecedorId).consultarStatus({ pedidoParceiroId });
    const permitidos = ['PENDENTE','EM_SEPARACAO','EM_TRANSPORTE','ENTREGUE','FALHA'];
    if (!resposta || !permitidos.includes(resposta.status)) {
      throw new Error('Fornecedor retornou status invalido');
    }
    return { fornecedorId, pedidoParceiroId, status: resposta.status };
  }
}

module.exports = { RegistroFornecedores, CONTRATO_FORNECEDOR };
