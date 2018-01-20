
/**
 *  Get layer67 up and working.
 *
 *  pm2 start layer67.js --watch -- agent
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;

var   usage;

var   commands                = {};

const main = function() {
  var   command = ARGV.args.shift();

  command = command || (ARGV.help ? 'help' : command);

  if (!command) {
    return usage('Must supply a command.');
  }

  if (commands[command]) {
    return commands[command]();
  }

  /* otherwise */
  return usage('Unknown command: '+command);
};

commands.help = commands.usage = function() {
  return usage();
};

commands.agent = commands.commandServer = commands['command-server'] = commands.cmd = function() {
  const frontdoor             = require('./lib/frontdoor');

  return frontdoor.runFrontdoorServer({}, {}, function(err, launched) {
  });
};

usage = function(message) {
  if (message) {
    console.log(message);
  }

  console.log(
`Usage: layer67 command ...

    commands: agent (alias: command-server, cmd)
                --port[=12340]
                --ip[=127.0.0.1]`);
};



if (sg.callMain(ARGV, __filename)) {
  main();
}

