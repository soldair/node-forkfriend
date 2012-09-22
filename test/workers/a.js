

process.on('message',function(data){
  process.send('a|'+data+'|'+process.pid);
});

