
/**
 *
 */
import { merge }              from 'lodash';
import {
    makeExecutableSchema
  }                           from 'graphql-tools';
import {
    MongoClient, ObjectID
  }                           from 'mongodb';

import Client                 from './client';
import {
    resolvers as clientResolvers
  }                           from './client';


const Query = `
  type Query {
    aNumber: Int
  }
`;

const SchemaDefinition = `
  schema {
    query: Query
  }
`;

//console.log(Client);
const schema = makeExecutableSchema({
  typeDefs: [
    SchemaDefinition, Query,
    ...Client
  ],

  resolvers : merge(clientResolvers)
});

let mongo;

async function theContext(req, secrets) {
//  console.log({headers, secrets}, arguments);
  if (!mongo) {
    mongo = await MongoClient.connect('mongodb://10.12.21.229:27017/layer67');
  }

  return { mongo: mongo.db('layer67') };
}


export default async function(req) {

  const context = await theContext(req, process.env);

  return {
    schema,
    context
  }
}


