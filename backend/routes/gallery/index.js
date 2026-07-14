const registerEventRoutes = require('./events');
const registerPhotoRoutes = require('./photos');
const registerFaceRoutes = require('./faces');
const registerPublicRoutes = require('./public');
const registerClientRoutes = require('./client');

module.exports = async function galleryRoutes(fastify, opts) {
  await fastify.register(registerEventRoutes, opts);
  await fastify.register(registerPhotoRoutes, opts);
  await fastify.register(registerFaceRoutes, opts);
  await fastify.register(registerPublicRoutes, opts);
  await fastify.register(registerClientRoutes, opts);
};
