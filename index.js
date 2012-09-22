var util = require('util')
, fork = require('child_process').fork
, EventEmitter = require('events').EventEmitter
;

module.exports = function(config){
  return new Manager(config);
};


function Manager(config){
  this.config = config||{};
  this.config.maxQueue = this.config.maxQueue||100;
  this.config.respawnInterval = this.config.respawnInterval||500;
}

util.inherits(Manager,EventEmitter);

_ext(Manager.prototype,{
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
      if( typeof data != 'undefined' ) {
        worker.buffer.push(data);
      }
      if(!worker.buffer.length) return;

      try{
        var unsent = [];
        while(worker.buffer.length) {
          msg = worker.buffer.shift();
          lastWorker = z._balance(worker);

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
        if(z.stopped) return;
        z.add(worker,args)
      };

      cp.on('disconnect',function(){
        //if i cant talk to it im just gonna kill it
        //child can handle and not die if it really wants
        z.emit('worker-disconnect',worker,args,cp)
        cp.kill();
        handleExit(0);
      });

      cp.on('exit',function(code){
        handleExit(code);
      });

      cp.on('message',function(message){
        z.emit('message',message,worker,cp);
      });

      z.workers[worker].process.push(cp);

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
    cp.kill();
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
          cp.kill();
        });
    })    
  },
  refork:function(key,cp){
    this.remove(key,cp);
    this.add(key,this.workers[key].args)
  },
  _balance:function(obj){
    if(!obj._c) obj._c = 0;
    obj._c++;
    // quick round robin
    var k = obj._c%obj.process.length; 
    return obj.process[k];
  }
});

function _ext(o1,o2){
  Object.keys(o2).forEach(function(k){
    o1[k] = o2[k]; 
  });
  return o1;
}

