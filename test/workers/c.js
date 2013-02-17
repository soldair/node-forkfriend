
var c = 0; 
process.on('message',function(data){

  // slow this down a bit.
  //for(var i=0;i<10;++i) {
  //  JSON.stringify(data);  
  //}
  
  //process.send('a|'+data+'|'+process.pid);
  c++;
});
var paused = false;
setInterval(function(){
  console.log('[',process.pid,'] child count: ',c);
  process.send({count:c});
},10000);


