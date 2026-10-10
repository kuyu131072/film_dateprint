(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const el = Object.fromEntries(['fileInput','dropZone','emptyState','previewCanvas','previewTag','photoCount','photoInfo','previewDate','photoStrip','addPhotos','clearPhotos','dateText','datePicker','dateFormat','dateMode','exifHint','sizeRange','sizeValue','position','marginControls','marginX','marginXValue','marginY','marginYValue','customControls','customX','customXValue','customY','customYValue','stampColor','opacity','opacityValue','brightness','brightnessValue','glow','glowValue','exportFormat','qualityWrap','quality','qualityValue','exportOne','exportAll','status'].map(id => [id, $(id)]));
  const photos = [];
  let selectedIndex = -1;
  let previewVersion = 0;
  let previewLayout = null;
  let draggingStamp = false;
  let busy = false;

  const SEGMENTS = {
    a:[[10,3],[54,3],[48,11],[16,11]],
    b:[[57,6],[61,13],[61,42],[57,47],[50,43],[50,13]],
    c:[[57,53],[61,58],[61,87],[57,94],[50,87],[50,57]],
    d:[[10,97],[16,89],[48,89],[54,97]],
    e:[[7,53],[14,57],[14,87],[7,94],[3,87],[3,58]],
    f:[[7,6],[14,13],[14,43],[7,47],[3,42],[3,13]],
    g:[[10,46],[16,42],[48,42],[54,46],[48,54],[16,54]]
  };
  const DIGITS = ['abcdef','bc','abged','abgcd','fgbc','afgcd','afgecd','abc','abcdefg','abfgcd'];
  const PUNCT = {
    "'":{width:21,shapes:[[[8,2],[16,2],[13,18],[7,18]]]},
    ':':{width:22,shapes:[[[8,27],[15,27],[15,36],[8,36]],[[8,68],[15,68],[15,77],[8,77]]]},
    '.':{width:19,shapes:[[[6,88],[14,88],[14,97],[6,97]]]},
    '-':{width:34,shapes:[[[3,46],[31,46],[27,54],[7,54]]]},
    '/':{width:36,shapes:[[[27,3],[34,3],[9,97],[2,97]]]},
    ' ': {width:25,shapes:[]}
  };
  const gap = 7;
  const SLANT = 0.18; // Top of each glyph leans right by 18 design units per 100 units of height.

  function shapesFor(ch) {
    return /\d/.test(ch) ? DIGITS[Number(ch)].split('').map(key=>SEGMENTS[key]) : (PUNCT[ch]?.shapes || []);
  }

  function cleanText(value) {
    return String(value || '').replace(/[０-９]/g, ch => String(ch.charCodeAt(0)-65296)).replace(/[’‘′]/g,"'").replace(/[^0-9 ':./-]/g,'').slice(0,30).trim() || "26' 10 04";
  }
  function getSettings() {
    return {
      widthRatio:Number(el.sizeRange.value)/100,
      position:el.position.value,
      marginX:Number(el.marginX.value)/100,
      marginY:Number(el.marginY.value)/100,
      customX:Number(el.customX.value)/100,
      customY:Number(el.customY.value)/100,
      color:el.stampColor.value,
      opacity:Number(el.opacity.value)/100,
      brightness:Number(el.brightness.value)/100,
      glow:Number(el.glow.value)/100,
      format:el.exportFormat.value,
      quality:Number(el.quality.value)/100
    };
  }
  function glyphsFor(text) {
    const glyphs=[];
    let cursor=0;
    for (const ch of cleanText(text)) {
      const width=/\d/.test(ch) ? 64 : (PUNCT[ch]?.width || 25);
      glyphs.push({ch,x:cursor,width});
      cursor+=width+gap;
    }
    // Measure the actual ink after slanting, so 18% still means 18% of the photo.
    let minX=Infinity,maxX=-Infinity;
    for(const glyph of glyphs){
      for(const points of shapesFor(glyph.ch)){
        for(const [px,py] of points){
          const x=glyph.x+px+SLANT*(100-py);
          minX=Math.min(minX,x);maxX=Math.max(maxX,x);
        }
      }
    }
    if(!Number.isFinite(minX))return {glyphs,width:Math.max(1,cursor-gap),minX:0};
    return {glyphs,width:Math.max(1,maxX-minX),minX};
  }
  function layoutStamp(width,height,text,settings) {
    const design=glyphsFor(text);
    const stampWidth=width*settings.widthRatio;
    const scale=stampWidth/design.width;
    const stampHeight=100*scale;
    const left=width*settings.marginX;
    const right=width*(1-settings.marginX)-stampWidth;
    const top=height*settings.marginY;
    const bottom=height*(1-settings.marginY)-stampHeight;
    let x=right,y=bottom;
    switch(settings.position) {
      case 'bottom-left': x=left;break;
      case 'top-right': y=top;break;
      case 'top-left': x=left;y=top;break;
      case 'center': x=(width-stampWidth)/2;y=(height-stampHeight)/2;break;
      case 'custom': x=width*settings.customX;y=height*settings.customY;break;
    }
    x=Math.max(0,Math.min(width-stampWidth,x));
    y=Math.max(0,Math.min(height-stampHeight,y));
    return {x,y,width:stampWidth,height:stampHeight,scale,design};
  }
  function hexToRgb(hex) {
    const n=parseInt(hex.slice(1),16);
    return [(n>>16)&255,(n>>8)&255,n&255];
  }
  function rgba(rgb,a) { return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`; }
  function segmentVariation(charIndex,shapeIndex) {
    let n=((charIndex+1)*92821+(shapeIndex+3)*68917)>>>0;
    n=(Math.imul(n ^ (n>>>13),1274126177))>>>0;
    return (n%1000)/1000;
  }
  function drawPolygons(ctx,layout,rgb,alpha,offset) {
    ctx.save();
    ctx.translate(offset,offset);
    ctx.scale(layout.scale,layout.scale);
    layout.design.glyphs.forEach((glyph,index) => {
      const shapes=shapesFor(glyph.ch);
      shapes.forEach((points,shapeIndex) => {
        const variation=segmentVariation(index,shapeIndex);
        ctx.globalAlpha=alpha*(.86+.14*variation);
        ctx.fillStyle=rgba(rgb,1);
        ctx.beginPath();
        points.forEach(([px,py],pointIndex) => {
          const jitter=((segmentVariation(index+pointIndex,shapeIndex)-.5)*.38);
          const x=glyph.x+px+SLANT*(100-py)-layout.design.minX+jitter;
          const y=py+jitter*.7;
          if(pointIndex===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        });
        ctx.closePath();
        ctx.fill();
      });
    });
    ctx.restore();
  }
  function renderStamp(ctx,width,height,text,settings) {
    const layout=layoutStamp(width,height,text,settings);
    const bleed=Math.max(2,layout.height*.12);
    const stamp=document.createElement('canvas');
    stamp.width=Math.ceil(layout.width+2*bleed);
    stamp.height=Math.ceil(layout.height+2*bleed);
    const sctx=stamp.getContext('2d');
    const rgb=hexToRgb(settings.color);
    drawPolygons(sctx,layout,rgb,1,bleed);

    ctx.save();
    ctx.globalCompositeOperation='screen';
    const dx=layout.x-bleed,dy=layout.y-bleed;
    if(settings.glow>0) {
      ctx.filter=`blur(${Math.max(.35,layout.height*.050)}px)`;
      ctx.globalAlpha=settings.opacity*settings.glow*.31;
      ctx.drawImage(stamp,dx,dy);
      ctx.filter=`blur(${Math.max(.15,layout.height*.013)}px)`;
      ctx.globalAlpha=settings.opacity*settings.glow*.40;
      ctx.drawImage(stamp,dx,dy);
    }
    ctx.filter='none';
    ctx.globalAlpha=Math.min(1,settings.opacity*(.61+.22*settings.brightness));
    ctx.drawImage(stamp,dx,dy);
    const light=rgb.map(value=>Math.round(value+(255-value)*.20));
    const core=document.createElement('canvas');
    core.width=stamp.width;core.height=stamp.height;
    drawPolygons(core.getContext('2d'),layout,light,1,bleed);
    ctx.globalAlpha=Math.min(.28,settings.opacity*.16*settings.brightness);
    ctx.drawImage(core,dx,dy);
    ctx.restore();
    return layout;
  }
  function renderPhoto(source,width,height,text,settings,canvas) {
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');
    if(settings.format==='jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);}
    ctx.drawImage(source,0,0,width,height);
    return renderStamp(ctx,width,height,text,settings);
  }

  function formatDate(date,format) {
    const year=String(date.year).padStart(4,'0');
    const yy=year.slice(-2),mm=String(date.month).padStart(2,'0'),dd=String(date.day).padStart(2,'0');
    const hh=String(date.hour ?? 20).padStart(2,'0'),minute=String(date.minute ?? 30).padStart(2,'0');
    switch(format){
      case 'yymmdd':return `${yy} ${mm} ${dd}`;
      case 'yyyymmdd':return `${year} ${mm} ${dd}`;
      case 'mmddyy':return `${mm} ${dd} ${yy}`;
      case 'yymmddtime':return `${yy} ${mm} ${dd} ${hh}:${minute}`;
      default:return `${yy}' ${mm} ${dd}`;
    }
  }
  function getDateConfig(){return {mode:el.dateMode.value,format:el.dateFormat.value,text:cleanText(el.dateText.value)};}
  function dateForPhoto(photo,config=getDateConfig()) {
    return config.mode==='exif' && photo?.exif ? formatDate(photo.exif,config.format) : config.text;
  }
  function parseExifDate(value) {
    const match=/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/.exec(value);
    if(!match)return null;
    const [,year,month,day,hour,minute,second]=match.map(Number);
    if(year<1900||month<1||month>12||day<1||day>31||hour>23||minute>59||second>59)return null;
    const check=new Date(Date.UTC(year,month-1,day));
    if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)return null;
    return {year,month,day,hour,minute,second};
  }
  function exifFromTiff(bytes,start,end) {
    if(start+8>end)return null;
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const order=String.fromCharCode(bytes[start],bytes[start+1]);
    if(order!=='II'&&order!=='MM')return null;
    const little=order==='II';
    const u16=at=>at+2<=end?view.getUint16(at,little):null;
    const u32=at=>at+4<=end?view.getUint32(at,little):null;
    if(u16(start+2)!==42)return null;
    function findTag(ifdOffset,tag) {
      const ifd=start+ifdOffset;
      const count=u16(ifd);
      if(count===null||count>500||ifd+2+count*12>end)return null;
      for(let i=0;i<count;i++){
        const entry=ifd+2+i*12;
        if(u16(entry)!==tag)continue;
        const type=u16(entry+2),length=u32(entry+4);
        if(length===null||length>1024)return null;
        if(type===4&&length===1)return u32(entry+8);
        if(type===2){
          const pos=length<=4?entry+8:start+u32(entry+8);
          if(pos<start||pos+length>end)return null;
          return String.fromCharCode(...bytes.subarray(pos,pos+length)).replace(/\0.*$/,'');
        }
      }
      return null;
    }
    const ifd0=u32(start+4);
    if(ifd0===null)return null;
    const exifPointer=findTag(ifd0,0x8769);
    if(typeof exifPointer!=='number')return null;
    const original=findTag(exifPointer,0x9003);
    return typeof original==='string'?parseExifDate(original):null;
  }
  function extractExif(bytes) {
    const ascii=(pos,n)=>String.fromCharCode(...bytes.subarray(pos,pos+n));
    if(bytes.length<12)return null;
    if(bytes[0]===0xff&&bytes[1]===0xd8){
      let pos=2;
      while(pos+4<bytes.length){
        if(bytes[pos]!==0xff)break;
        const marker=bytes[pos+1];
        if(marker===0xda||marker===0xd9)break;
        const length=(bytes[pos+2]<<8)|bytes[pos+3];
        if(length<2||pos+2+length>bytes.length)break;
        if(marker===0xe1&&ascii(pos+4,6)==='Exif\0\0')return exifFromTiff(bytes,pos+10,pos+2+length);
        pos+=2+length;
      }
    } else if(ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP') {
      let pos=12;
      while(pos+8<bytes.length){
        const size=(bytes[pos+4]|bytes[pos+5]<<8|bytes[pos+6]<<16|bytes[pos+7]<<24)>>>0;
        if(ascii(pos,4)==='EXIF'){
          const start=ascii(pos+8,6)==='Exif\0\0'?pos+14:pos+8;
          return exifFromTiff(bytes,start,Math.min(bytes.length,pos+8+size));
        }
        pos+=8+size+(size&1);
      }
    } else if(bytes[0]===137&&ascii(1,3)==='PNG') {
      let pos=8;
      while(pos+12<bytes.length){
        const size=((bytes[pos]<<24)|(bytes[pos+1]<<16)|(bytes[pos+2]<<8)|bytes[pos+3])>>>0;
        if(ascii(pos+4,4)==='eXIf')return exifFromTiff(bytes,pos+8,Math.min(bytes.length,pos+8+size));
        pos+=12+size;
      }
    }
    return null;
  }
  async function readExif(file) {
    try{return extractExif(new Uint8Array(await file.slice(0,Math.min(file.size,4*1024*1024)).arrayBuffer()));}
    catch{return null;}
  }
  async function bitmapFor(photo) {
    if(photo.bitmap)return photo.bitmap;
    photo.bitmap=await createImageBitmap(photo.file,{imageOrientation:'from-image'});
    return photo.bitmap;
  }
  function selectedPhoto(){return photos[selectedIndex]||null;}
  function setStatus(message,error=false){el.status.textContent=message;el.status.classList.toggle('error',error);}
  function setBusy(value){busy=value;el.exportOne.disabled=value||selectedIndex<0;el.exportAll.disabled=value||photos.length<2;el.addPhotos.disabled=value;el.clearPhotos.disabled=value||photos.length===0;}
  function refreshStrip(){
    el.photoStrip.hidden=photos.length<2;
    el.photoStrip.replaceChildren();
    photos.forEach((photo,index)=>{
      const button=document.createElement('button');button.type='button';button.className='photo-tile'+(index===selectedIndex?' active':'');button.title=photo.file.name;
      const img=document.createElement('img');img.src=photo.url;img.alt='';
      const name=document.createElement('span');name.textContent=photo.file.name;
      button.append(img,name);button.addEventListener('click',()=>selectPhoto(index));el.photoStrip.append(button);
    });
  }
  async function selectPhoto(index){
    if(busy||index<0||index>=photos.length)return;
    const old=selectedPhoto();
    selectedIndex=index;
    if(old&&old!==selectedPhoto()&&old.bitmap){old.bitmap.close();old.bitmap=null;}
    refreshStrip();
    schedulePreview();
  }
  async function addFiles(files){
    if(busy)return;
    const valid=Array.from(files).filter(file=>/\.(jpe?g|png|webp)$/i.test(file.name)&&file.size>0);
    if(!valid.length){setStatus('请选择 JPG、PNG 或 WebP 照片。',true);return;}
    for(const file of valid){photos.push({file,url:URL.createObjectURL(file),exif:await readExif(file),bitmap:null});}
    el.photoCount.textContent=`${photos.length} 张照片`;
    await selectPhoto(photos.length-valid.length);
    setBusy(false);
    setStatus(`已导入 ${valid.length} 张照片。照片仅在本地处理。`);
  }
  function clearPhotos(){
    previewVersion++;
    for(const photo of photos){photo.bitmap?.close();URL.revokeObjectURL(photo.url);}
    photos.length=0;selectedIndex=-1;previewLayout=null;
    el.previewCanvas.hidden=true;el.previewTag.hidden=true;el.emptyState.hidden=false;el.dropZone.classList.remove('has-photo');
    el.photoInfo.textContent='导入照片后即可开始';el.previewDate.textContent='';el.photoCount.textContent='未导入照片';
    refreshStrip();setBusy(false);setStatus('导出时按照片原始分辨率渲染。');
  }
  function schedulePreview(){const version=++previewVersion;requestAnimationFrame(()=>drawPreview(version));}
  async function drawPreview(version){
    const photo=selectedPhoto();if(!photo)return;
    try{
      const bitmap=await bitmapFor(photo);
      if(version!==previewVersion||photo!==selectedPhoto())return;
      const scale=Math.min(1,1700/Math.max(bitmap.width,bitmap.height));
      const width=Math.max(1,Math.round(bitmap.width*scale));
      const height=Math.max(1,Math.round(bitmap.height*scale));
      const text=dateForPhoto(photo),settings=getSettings();
      previewLayout=renderPhoto(bitmap,width,height,text,settings,el.previewCanvas);
      el.previewCanvas.hidden=false;el.previewTag.hidden=false;el.emptyState.hidden=true;el.dropZone.classList.add('has-photo');
      el.photoInfo.textContent=`${photo.file.name} · ${bitmap.width} × ${bitmap.height}`;
      el.previewDate.textContent=el.dateMode.value==='exif'?(photo.exif?'EXIF · '+text:'手动日期 · '+text):text;
      el.exifHint.textContent=el.dateMode.value==='exif'&&photo&&!photo.exif?'当前照片没有 EXIF 拍摄日期，已使用手动输入。':'没有 EXIF 拍摄日期时使用上方的显示文字。';
    }catch(error){setStatus(`无法读取 ${photo.file.name}：${error.message}`,true);}
  }
  function syncControls(){
    for(const [range,output] of [['sizeRange','sizeValue'],['marginX','marginXValue'],['marginY','marginYValue'],['customX','customXValue'],['customY','customYValue'],['opacity','opacityValue'],['brightness','brightnessValue'],['glow','glowValue'],['quality','qualityValue']])el[output].textContent=`${el[range].value}%`;
    el.customControls.hidden=el.position.value!=='custom';
    el.marginControls.hidden=el.position.value==='center'||el.position.value==='custom';
    el.qualityWrap.hidden=el.exportFormat.value!=='jpeg';
    document.querySelectorAll('.preset').forEach(button=>button.classList.toggle('active',button.dataset.color.toLowerCase()===el.stampColor.value.toLowerCase()));
    schedulePreview();
  }
  function pointerToCanvas(event){
    const rect=el.previewCanvas.getBoundingClientRect();
    return {x:(event.clientX-rect.left)*el.previewCanvas.width/rect.width,y:(event.clientY-rect.top)*el.previewCanvas.height/rect.height};
  }
  function moveStamp(event){
    if(!draggingStamp||!previewLayout)return;
    const point=pointerToCanvas(event);
    const x=Math.max(0,Math.min(el.previewCanvas.width-previewLayout.width,point.x-previewLayout.width/2));
    const y=Math.max(0,Math.min(el.previewCanvas.height-previewLayout.height,point.y-previewLayout.height/2));
    el.customX.value=(100*x/el.previewCanvas.width).toFixed(1);
    el.customY.value=(100*y/el.previewCanvas.height).toFixed(1);
    syncControls();
  }
  function downloadBlob(blob,name){
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function outputName(file,format,index){
    const stem=file.name.replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|]/g,'_');
    return `${stem}_film-date${index===undefined?'':`_${index+1}`}.${format==='jpeg'?'jpg':'png'}`;
  }
  function canvasBlob(canvas,settings){
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('浏览器无法生成该图片。')),settings.format==='jpeg'?'image/jpeg':'image/png',settings.quality));
  }
  async function exportPhoto(photo,settings,dateConfig){
    const wasCached=!!photo.bitmap;
    const bitmap=await bitmapFor(photo);
    try{
      const canvas=document.createElement('canvas');
      renderPhoto(bitmap,bitmap.width,bitmap.height,dateForPhoto(photo,dateConfig),settings,canvas);
      return await canvasBlob(canvas,settings);
    }finally{if(!wasCached&&photo.bitmap){photo.bitmap.close();photo.bitmap=null;}}
  }
  const crcTable=Uint32Array.from({length:256},(_,index)=>{let c=index;for(let i=0;i<8;i++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  async function blobCrc(blob){
    let crc=0xffffffff;
    if(blob.stream){const reader=blob.stream().getReader();while(true){const {value,done}=await reader.read();if(done)break;for(const byte of value)crc=crcTable[(crc^byte)&255]^(crc>>>8);}}
    else{for(const byte of new Uint8Array(await blob.arrayBuffer()))crc=crcTable[(crc^byte)&255]^(crc>>>8);}
    return (crc^0xffffffff)>>>0;
  }
  async function makeZip(entries){
    const encoder=new TextEncoder(),parts=[],directory=[];
    let offset=0;
    const now=new Date();
    const dosTime=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1);
    const dosDate=((Math.max(1980,now.getFullYear())-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
    for(const entry of entries){
      if(entry.blob.size>0xffffffff)throw new Error('单张文件超过 ZIP 格式大小限制。');
      const name=encoder.encode(entry.name),crc=await blobCrc(entry.blob),size=entry.blob.size;
      const local=new Uint8Array(30+name.length),lv=new DataView(local.buffer);
      lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(10,dosTime,true);lv.setUint16(12,dosDate,true);lv.setUint32(14,crc,true);lv.setUint32(18,size,true);lv.setUint32(22,size,true);lv.setUint16(26,name.length,true);local.set(name,30);
      parts.push(local,entry.blob);
      const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);
      cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(12,dosTime,true);cv.setUint16(14,dosDate,true);cv.setUint32(16,crc,true);cv.setUint32(20,size,true);cv.setUint32(24,size,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);central.set(name,46);
      directory.push(central);offset+=local.length+size;
      if(offset>0xffffffff)throw new Error('批量文件过大，请分批导出。');
    }
    const dirSize=directory.reduce((sum,part)=>sum+part.length,0);
    if(entries.length>65535||offset+dirSize>0xffffffff)throw new Error('批量文件过大，请分批导出。');
    const end=new Uint8Array(22),ev=new DataView(end.buffer);
    ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,dirSize,true);ev.setUint32(16,offset,true);
    return new Blob([...parts,...directory,end],{type:'application/zip'});
  }
  async function exportOne(){
    const photo=selectedPhoto();if(!photo||busy)return;
    setBusy(true);setStatus('正在按原始分辨率导出…');
    try{const settings=getSettings(),dateConfig=getDateConfig();const blob=await exportPhoto(photo,settings,dateConfig);downloadBlob(blob,outputName(photo.file,settings.format));setStatus(`已生成 ${outputName(photo.file,settings.format)}。`);}
    catch(error){setStatus(`导出失败：${error.message}`,true);}
    finally{setBusy(false);}
  }
  async function exportAll(){
    if(photos.length<2||busy)return;
    setBusy(true);
    try{
      const settings=getSettings(),dateConfig=getDateConfig(),entries=[];
      for(let index=0;index<photos.length;index++){
        const photo=photos[index];setStatus(`正在渲染 ${index+1} / ${photos.length}：${photo.file.name}`);
        const blob=await exportPhoto(photo,settings,dateConfig);
        entries.push({name:outputName(photo.file,settings.format,index),blob});
      }
      setStatus('正在打包 ZIP…');
      downloadBlob(await makeZip(entries),'film-date-stamp.zip');
      setStatus(`已生成包含 ${entries.length} 张照片的 ZIP。`);
    }catch(error){setStatus(`批量导出失败：${error.message}`,true);}
    finally{setBusy(false);}
  }

  el.fileInput.addEventListener('change',event=>{addFiles(event.target.files);event.target.value='';});
  el.addPhotos.addEventListener('click',()=>el.fileInput.click());
  el.dropZone.addEventListener('click',event=>{if(event.target!==el.previewCanvas)el.fileInput.click();});
  el.dropZone.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();el.fileInput.click();}});
  for(const name of ['dragenter','dragover'])el.dropZone.addEventListener(name,event=>{event.preventDefault();el.dropZone.classList.add('dragging');});
  for(const name of ['dragleave','drop'])el.dropZone.addEventListener(name,event=>{event.preventDefault();el.dropZone.classList.remove('dragging');});
  el.dropZone.addEventListener('drop',event=>addFiles(event.dataTransfer.files));
  el.clearPhotos.addEventListener('click',clearPhotos);
  el.dateText.addEventListener('input',()=>{el.dateMode.value='manual';schedulePreview();});
  el.datePicker.addEventListener('change',()=>{if(!el.datePicker.value)return;const [year,month,day]=el.datePicker.value.split('-').map(Number);el.dateText.value=formatDate({year,month,day},el.dateFormat.value);el.dateMode.value='manual';schedulePreview();});
  el.dateFormat.addEventListener('change',()=>{if(el.dateMode.value==='manual'&&el.datePicker.value){const [year,month,day]=el.datePicker.value.split('-').map(Number);el.dateText.value=formatDate({year,month,day},el.dateFormat.value);}schedulePreview();});
  el.dateMode.addEventListener('change',schedulePreview);
  for(const id of ['sizeRange','position','marginX','marginY','customX','customY','stampColor','opacity','brightness','glow','exportFormat','quality'])el[id].addEventListener('input',syncControls);
  document.querySelectorAll('.preset').forEach(button=>button.addEventListener('click',()=>{el.stampColor.value=button.dataset.color;el.opacity.value=button.dataset.opacity;el.brightness.value=button.dataset.brightness;el.glow.value=button.dataset.glow;syncControls();}));
  el.previewCanvas.addEventListener('pointerdown',event=>{if(!previewLayout)return;const p=pointerToCanvas(event),l=previewLayout;if(p.x<l.x-15||p.x>l.x+l.width+15||p.y<l.y-15||p.y>l.y+l.height+15)return;draggingStamp=true;el.position.value='custom';el.previewCanvas.setPointerCapture(event.pointerId);moveStamp(event);});
  el.previewCanvas.addEventListener('pointermove',moveStamp);
  for(const name of ['pointerup','pointercancel'])el.previewCanvas.addEventListener(name,()=>{draggingStamp=false;});
  el.exportOne.addEventListener('click',exportOne);el.exportAll.addEventListener('click',exportAll);
  function runSelfTests(){
    const settings={...getSettings(),widthRatio:.18,marginX:.04,marginY:.05,position:'bottom-right'};
    const cases=[[6000,4000,1080],[3000,2000,540],[1200,800,216]];
    const results=cases.map(([width,height,expected])=>{
      const layout=layoutStamp(width,height,"26' 10 04",settings);
      const pass=Math.abs(layout.width-expected)<1e-8&&Math.abs((width-layout.x-layout.width)/width-.04)<1e-8&&Math.abs((height-layout.y-layout.height)/height-.05)<1e-8;
      return {resolution:`${width} × ${height}`,stampWidth:layout.width,rightMargin:width-layout.x-layout.width,bottomMargin:height-layout.y-layout.height,pass};
    });
    const source=document.createElement('canvas');source.width=1200;source.height=800;
    const sctx=source.getContext('2d');sctx.fillStyle='#202020';sctx.fillRect(0,0,1200,800);
    const target=document.createElement('canvas');
    const layout=renderPhoto(source,1200,800,"26' 10 04",settings,target);
    const pixel=target.getContext('2d').getImageData(Math.round(layout.x+29*layout.scale),Math.round(layout.y+7*layout.scale),1,1).data;
    const rendered=pixel[0]>32;
    const pass=results.every(item=>item.pass)&&rendered;
    const demo=document.createElement('canvas');demo.width=1200;demo.height=800;
    const dctx=demo.getContext('2d');
    const sky=dctx.createLinearGradient(0,0,0,800);sky.addColorStop(0,'#777b78');sky.addColorStop(.57,'#9b8b79');sky.addColorStop(1,'#383e38');
    dctx.fillStyle=sky;dctx.fillRect(0,0,1200,800);
    dctx.fillStyle='#454b43';dctx.beginPath();dctx.moveTo(0,510);dctx.lineTo(280,405);dctx.lineTo(620,535);dctx.lineTo(950,390);dctx.lineTo(1200,515);dctx.lineTo(1200,800);dctx.lineTo(0,800);dctx.fill();
    dctx.fillStyle='#282e2a';dctx.fillRect(0,660,1200,140);
    renderPhoto(demo,1200,800,"26' 10 04",settings,el.previewCanvas);
    el.previewCanvas.hidden=false;el.emptyState.hidden=true;el.previewTag.hidden=false;el.previewTag.textContent='视觉自检';el.dropZone.classList.add('has-photo');
    el.photoInfo.textContent='合成测试图 · 1200 × 800';el.previewDate.textContent="26' 10 04";
    console.table(results);console.info('Seven-segment render:',rendered?'PASS':'FAIL');
    setStatus(pass?'校验通过：三种分辨率的宽度和边距比例正确，七段数字已绘制。':'校验失败：请查看浏览器控制台。',!pass);
    return {pass,results,rendered};
  }
  async function runIntegrationTests(){
    try{
      const source=document.createElement('canvas');source.width=1200;source.height=800;
      const ctx=source.getContext('2d');ctx.fillStyle='#303a35';ctx.fillRect(0,0,1200,800);
      const input=await new Promise(resolve=>source.toBlob(resolve,'image/jpeg',.92));
      if(!input)throw new Error('无法生成测试照片');
      await addFiles([new File([input],'integration-test.jpg',{type:'image/jpeg'})]);
      const buttonEnabled=!el.exportOne.disabled&&el.exportAll.disabled;
      const photo=selectedPhoto(),settings=getSettings(),dateConfig=getDateConfig();
      const output=await exportPhoto(photo,settings,dateConfig);
      const decoded=await createImageBitmap(output);
      const dimensions=decoded.width===1200&&decoded.height===800;
      decoded.close();
      const pngOutput=await exportPhoto(photo,{...settings,format:'png'},dateConfig);
      const pngDecoded=await createImageBitmap(pngOutput);
      const pngValid=pngOutput.type==='image/png'&&pngDecoded.width===1200&&pngDecoded.height===800;
      pngDecoded.close();
      const zip=await makeZip([{name:'integration-test_film-date.jpg',blob:output}]);
      const magic=new DataView(await zip.slice(0,4).arrayBuffer()).getUint32(0,true);
      const zipValid=magic===0x04034b50;
      const fallback=dateForPhoto({exif:null},{mode:'exif',format:'yyqmmdd',text:"26' 10 04"})==="26' 10 04";
      const fixture=new Uint8Array(76),view=new DataView(fixture.buffer);
      fixture.set([0xff,0xd8,0xff,0xe1],0);view.setUint16(4,72);
      fixture.set([69,120,105,102,0,0,73,73],6);
      view.setUint16(14,42,true);view.setUint32(16,8,true);
      view.setUint16(20,1,true);view.setUint16(22,0x8769,true);view.setUint16(24,4,true);view.setUint32(26,1,true);view.setUint32(30,26,true);
      view.setUint16(38,1,true);view.setUint16(40,0x9003,true);view.setUint16(42,2,true);view.setUint32(44,20,true);view.setUint32(48,44,true);
      fixture.set(Array.from('1998:07:14 16:32:11\0',ch=>ch.charCodeAt(0)),56);
      const exif=extractExif(fixture);
      const exifValid=exif?.year===1998&&exif?.month===7&&exif?.day===14&&exif?.hour===16&&exif?.minute===32;
      const largeRenders=[];
      for(const [width,height] of [[6000,4000],[3000,2000]]){
        const synthetic=document.createElement('canvas');synthetic.width=width;synthetic.height=height;
        const fill=synthetic.getContext('2d');fill.fillStyle='#303a35';fill.fillRect(0,0,width,height);
        const renderedCanvas=document.createElement('canvas');
        const stampLayout=renderPhoto(synthetic,width,height,"26' 10 04",settings,renderedCanvas);
        const renderedBlob=await canvasBlob(renderedCanvas,settings);
        const check=await createImageBitmap(renderedBlob);
        largeRenders.push({width,height,pass:check.width===width&&check.height===height&&Math.abs(stampLayout.width-width*.18)<1e-8});
        check.close();synthetic.width=0;synthetic.height=0;renderedCanvas.width=0;renderedCanvas.height=0;
      }
      const pass=buttonEnabled&&dimensions&&pngValid&&zipValid&&fallback&&exifValid&&largeRenders.every(item=>item.pass);
      console.info('Integration test:',{pass,buttonEnabled,dimensions,pngValid,zipValid,fallback,exifValid,largeRenders,outputBytes:output.size,zipBytes:zip.size});
      setStatus(pass?'集成校验通过：导出按钮、三种分辨率、JPG、PNG、EXIF 与 ZIP 正常。':'集成校验失败：请查看浏览器控制台。',!pass);
      return pass;
    }catch(error){console.error(error);setStatus(`集成校验失败：${error.message}`,true);return false;}
  }
  syncControls();setBusy(false);
  window.FilmDateStampTest={glyphsFor,layoutStamp,parseExifDate,formatDate,extractExif,makeZip,runSelfTests,runIntegrationTests};
  if(new URLSearchParams(location.search).has('selftest'))runSelfTests();
  if(new URLSearchParams(location.search).has('integration'))runIntegrationTests();
})();
