
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const AWS                     = require('aws-sdk');

const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;

const dynamoDb                = new AWS.DynamoDB();

var lib       = {};
var subcmds   = {};

//...
lib.put = lib.putCluster = lib['put-cluster'] = function(ARGV, context, callback) {

  var   u             = sg.prepUsage();
  const subcmd        = argvGet(ARGV, u('subcommand,sub', '=over-miami', 'The sub-command to run')) || ARGV.args.shift();

  if (!subcmd)        { return u.sage('subcommand', 'Need a subcommand to run .', callback); }

  const fn = subcmds.put[subcmd];

  if (!_.isFunction(fn)) {
    return u.sage('unknown subcommand', 'Need a subcommand to run .', callback)
  }

  return fn(ARGV, context, function(err, result) {
    return callback(null, result);
  });
};

subcmds.put = subcmds.put || {};

// --key-name=HQ --security-group-ids=sg-85e1e9f1 --iam-instance-profile=peach-admin-instance-role --ip=10.91.0.250 --subnet=subnet-3644707d
subcmds.put.launchConfig = subcmds.put.launchconfig = function(ARGV, context, callback) {

  var   u             = sg.prepUsage();

  const role          = ARGV.role  ||  ARGV.type     || ARGV.ty;
  const cmdLine       = ARGV.cmdline    || ARGV.command  || ARGV.cmd;

  const spec = {
    type          :{S:"LaunchConfig"},
    id            :{S:role},
    cmdLineArgs   :{S:cmdLine}
  };

//  console.log(spec, JSON.stringify(spec));

  return callback(null, spec);
};




_.each(lib, (value, key) => {
  exports[key] = value;
});


