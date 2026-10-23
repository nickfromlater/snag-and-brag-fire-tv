import React from 'react';
import { View, Text } from '@amazon-devices/react-native-kepler';
export function Benchmark(_props:{onExit?:()=>void}): React.ReactElement { return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: '#FFF8EC', fontSize: 28 }}>The workload benchmark runs on Vega. Web is for scene iteration.</Text></View>; }
