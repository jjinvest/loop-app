'use strict';
// Fonte visual única do tabuleiro LOOP: o servidor decide posições e eventos.
// Nunca completa filas, acende luzes ou identifica terceiros por estimativa.
(function(){
 function criar({elemento,aoAbrirPosicao}={}){
  if(typeof elemento!=='function')
   throw Error('TABULEIRO_ELEMENTO_OBRIGATORIO');
  const $=elemento;
  function dourada(p){return p?.dourada===true||p?.empresa===true;}
  function pendente(p){return p?.pendente===true||p?.statusAdesao==='PENDENTE'||
   p?.estadoAdesao==='PENDENTE';}
  function aceito(p){return p?.aceiteEnsaio===true||
   p?.statusAdesao==='ACEITE_ENSAIO'||p?.estadoAdesao==='ACEITE_ENSAIO';}
  function rotuloDourada(p){
   if(!dourada(p))return '';
   const n=typeof p.numeroVisual==='string'&&
    /^[0-9]{1,8}$/.test(p.numeroVisual)?'#'+p.numeroVisual:'';
   const nome=typeof p.nomeVisual==='string'&&p.nomeVisual.length<=24?
    p.nomeVisual:'';
   return [n,nome].filter(Boolean).join('\n');
  }
  function numero(p,centro=false){
   if(!p)return centro?'#0000':'—';
   if(dourada(p))return rotuloDourada(p)||'●';
   if(!Number.isSafeInteger(p.numero)||p.numero<1)
    throw Error('POSICAO_NUMERO_INVALIDO');
   return '#'+p.numero;
  }
  function preencherVaga(id,p,centro=false){
   const area=$(id);
   if(!area)throw Error('VAGA_VISUAL_NAO_EXISTE');
   const esfera=area.closest('.espaco-tabuleiro-demo');
   if(!esfera)throw Error('ESTRUTURA_TABULEIRO_DIVERGENTE');
   // Cor efetiva no próprio círculo: não depende da prioridade de CSS
   // antigo (estado, fila, aceite ou posicao pessoal).
   const aparencia=dourada(p)?{
    fundo:'radial-gradient(circle at 28% 17%,#fff2b5 0%,#ebc35d 43%,#d29d28 76%,#8b570e 100%)',
    borda:'#fff0ae'
   }:centro?{
    fundo:'radial-gradient(circle at 28% 17%,#caffdf 0%,#51d598 42%,#138658 77%,#075237 100%)',
    borda:'#dbf2db'
   }:id==='tabuleiroMotorVaga6'?{
    fundo:'radial-gradient(circle at 28% 17%,#ffb8bd 0%,#ef535c 47%,#ba2439 80%,#761528 100%)',
    borda:'#ffbec3'
   }:{
    fundo:'radial-gradient(circle at 28% 17%,#fff 0%,#f6f8fa 37%,#dce4ec 77%,#a5b0c1 100%)',
    borda:'#f6f9ff'
   };
   if(typeof esfera.style?.setProperty==='function'){
    esfera.style.setProperty('background',aparencia.fundo,'important');
    esfera.style.setProperty('border-color',aparencia.borda,'important');
   }else if(esfera.style){
    esfera.style.background=aparencia.fundo;
    esfera.style.borderColor=aparencia.borda;
   }
   area.textContent=numero(p,centro);
   // Exibir nick somente quando o backend já tiver fornecido dado autorizado.
   // Sem identidade disponível, o espaço reservado permanece vazio.
   const nickArea=esfera.querySelector?.('.nick-posicao-tabuleiro');
   if(nickArea)nickArea.textContent=typeof p?.nickVisual==='string'&&
    /^[A-Za-z]{1,12}$/.test(p.nickVisual)?p.nickVisual:'';
   area.classList.toggle('posicao-dourado',dourada(p));
   area.classList.toggle('posicao-azul',pendente(p));
   area.classList.toggle('posicao-verde',aceito(p));
   // A classe ACEITE indica estado de adesao, NAO que uma vaga
   // periferica seja o centro verde. As cores visuais do tabuleiro
   // seguem titularidade/filas/pendencia/empresa.
   area.classList.toggle('posicao-cliente',p?.minha===true);
   area.classList.toggle('posicao-fila-a',p?.fila==='A');
   area.classList.toggle('posicao-fila-b',p?.fila==='B');
   area.classList.toggle('posicao-vazia',!p);
   area.classList.toggle('loop03-iluminada',p?.minha===true);
   esfera.setAttribute('aria-label',(centro?'Centro':'Vaga do tabuleiro')+
    ': '+(p?(dourada(p)?'dourada · ':'')+numero(p).replace('\n',' · '):
    'vazio')+(p?.minha?' · minha posição':''));
  }
  function preencherFila(id,itens,tipo,{inicio=0,exibirNomesTeste=false}={}){
   if(!Number.isSafeInteger(inicio)||inicio<0)throw Error('FILA_INICIO_INVALIDO');
   if(tipo!=='A'&&tipo!=='B')throw Error('FILA_INVALIDA');
   const area=$(id);
   if(!area)throw Error('FILA_VISUAL_NAO_EXISTE');
   area.replaceChildren();
   // Contagem da origem real: cada linha é SOMENTE um lugar ordinal
   // anônimo. Nunca inferir ou inventar identidade, ID ou estado de terceiros.
   const contagem=Number.isSafeInteger(itens)&&itens>=0?itens:null;
   if(contagem===null&&!Array.isArray(itens))throw Error('FILA_FONTE_INVALIDA');
   if(contagem===0||Array.isArray(itens)&&itens.length===0){
    const vazio=document.createElement('p');
    vazio.className='subtexto';vazio.textContent='Fila vazia';
    area.append(vazio);return;
   }
   const adicionar=(p,indice)=>{
    const ordem=Number.isSafeInteger(p?.ordem)&&p.ordem>0?
     p.ordem:inicio+indice+1;
    const linha=document.createElement('div');
    linha.className='loop03-linha-fila';
    const numeroPosicao=Number.isSafeInteger(p?.numero)&&p.numero>0?p.numero:null;
    const ouro=dourada(p);
    const nick=!ouro&&typeof p?.nickVisual==='string'&&/^[A-Za-z]{1,12}$/.test(p.nickVisual)?p.nickVisual:'';
    const nomeTeste=!ouro&&exibirNomesTeste===true&&typeof p?.nome==='string'?p.nome.trim().slice(0,70):'';
    const detalhe=nick||nomeTeste;
    const ordemBranca=document.createElement('span');
    ordemBranca.className='loop03-fila-ordinal-branca';
    ordemBranca.textContent=String(ordem);
    ordemBranca.setAttribute('aria-label','Lugar '+ordem+' na fila');
    const inicial=document.createElement('button');
    inicial.type='button';
    inicial.className='loop03-inicial-fila loop03-bola-interativa '+(ouro?'loop03-dourada':pendente(p)?'loop03-azul':aceito(p)?'loop03-verde':tipo==='A'?'loop03-a':'loop03-b');
    const identificacao=document.createElement('span');
    identificacao.className='loop03-numero-titular';
    const numeroCompleto=numeroPosicao===null?'':'#'+numeroPosicao;
    identificacao.textContent=numeroCompleto.length>8?numeroCompleto.slice(0,7)+'…':numeroCompleto;
    inicial.append(identificacao);
    if(detalhe){
     const nome=document.createElement('small');
     nome.className='loop03-nick-bola';
     nome.textContent=detalhe;inicial.append(nome);
    }
    const rotulo=[ouro?'Bola dourada':'Posição',numeroCompleto,detalhe].filter(Boolean).join(' ');
    inicial.setAttribute('aria-label',rotulo);
    inicial.setAttribute('title',rotulo);
    inicial.disabled=numeroPosicao===null||typeof aoAbrirPosicao!=='function';
    if(!inicial.disabled)inicial.addEventListener('click',evento=>{
     evento.stopPropagation();aoAbrirPosicao(p,tipo);
    });
    if(p?.minha===true&&!ouro)linha.classList.add('loop03-minha-fila');
    linha.setAttribute('aria-label','Fila '+tipo+' · lugar '+ordem+' · '+rotulo);
    linha.append(ordemBranca,inicial);
    if(!ouro&&Number.isSafeInteger(p?.indicacoesVinculadas)&&p.indicacoesVinculadas>0){
     const indicador=document.createElement('span');
     indicador.className='loop03-fila-indicacoes';
     const pessoa=document.createElement('span');
     pessoa.className='loop03-fila-pessoa';
     pessoa.setAttribute('aria-hidden','true');
     const total=document.createElement('span');total.textContent=String(p.indicacoesVinculadas);
     indicador.setAttribute('aria-label',p.indicacoesVinculadas+' indicações');
     indicador.append(pessoa,total);linha.append(indicador);
    }
    area.append(linha);
   };
   if(contagem===null){
    if(id==='motorFilaA'||id==='motorFilaB'){
     const limite=Math.min(itens.length,100);
     for(let i=0;i<limite;i++)adicionar(itens[i],i);
     return;
    }
    const LOTE=50;
    if(itens.length<=LOTE){
     itens.forEach((p,i)=>adicionar(p,i));
     return;
    }
    let exibidos=0;
    const proximo=document.createElement('button');
    proximo.type='button';
    proximo.className='alternar-acesso loop03-fila-ver-proximas';
    const acrescentar=()=>{
     const fim=Math.min(itens.length,exibidos+LOTE);
     for(let i=exibidos;i<fim;i++)adicionar(itens[i],i);
     exibidos=fim;proximo.remove();
     if(exibidos<itens.length){
      proximo.textContent='Ver próximas posições ('+(itens.length-exibidos)+' restantes)';
      area.append(proximo);
     }
    };
    proximo.addEventListener('click',acrescentar);
    acrescentar();return;
   }
   // Lotes visuais progressivos: nenhum teto de fila escondido,
   // sem congelar o navegador criando milhares de nós em uma operação.
   const LOTE=50;
   if(contagem<=LOTE){
    for(let i=0;i<contagem;i++)adicionar({ordem:inicio+i+1},i);
    return;
   }
   let exibidos=0;
   const proximo=document.createElement('button');
   proximo.type='button';
   proximo.className='alternar-acesso loop03-fila-ver-proximas';
   const adicionarLote=()=>{
    const fim=Math.min(contagem,exibidos+LOTE);
    for(let i=exibidos;i<fim;i++)adicionar({ordem:inicio+i+1},i);
    exibidos=fim;
    proximo.remove();
    if(exibidos<contagem){
     proximo.textContent='Ver próximas posições ('+(contagem-exibidos)+' restantes)';
     area.append(proximo);
    }
   };
   proximo.addEventListener('click',adicionarLote);
   adicionarLote();
  }
  function preencherLuzes(eventos){
   if(!Number.isSafeInteger(eventos)||eventos<0||eventos>6)
    throw Error('EVENTOS_TABULEIRO_INVALIDOS');
   for(let i=1;i<=6;i++){
    const bola=$('motorBolinha'+i);
    if(!bola)throw Error('LUZ_TABULEIRO_NAO_EXISTE');
    bola.classList.toggle('loop03-marcador-aceso',i<=eventos);
    bola.setAttribute('aria-label','Evento '+i+
     (i<=eventos?' contabilizado':' aguardando'));
   }
  }
  return Object.freeze({preencherVaga,preencherFila,preencherLuzes});
 }
 Object.defineProperty(window,'LoopTabuleiroVisual',{
  value:Object.freeze({criar}),writable:false,configurable:false
 });
})();
