var test = require('tap').test
, forkfriend = require(__dirname+'/../index.js')
;

test('can manage',function(t){
  var c = 0;
  var messages = [];


  var friend = forkfriend();
  var bmessages = [];
  var amessages = [];

  friend.on('message',function(message,worker,child){
    c++;
    messages.push(message);
    var parts = message.split('|');
    t.equals(parts.length,3,'should have message from test worker in expected format');
    if(parts[0] == 'a') amessages.push(parts);
    else if(parts[0] == 'b') bmessages.push(parts);
    else t.fail('message has un-identified first chunk');

    if(c < 3) return;

    t.equals(amessages.length,1,'should only have 1 message from "a" worker');
    t.equals(amessages[0][1],'hi','should only have correct mesage from "a" worker');

    bmessages = [bmessages[0][1],bmessages[1][1]];

    t.ok(bmessages.indexOf('hi') !== -1,'should have "hi" mesage from "b" worker');
    t.ok(bmessages.indexOf('ho') !== -1,'should have "ho" mesage from "b" worker');

    friend.stop();

    t.end();
  });


  friend.add(__dirname+'/workers/a.js');
  friend.add(__dirname+'/workers/a.js');
  friend.add(__dirname+'/workers/b.js');

  friend.send('hi');
  friend.send('ho',__dirname+'/workers/b.js');

});


test('remove worker',function(t){

  var friend = forkfriend({respawnInterval:1});
  var messages = [];
  var hit = 0;

  friend.on('message',function(message,worker,child){
    messages.push(message);
    var interval;
    if(hit++) {
      clearInterval(interval);
      t.fail('got an extra unexpected message when removing workers');

      friend.stop();
      t.end();
    } else {
      setTimeout(function(){
        t.equals(messages.length,1,'should have only gotten one message');

        friend.stop();
        t.end(); 
      },40);
    }
  });

  friend.on('worker-aborted',function(){
    t.ok('should worker aborted event');    
  });

  friend.add(__dirname+'/workers/a.js');
  friend.add(__dirname+'/workers/b.js');
  friend.remove(__dirname+'/workers/b.js');

  friend.send('hi');

  t.ok(!friend.workers[__dirname+'/workers/b.js'],'should not have any data for b because it is removed.');

});
