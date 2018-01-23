#!/usr/bin/env node

// vim: filetype=javascript

/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;

var   cmds = {};

cmds = sg.reduce(require('./cmds/db'), cmds, (m, value, key) => {
  return sg.kv(m, key, value);
});


const main = function() {

  var   u             = sg.prepUsage();

  return sg.__run2({}, callback, [function(result, next, last, abort) {

    const cmd                         = argvGet(ARGV, u('command,cmd', '=get-launch-codes', 'The command to run')) || ARGV.args.shift();

    if (!cmd)                         { return u.sage('command', 'Need a command to run .', callback); }

    if (!_.isFunction(cmds[cmd])) {
      console.error(cmd+' not found, I have: '+_.keys(cmds).join(','));
      return callback(true);
    }

    return cmds[cmd](ARGV, {}, function(err, result) {
      process.stdout.write(JSON.stringify(result)+'\n');
//console.error(err, result);
      return next();
    });

  }], function abort(err, msg) {

  });
};








main();

function callback() {
}

