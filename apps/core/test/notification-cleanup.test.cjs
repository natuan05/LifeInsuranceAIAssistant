require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {NotificationsService}=require('../dist/notifications/notifications.service');
test('A4 bootstrap/daily/restart/destroy timer and database failure recovery',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 let calls=0,fail=true;
 const service=new NotificationsService({prisma:{$executeRaw:async()=>{calls++;if(fail)throw Error('Synthetic DB failure');return 2;}}});
 service.onApplicationBootstrap();assert.equal(calls,1);
 t.mock.timers.tick(86399999);assert.equal(calls,1);
 fail=false;t.mock.timers.tick(1);assert.equal(calls,2);
 service.onModuleDestroy();t.mock.timers.tick(86400000);assert.equal(calls,2);
 service.onApplicationBootstrap();assert.equal(calls,3);
 service.onModuleDestroy();t.mock.timers.reset();
 assert.equal(await service.cleanupExpiredNotifications(),2);
});
