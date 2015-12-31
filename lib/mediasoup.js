'use strict';

const process = require('process');

const logger = require('./logger')();
const utils = require('./utils');
const Server = require('./Server');

// Set of Server instances
let servers = new Set();

module.exports =
{
	/**
	 * Create a Server instance
	 * @param  {Object} options  Server options
	 * @param  {Number} options.numWorkers  Number of child workers
	 *   - Default: number of CPU cores
	 * @param  {String} options.logLevel  Log level
	 *   - Values: 'debug' / 'warn' / 'error'
	 *   - Default 'debug'
	 * @param  {String|Boolean} options.rtcListenIPv4  IPv4 for RTC
	 *   - Values: IPv4 / true (auto-detect), false (disable)
	 *   - Default: true
	 * @param  {String|Boolean} options.rtcListenIPv6  IPv6 for RTC
	 *   - Values: IPv6 / true (auto-detect), false (disable)
	 *   - Default: true
	 * @param  {Number} options.rtcMinPort  Min RTC port
	 *   - Default: 10000
	 * @param  {Number} options.rtcMaxPort  Max RTC port
	 *   - Default: 59999
	 * @param  {String} options.dtlsCertificateFile  Path to DTLS certificate
	 * @param  {String} options.dtlsPrivateKeyFile  Path to DTLS private key
	 * @return {Server}
	 */
	Server: function(options)
	{
		logger.debug('Server() [options:%o]', options);

		options = utils.cloneObject(options);

		let server = new Server(options);

		// Store the Server instance and remove it when closed
		servers.add(server);
		server.once('close', () => servers.delete(server));

		return server;
	}
};

// On process exit close all the Servers
process.on('exit', () =>
{
	servers.forEach((server) => server.close());
});