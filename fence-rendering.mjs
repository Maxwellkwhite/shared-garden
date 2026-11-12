export function createConnectedSegmentCanvas(size, surface, connections, connectType) {
  if (!surface?.canvas) throw new Error('Fence source image is not loaded');
  surface.connectedArtCanvases ||= new Map();
  if (!surface.connectedArtCanvases.has(connectType)) {
    // Source artwork is much larger than a one-cell segment. Reduce it once,
    // with a little averaging, then posterize it back to crisp pixels so fine
    // source texture does not turn into noise at garden zoom levels.
    const art = document.createElement('canvas');
    art.width = 128;
    art.height = 32;
    const artContext = art.getContext('2d', { willReadFrequently: true });
    artContext.imageSmoothingEnabled = true;
    artContext.imageSmoothingQuality = 'high';
    artContext.drawImage(surface.canvas, 0, 0, art.width, art.height);
    const pixels = artContext.getImageData(0, 0, art.width, art.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const alpha = pixels.data[i + 3];
      if (alpha < 72) {
        pixels.data[i + 3] = 0;
        continue;
      }
      pixels.data[i + 3] = 255;
      for (let channel = 0; channel < 3; channel += 1) {
        pixels.data[i + channel] = Math.round(pixels.data[i + channel] / 28) * 28;
      }
    }
    artContext.putImageData(pixels, 0, 0);
    surface.connectedArtCanvases.set(connectType, art);
  }
  const art = surface.connectedArtCanvases.get(connectType);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  const sourceWidth = Math.floor(art.width / 2);
  const depth = size * (connectType === 'wall' ? 0.32 : 0.26);
  const halfSpan = size / 2;
  let mask = connections;
  // An isolated segment remains a short horizontal fence panel.
  if (!mask) mask = 2 | 8;

  const drawArm = angle => {
    context.save();
    context.translate(halfSpan, halfSpan);
    context.rotate(angle);
    context.drawImage(
      art,
      0, 0, sourceWidth, art.height,
      0, -depth / 2, halfSpan, depth,
    );
    context.restore();
  };
  if (mask & 1) drawArm(-Math.PI / 2);
  if (mask & 2) drawArm(0);
  if (mask & 4) drawArm(Math.PI / 2);
  if (mask & 8) drawArm(Math.PI);
  return canvas;
}
