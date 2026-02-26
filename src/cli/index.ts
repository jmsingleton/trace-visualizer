import { parseArgs } from 'util';

const { positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true });
const [command, ...rest] = positionals;

switch (command) {
  case 'start': {
    const { createServer } = await import('../daemon/server');
    const { openBrowser } = await import('./open-browser');
    const distPath = new URL('../../dist/web', import.meta.url).pathname;
    const server = await createServer({ port: 7823, devMode: false, webDistPath: distPath });
    const { networkInterfaces } = await import('os');
    const nets = networkInterfaces();
    const lan = Object.values(nets).flat().find(n => n && n.family === 'IPv4' && !n.internal);
    const lanUrl = lan ? `http://${lan.address}:7823` : null;
    console.log('⬡ trace-viz running → http://localhost:7823');
    if (lanUrl) console.log(`⬡ network access  → ${lanUrl}`);
    openBrowser('http://localhost:7823');
    process.on('SIGINT', () => { server.stop(); process.exit(0); });
    break;
  }
  case 'init': {
    const { runInit } = await import('./commands/init');
    await runInit();
    break;
  }
  case 'replay': {
    const { runReplay } = await import('./commands/replay');
    await runReplay(rest[0]);
    break;
  }
  case 'export': {
    console.log('Export is triggered from the web dashboard via the ⬡ Export button.');
    break;
  }
  case 'hook': {
    const { runHook } = await import('./commands/hook');
    await runHook(rest[0]);
    break;
  }
  default:
    console.log('Usage: trace-viz <start|init|replay>\n');
    console.log('  start    Start daemon and open web dashboard');
    console.log('  init     Install Claude Code hooks');
    console.log('  replay   Replay a saved session: trace-viz replay <file.jsonl>');
}
