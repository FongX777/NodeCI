const mongoose = require('mongoose');
const redis = require('redis')
const util = require('util')
const keys = require('../config/keys')

const client = redis.createClient(keys.redisUrl);

client.hget = util.promisify(client.hget);
const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = async function (options = {}) {
  this.useCache = true;
  this.hashKey = JSON.stringify(options.key || '');

  return this;
}

mongoose.Query.prototype.exec = async function () {
  if (!this.useCache) {
    return exec.apply(this, arguments)
  }
  // this = Query
  console.log('IM ABOUT TO RUN A QUERY');

  const key = JSON.stringify(Object.assign({}, this.getQuery(), {
    collection: this.mongooseCollection.name
  }));

  // See if we have a value for 'key' in redis
  const cacheValue = await client.hget(this.hashKey, key);

  // If we do, return that
  if (cacheValue) {
    const doc = JSON.parse(cacheValue)

    return Array.isArray(doc) 
      ? doc.map(d => new this.model(d))
      : new this.model(doc)
  }

  // Otherwise, issue the query and store the result in redis
  const result = await exec.apply(this, arguments);

  client.hset(this.hashKey, key, JSON.stringify(result), 'EX', '10')

  return result;
}

module.exports = {
  clearHash(hashKey) {
    client.del(JSON.stringify(hashKey))
  }
}

// console.log(this.getQuery());
// // { _id: xxxx }
// console.log(this.mongooseCollection.name);
// // user


/*
    const redis = require('redis')
    const redisUrl = 'redis://127.0.0.1:6379'
    const client = redis.createClient(redisUrl)
    const util = require('util')
    client.get = util.promisify(client.get)

    // Do we have any cached data in redis related
    // to thie query
    const cachedBlogs = await client.get(req.user.id)

    // if yes, then respond to the request right away
    // and return 
    if (cachedBlogs) {
      console.log('SERVING FROM CACHE');
      
      return res.send(JSON.parse(cachedBlogs))
    }

    // if no, we need to respond to request
    // and update our cache to store the data
    const blogs = await Blog.find({ _user: req.user.id });

    console.log('SERVING FROM MONGO DB');
    res.send(blogs);

    client.set(req.user.id, JSON.stringify(blogs))
    */