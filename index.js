var util = require('util')
, fork = require('child_process').fork
, through = require('through')
, balance = require('./lib/balance')
, methods
;

module.exports = function(config){
  // i am a stream!!
  // though i may be better represented in the future by a duplex stream.
  var manager = through(function(data){
    this.send(data);
  });

  _ext(manager,methods);
  manager.config = config = config||{};

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
  manager.stats = {paused:0,messages:0,length:0,start:Date.now(),pauses:0,drains:0};
  manager.workers = {};
  manager.workerStreams = {};
  manager.stopped = false;

  // if end is fired i need to stop the show.
  manager.on('end',function(){
    this.stop();
  });

  manager.on('pause',function(){
    manager.stats.pauses++;
    manager.stats.pauseStart = Date.now();
    // i am a stream now.
  });

  manager.on('drain',function(){
    var p = Date.now()-manager.stats.pauseStart;
    manager.stats.paused += p;
    manager.stats.drains++;
  });

  return manager;
};

//manager api.
methods = {
  workers:{},
  workerStreams:{},
  stopped:false,
  send:function(data,key){
    var z = this;
    var toLoop = key?[key]:Object.keys(this.workers);
    toLoop.forEach(function(k){
      var worker = z.workers[k]
      ,msg
      ,lastWorker
      ;
      // stats.
      z.stats.messages+=1;
      if(data && data.length) {
        z.stats.length += data.length;
      }

      if(!worker) return;
      if( typeof data != 'undefined' ) worker.buffer.push(data);
      if(!worker.buffer.length) return;

      try{
        var unsent = [];
        while(worker.buffer.length) {
          msg = worker.buffer.shift();

          var pool = z.filter(worker.process); 
          lastWorker = z.balance(pool,msg);

          if(lastWorker) {
            var buffered = !lastWorker.send(msg);

            if(buffered && !lastWorker.buffering) {
              z._childBuffering(k,lastWorker);
            }

          }
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

    if(this.paused){
      this.pause();
    }
    return !this.paused;
  },
  add:function(worker,args,num){

    var z = this;
    if(worker.forEach) {
      worker.forEach(function(w){
        z.add(w,args,pool);
      });
      return;
    }

    if(args && typeof args == 'number') {
      num = +args;
      args = [];
    }

    if(!isNaN(num)){
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
        runCount:0,
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

    z.workers[worker].runCount++;
    z.workers[worker].lastFork = Date.now();
    setTimeout(function(){
      if(z.stopped) return;
      if(!z.workers[worker] || z.workers[worker].runCount <= z.workers[worker].process.length){
        // before this worker process was started the process count was changed. 
        // this  is no longer needed.
        z.emit('worker-aborted',worker);
        return;
      }
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
          if(z.workerStreams[worker]) {
            z.workerStreams[worker].emit('data',message);
          }
          z.emit('data',message);
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
    if(z.workers[key].runCount) z.workers[key].runCount--;
    if(!z.workers[key].runCount) delete z.workers[key];

    if(i === -1) return;

    z.workers[key].process.splice(i,1);
    process.nextTick(function(){
      cp.kill();
    });
  },
  get:function(key){
    return (this.workers[key]||{}).process;
  },
  stop:function(){
    var z = this;
    if(this.stopped) return;
    this.stopped = true;
    Object.keys(this.workers).forEach(function(k){
        var w = z.workers[k];
        w.process.forEach(function(cp,i){
          w.process.splice(i,1);
          process.nextTick(function(){
            cp.kill();
          });
        });
    });

    Object.keys(z.workerStreams).forEach(function(k){
       z.workerStreams[k].end();   
    });
    if(!this.ended) this.emit('end');    
  },
  refork:function(key,cp){
    var args = this.workers[key].args;
    var procs = this.workers[key].runCount;
    this.remove(key,procs);
    this.add(key,args,procs);
  },
  getWorkerStream:function(key){
    var stream = false;
    if(this.workers[key]){
      stream = this.workerStreams[key];
      if(!stream) stream = this.workerStreams[key] = through();
    }
    return stream;
  },
  _childDrained:function(worker,cp){
    // when a worker is unpaused we need need to loop available workers
    var paused = 0,z = this;
    if(cp) cp.paused = false;
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

    if(paused && !this.paused) {
      this.pause();
    } else if(this.paused){
      this.resume();
    }
  },
  _childBuffering:function(worker,cp){
    var workerData = this.workers[worker],z = this;
    if(!cp.buffering) cp.buffering = Date.now();
    if(cp.bufferingPoll) clearInterval(cp.bufferingPoll);
    // yes i really have to do this. because there is no drained event for child processes ipc channel
    cp.bufferingPoll = setInterval(function(){
      if(cp.killed || cp.disconnected || cp.exitCode){
        clearInterval(cp.bufferingPoll);
        return;
      }
      //TODO || writeQueue is < limit
      if(!cp._channel.buffering){
        cp.buffering = false;
        z._childDrained(worker);
      }
    },100);
    
    return this._checkWorkersPaused(workerData);
  },
  _childPaused:function(worker,cp){
    // if any worker is completely paused we have to pause the parent.
    var workerData = this.workers[worker];
    if(!cp.paused) cp.paused = Date.now();
    
    return this._checkWorkersPaused(workerData);
  },
  _checkWorkersPaused:function(workerData){
    var pausedWorkers = 0,paused = false,z = this;
    workerData.process.forEach(function(cp){
      if(cp.paused) {
        // recover lost children
        if(z.config.pausedWorkerTimeout > -1 && Date.now()-cp.paused > z.config.pausedWorkerTimeout){
          cp.kill(); 
        }
        ++pausedWorkers;
      }
      // if the ipc channel is saturated i set this flag.
      else if(cp.buffering) ++pausedWorkers;
    });

    if(pausedWorkers == workerData.process.length) paused = true;
    if(paused && !this.paused) {
      this.pause(); 
    }
    return paused; 
  },
  getStats:function(){
    var elapsed = Date.now()-this.stats.start;
    var report = {}; 
    report.messagesPerMs = this.stats.messages/elapsed;
    report.bytesPerMs = this.stats.length/elapsed;
    report.percentPaused = (this.stats.paused?(this.stats.paused*100/elapsed):0);
    report.elapsed = elapsed;
    report.paused = this.stats.paused;
    report.pauses = this.stats.pauses;
    report.drains = this.stats.drains;
    return report;
  },
  balance:balance,
  filter:function(processes){
    // right now buffering status on a child process is not evented. this sucks.
    var a = [];
    for(var i=0;i<processes.length;++i){
      if(!processes[i].paused && !processes[i].buffering) {
        a.push(processes[i]);
      }
    }
    return a;
  }
};

function _ext(o1,o2){
  Object.keys(o2).forEach(function(k){
    o1[k] = o2[k]; 
  });
  return o1;
}

