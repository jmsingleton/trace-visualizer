export const theme = {
  bg:             '#0a0a0f',
  bgPanel:        '#0d0d16',
  bgPanelBorder:  '#1e1e32',
  purple:         '#9d00ff',
  cyan:           '#00f5ff',
  pink:           '#ff2d78',
  gold:           '#ffd700',
  text:           '#e8e8e8',
  textDim:        '#4a4a6a',
  glow: {
    purple: '0 0 12px #9d00ff88, 0 0 24px #9d00ff44',
    cyan:   '0 0 12px #00f5ff88, 0 0 24px #00f5ff44',
    pink:   '0 0 12px #ff2d7888, 0 0 24px #ff2d7844',
  },
} as const;

export type Theme = typeof theme;
