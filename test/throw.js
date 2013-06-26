var test = require('tap').test;
var forkfriend = require('../index.js');
//
// to test issues related to events when children crash.
//

test("throwing worker",function(t){
  var manager = forkfriend();
  var em = manager.emit;

  manager.add(__dirname+'/workers/throw.js');

  manager.on('worker-error',function(code){
    // node 0.10 exits with 8 node 0.8 exits with 1
    t.ok(code,'should have got an exit code from uncaught exception.');

    t.end();
    manager.stop();
    
  });
  
  manager.send('crash');
});

