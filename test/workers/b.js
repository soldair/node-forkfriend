

process.on('message',function(data){
  process.send('b|'+data+'|'+process.pid);
});

