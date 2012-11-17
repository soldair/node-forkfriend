
[![Build Status](https://secure.travis-ci.org/soldair/node-forkfriend.png)](http://travis-ci.org/soldair/node-forkfriend)

# forkfriend
dead simple worker process manager. respawn children. load balance work amongst children.

## example

```js

var forkfriend = require('friend');
var friend = forkfriend();

// make 3 somefriend.js worker with arguments
friend.add('somefriend.js',['-a',1],3);

// workers for the same file get the same args as the first. 
// multiple calls to add add that many more to the pool
friend.add('somefriend.js')

friend.send('hey one of you work on this');

friend.on('message',function(message,workername,worker){
  // message is the data the child sent.
  // workername === 'somefriend.js'
  // worker instanceof ChildProcess
})

// when you are all done
friend.stop();


```


## api


forkfriend
 
  forkfriend(options)
  - options {} [optional]
    - respawnInterval
      - defaults to 500 ms. this is the max speed that new children will be spawned to prevent pegging the cpu on broken workers
    - maxQueue 
      - defaults to 100. this is the maximum number of pending messages for workers that should be held while waiting for a functional worker to spawn. after this messages will be dropped but a drop event will be emitted so you application can choose how to handle the issue.
  - returns "friend" an EventEmitter
  forkfriend.balance()
  - this method handles round robin for messages of a worker type
    - overload this method to implement sticky balancing etc.

friend

  - add(script,arguments [optional],num [optional])
  - add(script,num [optional])
    - script is the path to the javascript file you want to fork
    - arguments are passed to fork as argv of your child process
    - the number of children you want to add to the pool. this is the same as calling add multiple times.
  - remove(script)
  - remove(script, num [optional])
  - remove(script,cp ChildProcess [optional])
    - remove a worker from the pool for script
    - if cp is provided this specifc child is removed
    - if num is provided
  - get(script)
    - get an array of the child processes in the pool for script
  - send (message, script [optional])
    - the message to send to one worker of each pool
    - send the message to a worker spawned from "script"
  - stop ()
    - stops the show. kills all child processes so your script can exit cleanly.
  - refork (script, cp ChildProcess [optional])
    - kill and start a specific worker or any in the pool

friend events

  - message (message,script,args,cp ChildProcess)
    - a worker has sent you a message
  - worker (script,args,cp ChildProcess)
    - a new worker has been forked for this script
  - worker-exit (code,script,args,cp ChildProcess)
    - a worker has exited. the friend will try to refork it
  - worker-disconnect (script,args,cp ChildProcess)
    - a child has closed its communication channel with this process. the friend will try to kill it.
  - worker-error (error,script,args,cp ChildProcess)
    - a worker has had an error event, the friend will try to refork it.
  - drop
    - too many messages could not be sent to the workers for this script.



## what does a worker look like

```js

process.on('message',function(data){
  // do somthing
  // tell friend about it
  process.send('hey i worked onn '+data);
});


```
 
## woo hooo.

let me know if this is helpful or if you have any issues.
