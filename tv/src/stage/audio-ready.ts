import { createContext } from 'react';

/** Native particle worklets attach after the bounded media bank is initialized. */
export const AudioReadyContext = createContext(false);
