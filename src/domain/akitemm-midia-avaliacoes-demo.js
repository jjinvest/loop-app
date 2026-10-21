'use strict';
// Upload binário seguro do LABORATÓRIO AKITEMM. Nunca aceita SVG/HTML ou
// arquivos de mídia remotos. O SQLite mantém originais sanitizados e privados.
const MAX_FOTO=3*1024*1024,MAX_VIDEO=25*1024*1024;
function erro(c){const e=new Error(c);e.codigo=c;return e;}
function grupos(buf,inicio,fim){
 const saida=[];let p=inicio;
 while(p+8<=fim){
  let len=buf.readUInt32BE(p),hdr=8;const tipo=buf.toString('ascii',p+4,p+8);
  if(len===1){if(p+16>fim)throw erro('VIDEO_INVALIDO');let n=buf.readBigUInt64BE(p+8);
   if(n>BigInt(Number.MAX_SAFE_INTEGER))throw erro('VIDEO_INVALIDO');len=Number(n);hdr=16;
  }else if(len===0)len=fim-p;
  if(len<hdr||p+len>fim)throw erro('VIDEO_INVALIDO');
  saida.push({tipo,inicio:p+hdr,fim:p+len,tamanho:len-hdr});p+=len;
 }
 if(p!==fim)throw erro('VIDEO_INVALIDO');
 return saida;
}
function duracaoMp4(buf){
 if(buf.length<1024||buf.toString('ascii',4,8)!=='ftyp')throw erro('VIDEO_INVALIDO');
 const caixas=grupos(buf,0,buf.length);
 const moov=caixas.find(x=>x.tipo==='moov');
 const mdat=caixas.find(x=>x.tipo==='mdat'&&x.tamanho>=256);
 if(!moov||!mdat)throw erro('VIDEO_INVALIDO');
 const filhas=grupos(buf,moov.inicio,moov.fim),mvhd=filhas.find(x=>x.tipo==='mvhd');
 if(!mvhd)throw erro('VIDEO_INVALIDO');
 const v=buf[mvhd.inicio];
 const off=v===0?12:v===1?20:-1;
 if(off<0||mvhd.inicio+off+(v===1?12:8)>mvhd.fim)throw erro('VIDEO_INVALIDO');
 const vezes=buf.readUInt32BE(mvhd.inicio+off);
 const duracao=v===1?Number(buf.readBigUInt64BE(mvhd.inicio+off+4)):
  buf.readUInt32BE(mvhd.inicio+off+4);
 const segundos=duracao/vezes;
 if(!vezes||!Number.isFinite(segundos)||segundos<0.1||segundos>30)
  throw erro('VIDEO_DURACAO_INVALIDA');
 let temVideo=false;
 for(const trak of filhas.filter(x=>x.tipo==='trak')){
  const mdia=grupos(buf,trak.inicio,trak.fim).find(x=>x.tipo==='mdia');
  if(!mdia)continue;
  const handler=grupos(buf,mdia.inicio,mdia.fim).find(x=>x.tipo==='hdlr');
  if(handler&&handler.inicio+12<=handler.fim&&
   buf.toString('ascii',handler.inicio+8,handler.inicio+12)==='vide'){
   temVideo=true;break;
  }
 }
 if(!temVideo)throw erro('VIDEO_INVALIDO');
 return segundos;
}
function limparJpeg(b){
 if(b.length<100||b[0]!==255||b[1]!==216||b[b.length-2]!==255||b[b.length-1]!==217)
  throw erro('FOTO_INVALIDA');
 const p=[b.subarray(0,2)];let pos=2,encontrouSOS=false,encontrouSOF=false;
 while(pos+4<=b.length){
  if(b[pos]!==255)throw erro('FOTO_INVALIDA');
  const codigo=b[pos+1];if(codigo===218){
   if(!encontrouSOF)throw erro('FOTO_INVALIDA');
   p.push(b.subarray(pos));encontrouSOS=true;break;
  }
  if(codigo===217)break;
  if(codigo===216||codigo===1||codigo>=208&&codigo<=215)throw erro('FOTO_INVALIDA');
  const len=b.readUInt16BE(pos+2);if(len<2||pos+2+len>b.length)throw erro('FOTO_INVALIDA');
  if([192,193,194].includes(codigo)){
   const h=b.readUInt16BE(pos+5),w=b.readUInt16BE(pos+7);
   if(!h||!w||w*h>36e6||h>9000||w>9000)throw erro('FOTO_DIMENSOES_INVALIDAS');
   encontrouSOF=true;
  }
  // Retira APP1..APP15 e COM: EXIF, XMP, geolocalização e comentários.
  if(!((codigo>=225&&codigo<=239)||codigo===254))
   p.push(b.subarray(pos,pos+2+len));
  pos+=2+len;
 }
 if(!encontrouSOS)throw erro('FOTO_INVALIDA');
 return Buffer.concat(p);
}
function limparPng(b){
 const assinatura=Buffer.from([137,80,78,71,13,10,26,10]);
 if(b.length<57||!b.subarray(0,8).equals(assinatura))throw erro('FOTO_INVALIDA');
 let pos=8,temIHDR=false,temIDAT=false,temIEND=false;
 const blocos=[assinatura];
 while(pos+12<=b.length){
  const n=b.readUInt32BE(pos),fim=pos+12+n;
  if(n>MAX_FOTO||fim>b.length)throw erro('FOTO_INVALIDA');
  const tipo=b.toString('ascii',pos+4,pos+8);
  if(tipo==='IHDR'){
   if(temIHDR||n!==13)throw erro('FOTO_INVALIDA');
   const w=b.readUInt32BE(pos+8),h=b.readUInt32BE(pos+12);
   if(!w||!h||w*h>36e6||w>9000||h>9000)throw erro('FOTO_DIMENSOES_INVALIDAS');
   temIHDR=true;
  }
  if(tipo==='IDAT')temIDAT=true;
  if(tipo==='IEND'){temIEND=true;if(fim!==b.length)throw erro('FOTO_INVALIDA');}
  // Mantém apenas pixels e as chunks de transparência/cor essenciais;
  // nunca armazena eXIf, tEXt, iTXt, zTXt, tIME, nem XMP embutido.
  if((tipo.charCodeAt(0)&32)===0||['tRNS','gAMA','sRGB'].includes(tipo))
   blocos.push(b.subarray(pos,fim));
  pos=fim;if(temIEND)break;
 }
 if(!temIHDR||!temIDAT||!temIEND)throw erro('FOTO_INVALIDA');
 return Buffer.concat(blocos);
}
function limparWebp(b){
 if(b.length<40||b.toString('ascii',0,4)!=='RIFF'||
  b.toString('ascii',8,12)!=='WEBP'||b.readUInt32LE(4)+8!==b.length)
  throw erro('FOTO_INVALIDA');
 let pos=12,visual=false;const chun=[];
 while(pos+8<=b.length){
  const tipo=b.toString('ascii',pos,pos+4),n=b.readUInt32LE(pos+4);
  const end=pos+8+n+(n%2);
  if(end>b.length)throw erro('FOTO_INVALIDA');
  if(['VP8 ','VP8L','ANMF'].includes(tipo))visual=true;
  if(!['EXIF','XMP '].includes(tipo)){
   const item=Buffer.from(b.subarray(pos,end));
   if(tipo==='VP8X'&&n>=10)item[8]&=~0x0c;
   chun.push(item);
  }
  pos=end;
 }
 if(pos!==b.length||!visual)throw erro('FOTO_INVALIDA');
 const out=Buffer.concat([b.subarray(0,12),...chun]);
 out.writeUInt32LE(out.length-8,4);
 return out;
}
function validar({tipo,mime,dados}={}){
 if(!Buffer.isBuffer(dados)||!dados.length)throw erro('MIDIA_INVALIDA');
 if(tipo==='FOTO'){
  if(dados.length>MAX_FOTO)throw erro('FOTO_GRANDE_DEMAIS');
  const processar={
   'image/jpeg':limparJpeg,'image/png':limparPng,'image/webp':limparWebp
  }[mime];
  if(!processar)throw erro('TIPO_MIDIA_NAO_PERMITIDO');
  return {dados:processar(dados),mime,duracaoSegundos:null};
 }
 if(tipo==='VIDEO'){
  if(mime!=='video/mp4')throw erro('TIPO_MIDIA_NAO_PERMITIDO');
  if(dados.length>MAX_VIDEO)throw erro('VIDEO_GRANDE_DEMAIS');
  return {dados,mime,duracaoSegundos:duracaoMp4(dados)};
 }
 throw erro('TIPO_MIDIA_NAO_PERMITIDO');
}
module.exports={validar,erro,MAX_FOTO,MAX_VIDEO,duracaoMp4};
