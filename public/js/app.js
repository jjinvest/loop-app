async function atualizarFilas(){
  try{
    const r=await fetch('/filas');
    const dados=await r.json();
    document.getElementById('totalA').textContent =
      dados.A?.quantidade ?? 0;
    document.getElementById('totalB').textContent =
      dados.B?.quantidade ?? 0;
  }catch(e){}
}
atualizarFilas();
