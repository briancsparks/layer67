
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const layer67                 = sg.include('layer67') || require('layer67');
const express                 = require('express');
const bodyParser              = require('body-parser');
const {
    graphqlExpress,
    graphiqlExpress
  }                           = require('apollo-server-express');
const {
    makeExecutableSchema
  }                           = require('graphql-tools');

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;


var   namespace               = 'layer67';
const ip                      = ARGV.ip       || '127.0.0.1';
const port                    = ARGV.port     || 3000;
const stack                   = ARGV.stack    || null;

var   schema                  = {typeDefs: [], resolvers:{}};

schema.typeDefs.push(`
schema {
  query: Query
  mutation: Mutation
}`);

schema = require('../../lib/clientSessionGraphqlSchema').addSchema(schema);

/**
 * Finally, we construct our schema (whose starting query type is the query
 * type we defined above) and export it.
 */
//schema.typeDefs = [schema.typeDefs];
const schema = makeExecutableSchema(schema);



// Initialize the app
const app = express();

// The GraphQL endpoint
app.use(`/${namespace}/graphql`, bodyParser.json(), graphqlExpress({ schema }));

// GraphiQL, a visual editor for queries
app.use(`/${namespace}/graphiql`, graphiqlExpress({ endpointURL: `/${namespace}/graphql` }));

// Start the server
app.listen(port, () => {
  console.log(`Go to http://localhost:3000/${namespace}/graphiql to run queries!`);

  tell();
  function tell() {
    setTimeout(tell, 15000);

    layer67.tellStackService(`/${namespace}/graphql`, `http://${ip}:${port}`, 30000, stack, function(err) {
      layer67.tellStackService(`/${namespace}`, `http://${ip}:${port}`, 30000, stack, function(err) {
      });
    });
  }
});

