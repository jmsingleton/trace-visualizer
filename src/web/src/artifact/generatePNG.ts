import html2canvas from 'html2canvas';

export async function exportPNG(cardEl: HTMLElement): Promise<void> {
  const canvas = await html2canvas(cardEl, {
    backgroundColor: '#0a0a0f',
    scale: 1,
    useCORS: true,
    logging: false,
  });
  const link = document.createElement('a');
  link.download = `trace-viz-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
