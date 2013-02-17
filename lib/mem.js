
module.exports = function(){
  var s = [],m = process.memoryUsage();
  for( var i in m){
    s.push(i+': '+humanSize(m[i]));
  }
  return s.join(' , ');
};

module.exports.humanSize = humanSize;

function humanSize(size){
  var unit = ['b','kb','mb','gb','tb','pb']
  ,i = Math.floor(Math.log(size)/Math.log(1024))
  ,v = (size/Math.pow(1024,i))+'';

  if(v.indexOf('.') != -1) {
    v = v.substr(0,v.indexOf('.')+3);
  }
  return v+' '+unit[i];
}
