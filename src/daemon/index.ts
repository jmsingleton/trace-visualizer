import { createServer } from './server';
const server = await createServer({ port: 7823, devMode: false });
console.log(`trace-viz daemon running on port ${server.port}`);
