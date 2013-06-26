
var test = require('tap').test;
var balance = require('../lib/balance');

test("can balance randomly available processes",function(t){

  var procs = [{id:1},{id:2},{id:3},{id:4}];
  var cpy = procs.slice.call(procs);

  var proc = balance(cpy);
  t.equals(proc,procs[0],'first proc should be the first');

  proc = balance(cpy);
  t.equals(proc,procs[1],'second proc should be the second');

  // now lets pretend that only 0 and 3 are available
  proc = balance([procs[0],procs[3]]);
  t.equals(proc,procs[3],'fourth proc should be picked because it has never been assigned work');
 
  // now lets pretend that only 0 and 3 are available
  proc = balance([procs[0],procs[3]]);
  t.equals(proc,procs[0],'first should be picked because it was assigned work before the fourth');

  // everyone is avalable again. 
  proc = balance(cpy);
  t.equals(proc,procs[2],'thrid should be picked because it has never been assigned work');

  t.end();

});

