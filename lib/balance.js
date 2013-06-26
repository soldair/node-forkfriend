module.exports =  function (a){
  if(!a.length) return false;
  if(typeof a._c == 'undefined') a._c = 0;
  else a._c = (a._c + 1) % a.length;

  return a[a._c];
};

