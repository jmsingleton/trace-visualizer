import React from 'react';
import { Panel } from './Panel';
import { Visualizer } from '../panels/Visualizer';
import { Topology } from '../panels/Topology';
import { Analytics } from '../panels/Analytics';

export function MissionControl() {
  return (
    <div style={{ display: 'grid', gridTemplateRows: '1fr 160px', gap: 8, height: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 8 }}>
        <Panel title="Agent Topology"><Topology /></Panel>
        <Panel title="Analytics"><Analytics /></Panel>
      </div>
      <Panel title="Activity"><Visualizer /></Panel>
    </div>
  );
}
