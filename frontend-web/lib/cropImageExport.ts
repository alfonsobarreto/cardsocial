import type { Area } from 'react-easy-crop';

export type CropFlip = { horizontal: boolean; vertical: boolean };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', (error) => reject(error));
    img.src = src;
  });
}

function jpgName(name: string): string {
  const base = String(name || 'image').replace(/\.[^/.]+$/, '') || 'image';
  return `${base}.jpg`;
}

function getRadianAngle(degree: number): number {
  return (degree * Math.PI) / 180;
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

export async function getCroppedImageFile(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0,
  flip: CropFlip = { horizontal: false, vertical: false },
  fileName = 'image.jpg',
  outputSize?: number,
  outputMaxLongEdge?: number,
): Promise<File> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare image export.');

  const rotRad = getRadianAngle(rotation);
  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation);

  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;
  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.scale(flip.horizontal ? -1 : 1, flip.vertical ? -1 : 1);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  const croppedCanvas = document.createElement('canvas');
  const croppedCtx = croppedCanvas.getContext('2d');
  if (!croppedCtx) throw new Error('Could not prepare cropped image.');

  croppedCanvas.width = pixelCrop.width;
  croppedCanvas.height = pixelCrop.height;
  croppedCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  let outW = croppedCanvas.width;
  let outH = croppedCanvas.height;

  if (outputSize && outputSize > 0) {
    outW = outputSize;
    outH = outputSize;
  } else if (outputMaxLongEdge && outputMaxLongEdge > 0) {
    const longEdge = Math.max(outW, outH);
    if (longEdge > outputMaxLongEdge) {
      const scale = outputMaxLongEdge / longEdge;
      outW = Math.max(1, Math.round(outW * scale));
      outH = Math.max(1, Math.round(outH * scale));
    }
  }

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = outW;
  finalCanvas.height = outH;
  const finalCtx = finalCanvas.getContext('2d');
  if (!finalCtx) throw new Error('Could not resize cropped image.');
  finalCtx.fillStyle = '#ffffff';
  finalCtx.fillRect(0, 0, outW, outH);
  finalCtx.drawImage(croppedCanvas, 0, 0, outW, outH);

  const blob = await new Promise<Blob>((resolve, reject) => {
    finalCanvas.toBlob(
      (next) => {
        if (!next) reject(new Error('Could not export JPEG.'));
        else resolve(next);
      },
      'image/jpeg',
      0.88,
    );
  });

  return new File([blob], jpgName(fileName), { type: 'image/jpeg', lastModified: Date.now() });
}
