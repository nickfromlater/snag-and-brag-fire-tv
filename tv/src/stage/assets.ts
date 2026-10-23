import bank from './generated/assets';
import manifest from '../../../assets/manifest.json';
import eyeBitmaps from './generated/eye-bitmaps.json';
import type { ImageSourcePropType } from '@amazon-devices/react-native-kepler';
export interface Bitmap { file: string; pixelSize: number[] | null; scale: number; anchor: number[]; logicalBounds: { x: number; y: number; width: number; height: number }; frames?: { amount: number; rect: number[] }[] }
export const bitmapInfo = {...manifest.files,...eyeBitmaps} as unknown as Record<string, Bitmap>;
export function bitmap(id: string): ImageSourcePropType { return bank[id] ?? bank['stickers/sock-384']!; }
