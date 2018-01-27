
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


lib.unhandled = function(req, res) {
  console.log('Unhandled: '+req.url);
  return sg._400(req, res);
};


_.each(lib, (value, key) => {
  exports[key] = value;
});

