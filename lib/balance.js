module.exports =  function fn(a,depth){
  if(depth > a.length) return false;
  if(!a.length) return false;
  if(a._c > a.length+1) a._c = 0;
  else if(!a._c) a._c = 0;

  a._c++;

  // round robin
  var k = a._c%a.length;
  // if i found a paused child
  if(a[k].paused) return fn(a,(depth||0)+1);
  return a[k];
};

