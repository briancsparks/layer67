
/**
 *
 */
import User                   from './user';
import _                      from 'lodash';

const Client = [`
  type Client {
    id:       ID!
    clientId: String!
    user:     User
  }
`,`
  extend type Query {
    client(clientId: String!): Client
  }
`];

export default [...Client, User];

function fromMongo(item) {
  if (!item)  { return item; }

  return _.extend({}, item, {id: item._id.toString()});
}

const resolvers = {
  Query : {
    client: async (obj, args, context, info) => {
      console.log({obj, args, context});

      const { clientId } = args;
      const result = await context.mongo.collection('clients').findOne({clientId});
      return fromMongo(result);
    }
  },

  Client : {
  }
};

export { resolvers };


