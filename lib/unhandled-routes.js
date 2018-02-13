
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;

const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;

var lib = {};


// TODO: Log if we have an attacker (request for IP, or any php)
lib.unhandled = function(req, res, code_) {
  const code = code_ || 400;
  console.log('Unhandled: '+req.url);
  return sg['_'+code](req, res);
};


_.each(lib, (value, key) => {
  exports[key] = value;
});

