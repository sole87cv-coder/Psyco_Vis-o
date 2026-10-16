export function withCanvasLayer(ctx, operation, alpha, draw) {
  ctx.save();
  ctx.globalCompositeOperation=operation;
  ctx.globalAlpha=alpha;
  try{
    return draw(ctx);
  }
  finally{
    ctx.restore();
  }
}
export function drawCanvasLayer(ctx, canvas, {
  operation='source-over',alpha=1,filter='none',x=0,y=0,width=canvas.width,height=canvas.height
}) {
  withCanvasLayer(ctx,operation,alpha,layer=>{
    layer.filter=filter;
    layer.drawImage(canvas,x,y,width,height);
  });
}
