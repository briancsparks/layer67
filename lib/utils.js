
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const { StringDecoder }       = require('string_decoder');

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;

var lib = {};

lib.decode = function(buffer, encoding) {
  const decoder = new StringDecoder(encoding);

  var   result  = '';

  result  = decoder.write(buffer);
  result += decoder.end();

  return result;
};


_.each(lib, (value, key) => {
  exports[key] = value;
});

