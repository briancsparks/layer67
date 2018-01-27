
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const helpers                 = require('./db');
const AWS                     = require('aws-sdk');

const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;
const query                   = helpers.query_;

const dynamoDb                = new AWS.DynamoDB({region: 'us-east-1'});

var lib = {};


lib.update = function(keyish_, expression, values, callback) {
  const keyish      = _.isString(keyish_) ? {key:keyish_} : keyish_;

  const ns          = argvGet(keyish, 'namespace,ns') || process.env.NAMESPACE;
  const key         = argvGet(keyish, 'key');

  var   updates = {};

  updates.TableName     = `${ns}clusterDb`;
  updates.Key           = {id:{S:key}};
  updates.ReturnValues  = argvGet(argv, 'return-values') || 'UPDATED_NEW';

  updates.UpdateExpression = [];
  updates.ExpressionAttributeValues = {};
  _.each(values, (value, key) => {
    updates.UpdateExpression.push(`${key} = :${key}`);
    updates.ExpressionAttributeValues  = query({[':'+key] : sg.smartValue(value)});
  });

  updates.UpdateExpression = 'SET '+updates.UpdateExpression.join(', ');
  return dynamoDb.updateItem(updates, function(err, data) {
    if (!sg.ok(err, data))  { console.error(err); return callback(err); }

    return callback(null, data);
  });
};

lib.get = function(keyish_, context, callback) {

  const keyish      = _.isString(keyish_) ? {key:keyish_} : keyish_;

  const ns          = argvGet(keyish, 'namespace,ns') || process.env.NAMESPACE;
  const key         = argvGet(keyish, 'key');

  var query = {};
  query.TableName     = `${ns}clusterDb`;
  query.Key           = {id:{S:key}};

  return dynamoDb.getItem(query, callback);
};


_.each(lib, (value, key) => {
  exports[key] = value;
});

