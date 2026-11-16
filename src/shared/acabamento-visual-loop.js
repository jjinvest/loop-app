'use strict';
/* Mesmo acabamento em AKITEMM, LOOP e pré-cadastro; sem alterar o HTML aprovado. */
(()=>{
 const css=document.createElement('style');
 css.textContent=[
  ':where(.akitemm-loja,.cliente-integrado,#painelLogin,#painelCadastro,#painelRecuperacao) button:not(:disabled){transition:filter .16s ease,transform .16s ease,box-shadow .16s ease;-webkit-tap-highlight-color:transparent;touch-action:manipulation}',
  ':where(.akitemm-loja,.cliente-integrado,#painelLogin,#painelCadastro,#painelRecuperacao) button:not(:disabled):hover{filter:brightness(1.11) saturate(1.07);box-shadow:inset 0 1px 0 #fff3,0 4px 12px #0005}',
  ':where(.akitemm-loja,.cliente-integrado,#painelLogin,#painelCadastro,#painelRecuperacao) button:not(:disabled):active{transform:translateY(1px) scale(.975);filter:brightness(1.19) saturate(1.1);box-shadow:inset 0 2px 5px #0005,0 0 0 1px #f5d28b80}',
  ':where(.akitemm-loja,.cliente-integrado,#painelLogin,#painelCadastro,#painelRecuperacao) button:not(:disabled):focus-visible{outline:2px solid #ffe4ab;outline-offset:3px}',
  '@media(prefers-reduced-motion:reduce){:where(.akitemm-loja,.cliente-integrado,#painelLogin,#painelCadastro,#painelRecuperacao) button{transition:none!important}}',
  '.akitemm-loja #akitemmFiltroTodos{background:linear-gradient(#ffe0a1,#e8af4a);color:#11161b;border-color:#d7a249}',
  '.akitemm-loja #akitemmFiltroTodos[aria-pressed="true"]{outline:2px solid #ffd77c;outline-offset:2px}',
  '.akitemm-loja #akitemmSino{color:#eec16b!important}',
  '.akitemm-loja #akitemmSino svg{stroke:currentColor}',
  '.akitemm-loja .cabecalho-loja-loop .akitemm-marca-loop.loop-marca-unificada,.cabecalho .marca.loop-marca-unificada{display:inline-block;white-space:nowrap;font-size:clamp(1.35rem,2.6vw,1.85rem)!important;line-height:1.15;font-weight:950;letter-spacing:.025em;color:#eec47a!important;background:linear-gradient(180deg,#fff2c8 0%,#edbf68 26%,#a97127 46%,#ffe1a1 59%,#c8913e 80%,#8b5b23 100%);background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-shadow:none;filter:drop-shadow(0 2px 1px #070914)}',
  '.akitemm-loja .akitemm-marca-loop.loop-marca-unificada > span,.cabecalho .marca.loop-marca-unificada > span{display:inline-block;vertical-align:baseline;margin-left:.06em;font-size:.72em;font-weight:900;letter-spacing:.035em;color:#e3eaf4;background:linear-gradient(180deg,#fff 0%,#e2eaf6 25%,#8c9aae 46%,#f9fcff 58%,#aebcce 82%,#7b8a9d 100%);background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;-webkit-text-stroke:.18px #d6e1ef;text-shadow:none}',
  '.cliente-integrado .loop03-boasvindas{position:relative}',
  '.cliente-integrado .loop03-boasvindas #loop03Sino{margin-left:auto;flex-shrink:0;align-self:center;min-width:44px;min-height:44px;color:#f1cc7e}',
  '.cliente-integrado .loop03-boasvindas #loop03TotalAvisos{display:inline-flex;align-items:center;justify-content:center;background:#dec078;color:#19171b;border-radius:14px;min-width:16px;padding:0 4px;font-size:11px}',
  '.cliente-integrado .loop03-boasvindas #loop03TotalAvisos[hidden]{display:none}',
  '.cliente-integrado .loop03-boasvindas .loop03-painel-avisos{position:absolute;top:calc(100% + 5px);right:0;left:auto;z-index:100;width:min(370px,calc(100vw - 32px));max-height:65vh}',
  '@media(max-width:520px){.akitemm-loja .cabecalho-loja-loop .akitemm-marca-loop.loop-marca-unificada{font-size:1.35rem!important;letter-spacing:.015em}.cliente-integrado .loop03-boasvindas #loop03Sino{min-width:40px;min-height:40px}}'
 ].join('');
 document.head.append(css);
 function decorar(marca){
  if(!marca||marca.classList.contains('loop-marca-unificada'))return;
  if(!/LOOP\s*3\.0/i.test(marca.textContent))return;
  marca.classList.add('loop-marca-unificada');
  const prata=document.createElement('span');prata.textContent='3.0';
  marca.replaceChildren(document.createTextNode('LOOP '),prata);
 }
 decorar(document.querySelector('.akitemm-loja .akitemm-marca-loop'));
 decorar(document.querySelector('.cabecalho .marca'));
 document.getElementById('akitemmOperadorMais')?.remove();
 document.getElementById('loopOperadorMais')?.remove();
 // A foto permanece na linha de cima; o sino fica na linha de
 // "Meu Escritório Virtual", abaixo da foto e alinhado à direita.
 const boas=document.querySelector('#painelConta .loop03-boasvindas');
 const sino=document.getElementById('loop03Sino');
 const avisos=document.getElementById('loop03PainelAvisos');
 const foto=document.getElementById('loop03AlterarFotoTopo');
 if(boas&&sino&&foto){
  boas.append(sino);
  if(avisos)boas.append(avisos);
 }
})();