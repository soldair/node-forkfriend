
var c = 0; 
process.on('message',function(data){

  // slow this down a bit.
  for(var i=0;i<10;++i) {
    JSON.stringify(data);  
  }
  
  //process.send('a|'+data+'|'+process.pid);
  c++;
});
var paused = false;
setInterval(function(){
  if(!paused) {
    paused = true;

    console.log(process.pid,'child pause!!! ',c);
    process.send({__forkfriend:"pause"});
  } else {
    paused = false;

    console.log(process.pid,' child drain ',c);
    process.send({__forkfriend:"drain"}); 
  }
},5000);


