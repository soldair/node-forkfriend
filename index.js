var util = require('util')
, fork = require('child_process').fork
, through = require('through')
, balance = require('./lib/balance')
, methods
;

module.exports = function(config){
  // i am a stream!!
  // though i may be better represented in the future by a duplex stream.
  var manager = through();
  _ext(manager,methods);
  manager.config = config||{};

  // General Config:
  // maxQueue represents the maximum number of pending messages the manager will buffer while spawning new workers or waiting for pause.
  // any dropped data is emitted as a drop event so you can and should handle this in your application.
  manager.config.maxQueue = config.maxQueue||1000;
  // 
  // processes will not be spawned as a rate faster than this for all scripts.
  // prevents thrashing.
  manager.config.respawnInterval = config.respawnInterval||500;
  // 
  // Stream Mode Specific Config:
  // by default a paused child will be allowed to stay paused for 10 minutes
  // if you pass -1 for this config option the child will be allowed to pause forever.
  // if you choose forever make sure you have a plan just in case one worker stops the show forever
  manager.config.pausedWorkerTimeout = manager.config.lostInTheWoods = config.pausedWorkerTimeout||config.lostInTheWoods||-1;

  manager.workers = {};
  manager.stopped = false;

  var write = manager.write;
  manager.write = function(data){
    // when write is called this opts into new stream api use
    manager.stream = true;
    manager.emit('stream');
    manager.write = write;
    manager.write(data);
  }

  // if end is fired i need to stop the show.
  manager.on('end',function(){
    this.stop();
  });

  // send data events to all workers.
  manager.on('data',function(data){
    // any calls that get here must be sent
    var success = this.send(data);
    // if i cant send i need to pause.
    // ill need to trust that a child will exit and be respawned or return an unpause event.
    if(!success) this.pause();
  });
  
  manager.on('stream',function(){
    // i am a stream now.
    // i need to send my hello im a stream messages to the active workers.
    // todo
    manager.send({__forkfriend:'stream'});
  });
};

//manager api.
methods = {
  workers:{},
  stopped:false,
  send:function(data,key){
    var z = this;
    var toLoop = key?[key]:Object.keys(this.workers);
    toLoop.forEach(function(k){
      var worker = z.workers[k]
      ,msg
      ,lastWorker
      ;

      if(!worker) return;
      if( typeof data != 'undefined' ) worker.buffer.push(data);
      if(!worker.buffer.length) return;

      try{
        var unsent = [];
        while(worker.buffer.length) {
          msg = worker.buffer.shift();
          lastWorker = balance(worker);

          if(lastWorker) lastWorker.send(msg);
          else unsent.push(msg);
        }
      } catch (e) {
        if(lastWorker) lastWorker.kill();

        worker.errors++;
        worker.lastError = Date.now();

        process.nextTick(function(){
          z.send(msg,k);    
        });
      }

      // add any unsent to the buffer again.
      if(unsent.length) worker.buffer.push.apply(worker.buffer,unsent);

      if(worker.buffer.length > z.config.maxQueue){
        z.emit('drop',key,worker.buffer.shift());
      }
    });
  },
  add:function(worker,args,num){

    var z = this;
    if(worker.ForEach) {
      worker.forEach(function(w){
        z.add(w,args,pool);
      });
      return;
    }

    if(args && !args instanceof Array) {
      num = +args;
      args = [];
    }

    if(num !== undefined){
      num = +num;
      if(num > 0 && !isNaN(num)) {
        while(num > 0) {
          num--;
          z.add(worker,args);
        }
        return true;
      }
      return;
    }

    if(!z.workers[worker]){
      z.workers[worker] = {
        args:args,
        process:[],
        buffer:[],
        stream:[],
        errors:0,
        lastFork:0,
        lastError:0
      };
    }

    var timeout = this.config.respawnInterval-(Date.now()-z.workers[worker].lastFork);
    if(timeout < 0) timeout = 0;

    z.workers[worker].lastFork = Date.now();
    setTimeout(function(){
      if(z.stopped) return;

      var cp = fork(worker,args);
      z.workers[worker].process.push(cp);

      var removed = false;

      z.emit('worker',worker,args,cp);

      cp.on('error',function(e){
        z.emit('worker-error',e,worker,args,cp);
      });

      var handleExit = function(code){
        if(removed) return false;
        removed = true;
        
        var i = z.workers[worker].process.indexOf(cp);
        z.workers[worker].process.splice(i,1);
        z.emit('worker-exit',code,worker,args,cp);

        z._childDrained(worker,null);

        if(z.stopped) return;
        z.add(worker,args)
      };

      cp.on('disconnect',function(){
        //if i cant talk to it im just gonna kill it
        //child can handle and not die if it really wants
        z.emit('worker-disconnect',worker,args,cp);
        cp.kill();
        handleExit(0);
      });

      cp.on('exit',function(code){
        handleExit(code);
      });

      cp.on('message',function(message){
        if(message && message.__forkfriend){
          var action = message.__forkfriend;
          if(action === 'end') {
            // kill and respawn child.
            cp.kill();
            handleExit(0);
          } else if(action === 'drain') {
            // this child wants more data
            cp.paused = 0;
            z._childDrained(worker,cp);
          } else if(action === 'pause'){
            // this child wants pause
            cp.paused = Date.now();
            
            z._childPaused(worker,cp);
          }
        } else {
          z.emit('message',message,worker,cp);
        }
      });


      // drain any messages that were queued.
      z.send(undefined);

    },timeout);
  },
  remove:function(key,cp){
    var z = this;
    if(!z.workers[key]) return;

    // if child process is not defined just remove one.
    if(cp === undefined) {
      cp = z.workers[key].process[0];
    } else if(typeof cp == 'number'){
      while(cp > 0) {
        cp--;
        z.remove(key);
      }
      return;
    }

    var i = z.workers[key].process.indexOf(cp);
    if(i === -1) return;

    z.workers[key].process.splice(i,1);
    // if i have been upgraded to a stream i need to
    if(z.stream) cp.send({__forkfriend:'end'});
    process.nextTick(function(){
      cp.kill();
    });
  },
  get:function(key){
    return (this.workers[key]||{}).process;
  },
  stop:function(){
    var z = this;
    this.stopped = true;
    Object.keys(this.workers).forEach(function(k){
        var w = z.workers[k];
        w.process.forEach(function(cp,i){
          w.process.splice(i,1);
          //
          //should this send a hey im ending now message so children can enjoy a clean exit?
          //its probably kinda pointless because the only clean exit can happen binding sighandlers anyway.
          //
          if(z.stream) cp.send({__forkfriend:'end'});
          process.nextTick(function(){
            cp.kill();
          });
        });
        // IF WORKERS ARE STREAMS I SHOULD CALL END
        w.end();
    })    
  },
  refork:function(key,cp){
    this.remove(key,cp);
    this.add(key,this.workers[key].args)
  },
  _childDrained:function(worker,cp){
    // when a worker is unpaused we need need to loop available workers
    var paused = 0,z = this;
    cp.paused = false;
    Object.keys(this.workers).forEach(function(name){
      var workerData = z.workers[name];
       if(name === worker) {
         var pausedWorkers = 0;
         pausedWorkers = z._checkWorkersPaused(workerData);

         if(pausedWorkers) paused = true;
       } else {
         if(workerData.paused) paused = true;
       }
    });

    if(paused) {
      this.pause();
    } else {
      this.resume();
    }
  },
  _childPaused:function(worker,cp){
    // if any worker is completely paused we have to pause the parent.
    var workerData = this.workers[worker];
    if(!cp.paused) {
      cp.paused = true;
    }
    var paused = this._checkWorkersPaused(workerData);
    if(paused) {
      this.pause();
    }
  },
  _checkWorkersPaused:function(workerData){

    var pausedWorkers = 0,paused = false;
    workerData.process.forEach(function(cp){
      if(cp.paused) ++pausedWorkers;
    });

    if(pausedWorkers == workerData.process.length) paused = true; 
    return paused; 
  },
  // overload this function to provide your own balancing method. stickyness etc
  balance:balance
  //TODO
};

function _ext(o1,o2){
  Object.keys(o2).forEach(function(k){
    o1[k] = o2[k]; 
  });
  return o1;
}

