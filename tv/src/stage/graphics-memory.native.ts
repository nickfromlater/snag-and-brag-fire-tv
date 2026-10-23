import FastImage from '@amazon-devices/react-native-fast-image';

/** Release the shared native image/graphics cache after the stage unmounts. */
export async function releaseGraphicsMemory(): Promise<void> {
  await FastImage.clearMemoryCache();
}
