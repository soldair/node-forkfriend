
var i = 0;
module.exports =  function (a){
  if(!a.length) return false;
  a.sort(sort);

  if(i == 9007199254740992) count = 0;
  a[0]._c = ++i;

  return a[0];
};

function sort(proc,proc2){
  if(proc._c === undefined || proc._c > i) proc._c = 0;
  if(proc2._c === undefined || proc._c > i) proc2._c = 0;

  if(proc._c > proc2._c) return 1;
  else if(proc._c < proc2._c) return -1;
  return 0;
}
