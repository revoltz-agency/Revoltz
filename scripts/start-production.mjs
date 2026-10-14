// Set production mode in JavaScript so the npm start script works on Windows
// shells as well as POSIX shells.
process.env.NODE_ENV = 'production';
await import('../server/index.js');
