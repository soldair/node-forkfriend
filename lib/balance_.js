module.exports =  function (a){
  if(!a.length) return false;
  if(a._c > a.length+1) a._c = 0;
  else if(!a._c) a._c = 0;

  a._c++;

  // round robin
  return a[a._c%a.length];
};

