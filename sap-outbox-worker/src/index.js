const log = require('./logger');
const { connect: kConnect, disconnect: kDisc } = require('./kafka');
const { getPool } = require('./sql');
const { runLoop } = require('./outboxService');

const signal = { stop: false };

async function main(){
  await getPool();
  await kConnect();
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await runLoop(signal);
}
async function shutdown(){
  if(signal.stop) return;
  signal.stop = true;
  log.info('shutting down…');
  try{ await kDisc(); }catch{}
  process.exit(0);
}
main().catch(err=>{ log.fatal({err}, 'fatal'); process.exit(1); });
