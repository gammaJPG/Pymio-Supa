import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {unzipSync} from 'fflate';

const PAGE={width:595.28,height:841.89,margin:52};
const printable=value=>String(value??'').replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g,'?');
const extension=name=>String(name||'').split('.').pop().toLowerCase();
const decodeXml=value=>value.replace(/&#x([0-9a-f]+);/gi,(_,code)=>String.fromCodePoint(parseInt(code,16))).replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
export function docxText(buffer){
  const entries=unzipSync(new Uint8Array(buffer)),document=entries['word/document.xml'];
  if(!document)throw new Error('El DOCX no contiene un documento de Word válido.');
  return decodeXml(Buffer.from(document).toString('utf8').replace(/<w:tab\b[^>]*\/>/gi,'\t').replace(/<w:(?:br|cr)\b[^>]*\/>/gi,'\n').replace(/<\/w:p>/gi,'\n').replace(/<[^>]+>/g,'')).replace(/\n{3,}/g,'\n\n').trim();
}

function wrappedLines(value,font,size,width){
  const result=[];
  for(const raw of printable(value).replace(/\r/g,'').split('\n')){
    const words=raw.split(/\s+/).filter(Boolean);
    if(!words.length){result.push('');continue;}
    let line='';
    for(let word of words){
      while(font.widthOfTextAtSize(word,size)>width && word.length>1){
        let take=1;while(take<word.length&&font.widthOfTextAtSize(word.slice(0,take+1),size)<=width)take++;
        if(line){result.push(line);line='';}
        result.push(word.slice(0,take));word=word.slice(take);
      }
      const candidate=line?`${line} ${word}`:word;
      if(font.widthOfTextAtSize(candidate,size)<=width)line=candidate;
      else{result.push(line);line=word;}
    }
    if(line)result.push(line);
  }
  return result;
}

async function addTextPages(document,title,body){
  const font=await document.embedFont(StandardFonts.Helvetica),bold=await document.embedFont(StandardFonts.HelveticaBold),size=10,lineHeight=15,maxWidth=PAGE.width-PAGE.margin*2;
  let page,y;
  const newPage=()=>{page=document.addPage([PAGE.width,PAGE.height]);y=PAGE.height-PAGE.margin;page.drawText(printable(title),{x:PAGE.margin,y,size:14,font:bold,color:rgb(.12,.15,.1)});y-=30;};
  newPage();
  for(const line of wrappedLines(body,font,size,maxWidth)){
    if(y<PAGE.margin){newPage();}
    if(line)page.drawText(line,{x:PAGE.margin,y,size,font,color:rgb(.12,.15,.1)});
    y-=lineHeight;
  }
}

async function addMarkerPage(document,label,{index,response,answer}){
  const page=document.addPage([PAGE.width,PAGE.height]),bold=await document.embedFont(StandardFonts.HelveticaBold),font=await document.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({x:0,y:0,width:PAGE.width,height:PAGE.height,color:rgb(.965,.961,.933)});
  page.drawText(printable(`${label} ${index}`),{x:PAGE.margin,y:PAGE.height-120,size:22,font:bold,color:rgb(.12,.15,.1)});
  const lines=[`Usuario: ${response.name}`,`Empresa: ${response.company_id}`,`Identificador de respuesta: ${response.id}`,`Fecha: ${response.submitted_at}`,`Archivo: ${answer.file_name}`];
  lines.forEach((line,lineIndex)=>page.drawText(printable(line),{x:PAGE.margin,y:PAGE.height-175-lineIndex*24,size:11,font,color:rgb(.25,.28,.22)}));
}

async function addImagePage(document,buffer,name){
  const ext=extension(name);
  let image;
  if(ext==='png')image=await document.embedPng(buffer);
  else if(ext==='jpg')image=await document.embedJpg(buffer);
  else{
    const sharp=(await import('sh'+'arp')).default;
    const png=await sharp(buffer).rotate().png().toBuffer();
    image=await document.embedPng(png);
  }
  const page=document.addPage([PAGE.width,PAGE.height]);
  const maxWidth=PAGE.width-PAGE.margin*2,maxHeight=PAGE.height-PAGE.margin*2,scale=Math.min(maxWidth/image.width,maxHeight/image.height,1),width=image.width*scale,height=image.height*scale;
  page.drawImage(image,{x:(PAGE.width-width)/2,y:(PAGE.height-height)/2,width,height});
  page.drawText(printable(name),{x:PAGE.margin,y:24,size:8,font:await document.embedFont(StandardFonts.Helvetica),color:rgb(.35,.37,.32)});
}

async function addFileContent(document,attachment){
  const ext=extension(attachment.answer.file_name);
  if(ext==='pdf'){
    const source=await PDFDocument.load(attachment.body),pages=await document.copyPages(source,source.getPageIndices());
    pages.forEach(page=>document.addPage(page));
  }else if(ext==='docx'){
    const value=docxText(attachment.body);
    await addTextPages(document,attachment.answer.file_name,value||'[Documento sin texto extraíble]');
  }else if(ext==='txt'){
    await addTextPages(document,attachment.answer.file_name,new TextDecoder('utf-8',{fatal:false}).decode(attachment.body));
  }else if(['jpg','png','webp'].includes(ext)){
    await addImagePage(document,attachment.body,attachment.answer.file_name);
  }else throw new Error('Extensión no compatible con la conversión.');
}

export async function consolidatedFilesPdf(question,attachments){
  const document=await PDFDocument.create();
  if(!attachments.length){
    await addTextPages(document,`Pregunta ${question.position} - ${question.title}`,'Sin archivos adjuntos.');
  }
  for(const [offset,attachment] of attachments.entries()){
    const index=offset+1;
    await addMarkerPage(document,'INICIO DEL ARCHIVO',{index,...attachment});
    try{await addFileContent(document,attachment);}
    catch(error){await addTextPages(document,attachment.answer.file_name,`No fue posible convertir este archivo.\n${error.message}`);}
    await addMarkerPage(document,'FIN DEL ARCHIVO',{index,...attachment});
  }
  return Buffer.from(await document.save({useObjectStreams:false}));
}
