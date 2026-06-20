import { resolveImageDimensions } from '@/services/imageOptimize';
import * as ImagePicker from 'expo-image-picker';
import { useCallback } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

import type { PhotoEditorPreset } from '@/services/photoEditorPresets';

export type PickedPhoto = {
  uri: string;
  width: number;
  height: number;
  fileName?: string;
  mimeType?: string;
};

export type PickPhotoLabels = {
  cancel: string;
  gallery: string;
  cameraFront: string;
  cameraBack: string;
  permissionPhotos: string;
  permissionCamera: string;
  permissionTitle: string;
  pickTitle?: string;
};

async function assetToPickedPhoto(asset: ImagePicker.ImagePickerAsset): Promise<PickedPhoto | null> {
  const uri = String(asset.uri || '').trim();
  if (!uri) return null;
  try {
    const dims = await resolveImageDimensions(asset.uri, asset.width, asset.height);
    return {
      uri,
      width: dims.width,
      height: dims.height,
      fileName: asset.fileName ?? undefined,
      mimeType: asset.mimeType ?? undefined,
    };
  } catch {
    return {
      uri,
      width: Math.max(1, asset.width || 1080),
      height: Math.max(1, asset.height || 1080),
      fileName: asset.fileName ?? undefined,
      mimeType: asset.mimeType ?? undefined,
    };
  }
}

async function launchGallery(quality: number): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality,
  });
  if (result.canceled || !result.assets[0]) return null;
  return assetToPickedPhoto(result.assets[0]);
}

async function launchCamera(front: boolean, quality: number): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality,
    cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  });
  if (result.canceled || !result.assets[0]) return null;
  return assetToPickedPhoto(result.assets[0]);
}

function showPickMenu(
  preset: PhotoEditorPreset,
  labels: PickPhotoLabels,
  onPick: (source: 'gallery' | 'camera_front' | 'camera_back') => void,
): void {
  const options: string[] = [labels.cancel];
  const actions: Array<'gallery' | 'camera_front' | 'camera_back'> = [];

  if (preset.allowGallery) {
    options.push(labels.gallery);
    actions.push('gallery');
  }
  if (preset.allowCameraFront) {
    options.push(labels.cameraFront);
    actions.push('camera_front');
  }
  if (preset.allowCameraBack) {
    options.push(labels.cameraBack);
    actions.push('camera_back');
  }

  if (actions.length === 0) return;

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: 0, title: labels.pickTitle },
      (idx) => {
        if (idx <= 0) return;
        const action = actions[idx - 1];
        if (action) onPick(action);
      },
    );
    return;
  }

  Alert.alert(
    labels.pickTitle || labels.gallery,
    '',
    [
      ...actions.map((action) => ({
        text:
          action === 'gallery'
            ? labels.gallery
            : action === 'camera_front'
              ? labels.cameraFront
              : labels.cameraBack,
        onPress: () => onPick(action),
      })),
      { text: labels.cancel, style: 'cancel' as const },
    ],
  );
}

export function usePhotoSourceSheet() {
  const pickPhoto = useCallback(
    async (preset: PhotoEditorPreset, labels: PickPhotoLabels, quality = 0.85): Promise<PickedPhoto | null> => {
      return new Promise((resolve) => {
        showPickMenu(preset, labels, (source) => {
          void (async () => {
            try {
              let picked: PickedPhoto | null = null;
              if (source === 'gallery') {
                picked = await launchGallery(quality);
                if (picked === null) {
                  const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
                  if (!perm.granted) {
                    Alert.alert(labels.permissionTitle, labels.permissionPhotos);
                  }
                }
              } else if (source === 'camera_front') {
                picked = await launchCamera(true, quality);
                if (picked === null) {
                  const perm = await ImagePicker.getCameraPermissionsAsync();
                  if (!perm.granted) {
                    Alert.alert(labels.permissionTitle, labels.permissionCamera);
                  }
                }
              } else {
                picked = await launchCamera(false, quality);
                if (picked === null) {
                  const perm = await ImagePicker.getCameraPermissionsAsync();
                  if (!perm.granted) {
                    Alert.alert(labels.permissionTitle, labels.permissionCamera);
                  }
                }
              }
              resolve(picked);
            } catch {
              resolve(null);
            }
          })();
        });
      });
    },
    [],
  );

  return { pickPhoto };
}
