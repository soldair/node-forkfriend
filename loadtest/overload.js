var memwatch = require('memwatch');
var fs = require('fs');
var zlib = require('zlib');
var linestream = require('line-stream')
var mem = require('../lib/mem.js')

memwatch.on('leak',function(info){
   console.log('leak',info); 
});

var manager = require('../index.js')();
manager.add(__dirname+'/../test/workers/c.js',2);


var rs = fs.createReadStream(__dirname+'/access.log.gz');
var gz = rs.pipe(zlib.createGunzip());
var ls = gz.pipe(linestream())

ls.pipe(manager);

statsi = setInterval(function(){
    
  console.log(manager.getStats());
  console.log(mem());
},10000);

manager.on('end',function(){
  console.log('job complete! ',Date.now()-manager.stats.start);
  console.log(manager.getStats());
  console.log(mem());
  clearInterval(statsi);
});
