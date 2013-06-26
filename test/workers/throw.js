
process.on('message',function(data){
  if(data == 'crash'){
    setTimeout(function(){
      throw new Error('oh no!');
    },100);
  }
});


