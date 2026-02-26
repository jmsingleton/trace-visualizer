import { spawn } from 'child_process';

export function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  try {
    const proc = spawn(cmd, [url], { detached: true, stdio: 'ignore' });
    proc.on('error', () => {}); // swallow ENOENT and other spawn errors
    proc.unref();
  } catch {
    // Ignore if browser open fails (e.g. xdg-open not installed)
  }
}
