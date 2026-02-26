import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { useEvents } from '../contexts/EventContext';
import { theme } from '../styles/theme';

interface AgentNode extends d3.SimulationNodeDatum {
  id: string;
  parentId: string | null;
  tokenCount: number;
  active: boolean;
}

export function Topology() {
  const svgRef = useRef<SVGSVGElement>(null);
  const { events } = useEvents();

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const W = el.clientWidth || 400;
    const H = el.clientHeight || 300;

    const svg = d3.select(el);
    svg.selectAll('*').remove();

    // Build node map from events
    const nodeMap = new Map<string, AgentNode>();
    nodeMap.set('agent-0', { id: 'agent-0', parentId: null, tokenCount: 0, active: true });

    for (const e of events) {
      if (e.type === 'agent_spawn') {
        nodeMap.set(e.childAgentId, { id: e.childAgentId, parentId: e.parentAgentId, tokenCount: 0, active: true });
      }
      if (e.type === 'agent_complete') {
        const n = nodeMap.get(e.childAgentId);
        if (n) n.active = false;
      }
      if (e.type === 'session_end') {
        const n = nodeMap.get(e.agentId);
        if (n) { n.tokenCount = e.totalInputTokens + e.totalOutputTokens; }
      }
    }

    const nodes = Array.from(nodeMap.values());
    const links = nodes
      .filter(n => n.parentId && nodeMap.has(n.parentId))
      .map(n => ({ source: n.parentId as string, target: n.id }));

    // Defs: grid pattern + glow filter
    const defs = svg.append('defs');

    const pat = defs.append('pattern')
      .attr('id', 'topo-grid').attr('width', 40).attr('height', 40).attr('patternUnits', 'userSpaceOnUse');
    pat.append('path').attr('d', 'M 40 0 L 0 0 0 40').attr('fill', 'none')
      .attr('stroke', '#1a1a2e').attr('stroke-width', 0.5);

    const f = defs.append('filter').attr('id', 'node-glow');
    f.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
    const m = f.append('feMerge');
    m.append('feMergeNode').attr('in', 'blur');
    m.append('feMergeNode').attr('in', 'SourceGraphic');

    svg.append('rect').attr('width', '100%').attr('height', '100%').attr('fill', 'url(#topo-grid)');

    const g = svg.append('g');

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<AgentNode, { source: string; target: string }>(links)
        .id(d => d.id).distance(90))
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide(40));

    const link = g.selectAll<SVGLineElement, { source: AgentNode; target: AgentNode }>('line')
      .data(links as { source: AgentNode; target: AgentNode }[])
      .join('line')
      .attr('stroke', theme.purple + '88')
      .attr('stroke-width', 1.5);

    const node = g.selectAll<SVGGElement, AgentNode>('g.node')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .call(d3.drag<SVGGElement, AgentNode>()
        .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end',   (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    node.append('circle')
      .attr('r', (d: AgentNode) => 14 + Math.min(18, d.tokenCount / 8000))
      .attr('fill', theme.bgPanel)
      .attr('stroke', (d: AgentNode) => d.active ? theme.cyan : theme.textDim)
      .attr('stroke-width', (d: AgentNode) => d.active ? 2 : 1)
      .attr('filter', (d: AgentNode) => d.active ? 'url(#node-glow)' : 'none');

    // Pulse ring for active nodes
    node.filter((d: AgentNode) => d.active).append('circle')
      .attr('r', (d: AgentNode) => 18 + Math.min(18, d.tokenCount / 8000))
      .attr('fill', 'none')
      .attr('stroke', theme.pink)
      .attr('stroke-width', 1)
      .attr('opacity', 0.3);

    node.append('text')
      .text((d: AgentNode) => d.id.replace('agent-', ''))
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
      .attr('fill', theme.text).attr('font-size', 10).attr('font-family', 'monospace');

    sim.on('tick', () => {
      link
        .attr('x1', (d: unknown) => ((d as { source: AgentNode }).source.x ?? 0))
        .attr('y1', (d: unknown) => ((d as { source: AgentNode }).source.y ?? 0))
        .attr('x2', (d: unknown) => ((d as { target: AgentNode }).target.x ?? 0))
        .attr('y2', (d: unknown) => ((d as { target: AgentNode }).target.y ?? 0));
      node.attr('transform', (d: AgentNode) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => sim.stop();
  }, [events]);

  return (
    <div style={{ width: '100%', height: '100%', background: theme.bgPanel, borderRadius: 6, overflow: 'hidden' }}>
      <svg ref={svgRef} width="100%" height="100%" />
    </div>
  );
}
