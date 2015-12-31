'use strict';

const os = require('os');
const path = require('path');
const EventEmitter = require('events').EventEmitter;
const check = require('check-types');

const logger = require('./logger')('Server');
const utils = require('./utils');
const errors = require('./errors');
const Worker = require('./Worker');

const DEFAULT_NUM_WORKERS = Object.keys(os.cpus()).length;
const VALID_WORKER_PARAMETERS =
[
	'logLevel', 'rtcListenIPv4', 'rtcListenIPv6',	'rtcMinPort', 'rtcMaxPort',
	'dtlsCertificateFile', 'dtlsPrivateKeyFile'
];

class Server extends EventEmitter
{
	constructor(options)
	{
		logger.debug('constructor() [options:%o]', options);

		super();

		let serverId = utils.randomString();
		let numWorkers = DEFAULT_NUM_WORKERS;
		let parameters = [];

		// Set of Worker instances
		this._workers = new Set();

		// Closed flag
		this._closed = false;

		// Normalize some options

		if (check.integer(options.numWorkers) && check.positive(options.numWorkers))
			numWorkers = options.numWorkers;

		if (options.rtcListenIPv4 === null || options.rtcListenIPv4 === undefined)
			delete options.rtcListenIPv4;

		if (options.rtcListenIPv6 === null || options.rtcListenIPv6 === undefined)
			delete options.rtcListenIPv6;

		if (!check.greaterOrEqual(options.rtcMinPort, 1024))
			options.rtcMinPort = 10000;

		if (!check.lessOrEqual(options.rtcMaxPort, 65535))
			options.rtcMaxPort = 59999;

		if (check.nonEmptyString(options.dtlsCertificateFile))
			options.dtlsCertificateFile = path.resolve(options.dtlsCertificateFile);

		if (check.nonEmptyString(options.dtlsPrivateKeyFile))
			options.dtlsPrivateKeyFile = path.resolve(options.dtlsPrivateKeyFile);

		for (let key of Object.keys(options))
		{
			if (check.includes(VALID_WORKER_PARAMETERS, key))
				parameters.push(`--${key}=${String(options[key])}`);
		}

		// Create Worker instances
		for (let i = 1; i <= numWorkers; i++)
		{
			let worker;
			let workerId = serverId + '#' + i;
			let workerParameters = parameters.slice(0);

			// Distribute RTC ports for each worker

			let rtcMinPort = options.rtcMinPort;
			let rtcMaxPort = options.rtcMaxPort;
			let numPorts = Math.floor((rtcMaxPort - rtcMinPort) / numWorkers);

			rtcMinPort = rtcMinPort + (numPorts * (i - 1));
			rtcMaxPort = rtcMinPort + numPorts;

			if (rtcMinPort % 2 !== 0)
				rtcMinPort++;

			if (rtcMaxPort % 2 === 0)
				rtcMaxPort--;

			workerParameters.push(`--rtcMinPort=${rtcMinPort}`);
			workerParameters.push(`--rtcMaxPort=${rtcMaxPort}`);

			// Create a Worker instance
			worker = new Worker(workerId, workerParameters);

			// Store the Worker instance and remove it when closed
			// Also, if it is the latest Worker then close the Server
			this._workers.add(worker);
			worker.once('close', (error) =>
			{
				this._workers.delete(worker);

				if (this._workers.size === 0 && !this._closed)
				{
					logger.debug('latest Worker closed [error:%s]', error);

					this.close(error);
				}
			});
		}
	}

	/**
	 * Close the Server
	 */
	close(error)
	{
		if (!error)
			logger.debug('close()');
		else
			logger.error('close() [error:%s]', error);

		if (this._closed)
			return;

		this._closed = true;

		// Close every Worker
		this._workers.forEach((worker) => worker.close());

		this.emit('close', error);
	}

	/**
	 * Dump the Server
	 * @return {Promise}
	 */
	dump()
	{
		logger.debug('dump()');

		if (this._closed)
			return Promise.reject(errors.Closed('server closed'));

		let promises = [];

		this._workers.forEach((worker) =>
		{
			promises.push(worker.dump());
		});

		return Promise.all(promises)
			.then((datas) =>
			{
				let json =
				{
					workers : {}
				};

				for (let data of datas)
				{
					for (let workerId of Object.keys(data))
					{
						json.workers[workerId] = data[workerId];
					}
				}

				return json;
			});
	}

	/**
	 * Update Server settings
	 * @param  {Object} options  Object with modified settings
	 * @return {Promise}
	 */
	updateSettings(options)
	{
		logger.debug('updateSettings() [options:%o]', options);

		if (this._closed)
			return Promise.reject(errors.Closed('server closed'));

		options = utils.cloneObject(options);

		let promises = [];

		this._workers.forEach((worker) =>
		{
			promises.push(worker.updateSettings(options));
		});

		return Promise.all(promises);
	}

	/**
	 * Create a Room
	 * @param  {Object} options  Room options
	 * @return {Promise}
	 */
	createRoom(options)
	{
		logger.debug('createRoom() [options:%o]', options);

		if (this._closed)
			return Promise.reject(errors.Closed('server closed'));

		options = utils.cloneObject(options);

		let worker = this._getRandomWorker();

		return worker.createRoom(options);
	}

	_getRandomWorker()
	{
		let array = Array.from(this._workers);

		return array[array.length * Math.random() << 0];
	}
}

module.exports = Server;