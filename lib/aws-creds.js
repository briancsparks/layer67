
/**
 *  Allows the caller to use the AWS toolkit against any AWS account, so scripts
 *  like our create-stacks scripts can build infrastructure in the prod and dev
 *  accounts.
 *
 *    Use like this to do ec2 things in the 12345678 account.
 *
 *      const ec2 = awsService('EC2', 'prod');
 *
 *    You must have sufficient permissions in IAM for calls to succeed, however.
 *    You must supply JSAWS_AWS_ACCTS to provide the account numbers (it contains
 *    a mapping 'prod' --> 12345678.
 */
const sg                      = require('sgsg');
const _                       = sg._;
const raLib                   = sg.include('run-anywhere') || require('run-anywhere');
const AWS                     = require('aws-sdk');

const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;


// The credentials that this instance has normally
var credsForRole              = {};
var services                  = {};
credsForRole.dev              = new AWS.EC2MetadataCredentials({});
AWS.config.credentials        = credsForRole.dev;


var lib = {};

var acctInfo;
lib.awsService = function(serviceName, acctName, options_) {
  var   options = options_ || {};

  options.region        = options.region        || 'us-east-1';
  services[serviceName] = services[serviceName] || {};

  if (services[serviceName][acctName]) { return services[serviceName][acctName]; }

  if (!credsForRole[acctName]) {
    acctInfo = acctInfo || readCredsFromEnv();

    if (!acctInfo[acctName]) {
      return;
    }

    const { acct, role } = acctInfo[acctName];

    // If we do not have the requested creds, just let the caller use the defaults
    if (!role)    { return credsForRole.dev; }

    const RoleSessionName   = `layer67CredsFor${acctName}`;
    const RoleArn           = 'arn:aws:iam::'+acct+':role/'+role;

    credsForRole[acctName] = credsForRole[acctName]        || new AWS.TemporaryCredentials({RoleArn, RoleSessionName});
  }

  AWS.config.credentials            = credsForRole[acctName];
  services[serviceName][acctName]   = services[serviceName][acctName]  || new AWS[serviceName](options);

  return services[serviceName][acctName];
};

_.each(lib, (value, key) => {
  exports[key] = value;
});

function readCredsFromEnv() {
  var   creds = sg.parseOn2Chars(process.env.JSAWS_AWS_ACCT_EXTRA_CREDS, ',', ':');

  _.defaults(creds, sg.parseOn2Chars(process.env.JSAWS_AWS_ACCTS, ',', ':'));

  var result = sg.reduce(creds, {}, (m, value, key) => {
    const [ acct, role ] = value.split('/');
    return sg.kv(m, key, {acct, role});
  });

  result.prod = result.pub;

  return result;
}

