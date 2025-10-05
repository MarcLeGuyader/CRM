import { bus } from '../../modules/event-bus/bus.js';

function assert(name, cond){
  if(!cond) { console.error('❌', name); throw new Error(name); }
  else console.log('✅', name);
}

(function run(){
  // 1) on returns unsubscribe that works
  let called = 0;
  const off = bus.on('t1', () => called++);
  bus.emit('t1'); bus.emit('t1');
  assert('unsubscribe exists', typeof off === 'function');
  off();
  bus.emit('t1');
  assert('unsubscribe removed handler', called === 2);

  // 2) FIFO order per-topic
  const order = [];
  const offA = bus.on('t2', () => order.push('A'));
  const offB = bus.on('t2', () => order.push('B'));
  bus.emit('t2');
  offA(); offB();
  assert('FIFO order', order.join(',') === 'A,B');

  // 3) emit returns number of handlers invoked
  const offC = bus.on('t3', ()=>{});
  const offD = bus.on('t3', ()=>{});
  const n = bus.emit('t3');
  offC(); offD();
  assert('emit count', n === 2);

  // 4) clear(topic) only removes the topic
  const offE = bus.on('x', ()=>{});
  const offF = bus.on('y', ()=>{});
  bus.clear('x');
  const cx = bus.count('x');
  const cy = bus.count('y');
  offF();
  assert('clear(topic) works', cx === 0 && cy === 1);

  // Done
  console.log('✅ All event-bus tests passed');
})();
