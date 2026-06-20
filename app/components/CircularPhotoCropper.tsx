/**
 * @deprecated Use BasicPhotoEditorModal directly. Kept for backward compatibility.
 */
import BasicPhotoEditorModal, { type BasicPhotoEditorModalProps } from './BasicPhotoEditorModal';
import { presetToEditorMode, PHOTO_PRESET_REGISTER } from '@/services/photoEditorPresets';
import React from 'react';

type CircularPhotoCropperProps = Omit<BasicPhotoEditorModalProps, 'mode'>;

const CircularPhotoCropper: React.FC<CircularPhotoCropperProps> = (props) => (
  <BasicPhotoEditorModal {...props} mode={presetToEditorMode(PHOTO_PRESET_REGISTER)} />
);

export default CircularPhotoCropper;
