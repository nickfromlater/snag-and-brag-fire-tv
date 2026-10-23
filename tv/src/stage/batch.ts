import { unstable_batchedUpdates } from '@amazon-devices/react-native-kepler';
/** Publish a room view or frame atomically on the legacy native React renderer. */
export function batchStage(update: () => void): void { unstable_batchedUpdates(update); }
