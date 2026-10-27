import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';

const PAGE={width:595.28,height:841.89,margin:46};
const printable=value=>String(value??'').replace(/[^\x20-\x7e\xa0-\xff]/g,'?');
const money=value=>`$ ${Math.round(Number(value)||0).toLocaleString('es-CL')}`;
const dateTime=value=>new Date(value).toLocaleString('es-CL',{dateStyle:'long',timeStyle:'short'});

function lineTotal(movement,product){
  const subtotal=Number(product.total)||Number(product.unit_price||0)*Math.abs(Number(product.units)||0);
  let discount=Number(product.discount_amount)||0;
  if(!discount&&movement.discount_scope!=='product'&&movement.discount_type){
    const gross=(movement.products||[]).reduce((sum,item)=>sum+(Number(item.total)||0),0);
    discount=gross?(Number(movement.discount_amount)||0)*subtotal/gross:0;
  }
  return Math.max(0,subtotal-discount);
}

export function saleReceiptData(movement){
  if(movement?.operation_detail!=='Venta')throw Object.assign(new Error('Solo las ventas pueden generar un comprobante.'),{status:400});
  return {
    code:printable(movement.code),date:dateTime(movement.occurred_at),customer:printable(movement.customer_name||'Sin cliente asociado'),channel:printable(movement.channel||'-'),payment:printable(movement.payment_method||'-'),status:printable(movement.Estado||'Pagado'),
    products:(movement.products||[]).map(product=>({name:printable(product.name||'Producto'),unitPrice:Number(product.unit_price)||0,units:Math.abs(Number(product.units)||0),total:lineTotal(movement,product)})),
    total:Number(movement.total)||0
  };
}

function fit(value,font,size,width){
  const text=printable(value);if(font.widthOfTextAtSize(text,size)<=width)return text;
  let result=text;while(result.length&&font.widthOfTextAtSize(`${result}...`,size)>width)result=result.slice(0,-1);return `${result}...`;
}

export async function generateSalesReceiptPdf(movement){
  const data=saleReceiptData(movement),document=await PDFDocument.create(),regular=await document.embedFont(StandardFonts.Helvetica),bold=await document.embedFont(StandardFonts.HelveticaBold);
  let page,y,pageNumber=0;
  const drawHeader=()=>{
    page=document.addPage([PAGE.width,PAGE.height]);pageNumber++;y=PAGE.height-PAGE.margin;
    page.drawText('PYMIO',{x:PAGE.margin,y,size:11,font:bold,color:rgb(.42,.38,.18)});
    page.drawText('COMPROBANTE DE VENTA',{x:PAGE.margin,y:y-32,size:22,font:bold,color:rgb(.12,.15,.1)});
    page.drawRectangle({x:PAGE.margin,y:y-62,width:190,height:22,color:rgb(.96,.82,.31)});
    page.drawText('NO VÁLIDO COMO BOLETA',{x:PAGE.margin+10,y:y-56,size:9.5,font:bold,color:rgb(.18,.17,.1)});
    y-=92;
  };
  const drawTableHeader=()=>{
    page.drawRectangle({x:PAGE.margin,y:y-22,width:PAGE.width-PAGE.margin*2,height:24,color:rgb(.17,.2,.14)});
    for(const [label,x] of [['Producto',PAGE.margin+8],['Precio unitario',300],['Unidades',405],['Total',485]])page.drawText(label,{x,y:y-15,size:8.5,font:bold,color:rgb(1,1,1)});
    y-=30;
  };
  drawHeader();
  const details=[['Fecha',data.date],['Código',data.code],['Cliente',data.customer],['Canal',data.channel],['Medio de pago',data.payment],['Estado',data.status]];
  for(const [label,value] of details){page.drawText(`${label}:`,{x:PAGE.margin,y,size:9.5,font:bold,color:rgb(.34,.37,.29)});page.drawText(fit(value,regular,9.5,360),{x:145,y,size:9.5,font:regular,color:rgb(.12,.15,.1)});y-=17;}
  y-=10;drawTableHeader();
  for(const product of data.products){
    if(y<100){drawHeader();drawTableHeader();}
    page.drawText(fit(product.name,regular,9,232),{x:PAGE.margin+8,y,size:9,font:regular,color:rgb(.12,.15,.1)});
    page.drawText(money(product.unitPrice),{x:300,y,size:9,font:regular,color:rgb(.12,.15,.1)});
    page.drawText(String(product.units),{x:420,y,size:9,font:regular,color:rgb(.12,.15,.1)});
    const total=money(product.total),totalWidth=regular.widthOfTextAtSize(total,9);page.drawText(total,{x:PAGE.width-PAGE.margin-8-totalWidth,y,size:9,font:regular,color:rgb(.12,.15,.1)});
    page.drawLine({start:{x:PAGE.margin,y:y-8},end:{x:PAGE.width-PAGE.margin,y:y-8},thickness:.4,color:rgb(.84,.85,.8)});y-=28;
  }
  y-=4;const totalLabel='TOTAL DE LA VENTA',totalValue=money(data.total),valueWidth=bold.widthOfTextAtSize(totalValue,13);
  page.drawText(totalLabel,{x:PAGE.margin,y,size:11,font:bold,color:rgb(.12,.15,.1)});page.drawText(totalValue,{x:PAGE.width-PAGE.margin-valueWidth,y,size:13,font:bold,color:rgb(.12,.15,.1)});
  const pages=document.getPages();pages.forEach((item,index)=>{const label=`Página ${index+1} de ${pages.length}`,width=regular.widthOfTextAtSize(label,8);item.drawLine({start:{x:PAGE.margin,y:42},end:{x:PAGE.width-PAGE.margin,y:42},thickness:.5,color:rgb(.78,.79,.74)});item.drawText('Documento informativo - No válido como boleta',{x:PAGE.margin,y:25,size:8,font:regular,color:rgb(.4,.42,.36)});item.drawText(label,{x:PAGE.width-PAGE.margin-width,y:25,size:8,font:regular,color:rgb(.4,.42,.36)});});
  return Buffer.from(await document.save({useObjectStreams:false}));
}
