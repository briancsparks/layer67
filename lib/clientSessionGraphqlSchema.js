
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

var lib = {};


//...
lib.addSechema = function(schema_) {
  var   schema = schema_ ||   {typeDefs: [], resolvers:{}};

  schema.typeDefs.push(`
type User {
  id: ID!
  email: String
}
type Client {
  id: ID!
  clientId: String!
  user:     User
}
type Session {
  id:         ID!
  sessionId:  String!
  client:     Client!
}
`);

  return schema;
};




_.each(lib, (value, key) => {
  exports[key] = value;
});

