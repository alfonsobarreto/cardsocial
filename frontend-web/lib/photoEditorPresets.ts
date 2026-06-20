/**
 * Presets compartidos con la app móvil (services/photoEditorPresets.ts).
 */

export type PhotoCropShape = 'circle' | 'square' | 'rect' | 'none';

export type PhotoEditorPreset = {
  id: string;
  cropShape: PhotoCropShape;
  outputSize?: number;
  outputMaxLongEdge?: number;
  allowCameraFront: boolean;
  allowCameraBack: boolean;
  allowGallery: boolean;
};

export type BasicPhotoEditorMode =
  | { cropShape: 'circle'; outputSize?: number }
  | { cropShape: 'square'; outputSize?: number }
  | { cropShape: 'rect'; outputMaxLongEdge?: number }
  | { cropShape: 'none' };

export const PHOTO_PRESET_PROFILE: PhotoEditorPreset = {
  id: 'profile',
  cropShape: 'square',
  outputSize: 512,
  allowCameraFront: true,
  allowCameraBack: false,
  allowGallery: true,
};

export const PHOTO_PRESET_VAULT_IMAGE: PhotoEditorPreset = {
  id: 'vault_image',
  cropShape: 'rect',
  outputMaxLongEdge: 2000,
  allowCameraFront: false,
  allowCameraBack: true,
  allowGallery: true,
};

export function presetToEditorMode(preset: PhotoEditorPreset): BasicPhotoEditorMode {
  if (preset.cropShape === 'none') {
    return { cropShape: 'none' };
  }
  if (preset.cropShape === 'rect') {
    return { cropShape: 'rect', outputMaxLongEdge: preset.outputMaxLongEdge ?? 2000 };
  }
  return { cropShape: preset.cropShape, outputSize: preset.outputSize ?? 512 };
}
