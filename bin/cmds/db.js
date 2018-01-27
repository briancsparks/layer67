
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const AWS                     = require('aws-sdk');
const helpers                 = require('../../lib/db');

const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;
const query                   = helpers.query_;

const dynamoDb                = new AWS.DynamoDB({region: 'us-east-1'});

var lib       = {};
var subcmds   = {};

lib.putDb = function(argv, context, callback) {
  var   u             = sg.prepUsage();

  const namespace     = argvGet(argv, 'namespace,ns')     || process.env.NAMESPACE;
  const key           = argvGet(argv, 'key');
  const set           = argvGet(argv, 'set');
  const dbName        = argvGet(argv, 'db-name,db');

  if (!key)           { return u.sage('key', 'Need a key.', callback); }
  if (!set)           { return u.sage('set', 'Need a something to set.', callback); }
  if (!dbName)        { return u.sage('db-name', 'Need a db.', callback); }

  var result  = {};
  var updates = {};

  updates.Key = {id:{S:key}};
  updates.ReturnValues = argvGet(argv, 'return-values') || 'UPDATED_NEW';

  const setParts = set.split('=');
  _.each({[setParts[0]] : _.rest(setParts).join('=')}, (value, key) => {
    updates.UpdateExpression           = `SET ${key}=:${key}`;
    updates.ExpressionAttributeValues  = query({[':'+key] : sg.smartValue(value)});
  });

  updates.TableName = `${namespace}${dbName}`;
  return dynamoDb.updateItem(updates, function(err, data) {
    result.set  = updates;
    result.data = data;

    if (err) { console.error(err); return callback(err); }
    return callback(null, result);
  });
};

lib['put-cluster-db'] = function(argv, context, callback) {
  var   u             = sg.prepUsage();

  const namespace     = argvGet(argv, 'namespace,ns')     || process.env.NAMESPACE;
  const key           = argvGet(argv, 'key');
  const set           = argvGet(argv, 'set');

  return lib.putDb(_.extend({dbName:'clusterDb'}, argv), context, function(err, result) {
    return callback(err, result);
  });
};

lib['put-admins-db'] = function(argv, context, callback) {

  return lib.putDb(_.extend({dbName:'adminsDb'}, argv), context, function(err, result) {
    return callback(err, result);
  });
};

//...
lib.put = lib.putClusterDb = lib['put-cluster'] = function(ARGV, context, callback) {

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


