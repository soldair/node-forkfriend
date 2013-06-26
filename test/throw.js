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
    t.equals(code,8,'should have got exit code 8 from uncaught exception.');

    t.end();
    manager.stop();
    
  });
  
  manager.send('crash');
});

