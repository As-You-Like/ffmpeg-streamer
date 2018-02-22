'use strict';

//process.env.NODE_ENV = 'development';//force setting for now
const nodeEnv = process.env.NODE_ENV || 'production';

let port = normalizePort(process.env.PORT || '8181');

const portRange = port + 10;
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io').listen(server);
const path = require('path');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
//const debug = require('debug')('ip-cam-tester:server');
const ejs = require('ejs');
const index = require('./routes/index');
const hls = require('./routes/hls');
const mp4 = require('./routes/mp4');
const mjpeg = require('./routes/mjpeg');
const progress = require('./routes/progress');
const assets = require('./routes/assets');
const jpegSocket = require('./sockets/jpeg')(app, io);
const mseSocket = require('./sockets/mse')(app, io);

app.set('env', nodeEnv);
app.set('port', port);
app.set('io', io);
app.set('jpegSocket', jpegSocket);
app.set('mseSocket', mseSocket);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

if (nodeEnv === 'development') {
    app.use(logger('dev'));//logs all requests to console
}
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use('/', index);
app.use('/hls', hls);
app.use('/mp4', mp4);
app.use('/mjpeg', mjpeg);
app.use('/progress', progress);
app.use('/assets', assets);
app.use(express.static(path.join(__dirname, 'public')));

app.use(function(req, res, next) {
  const err = new Error('Not Found');
  console.error(`${req.url} not found.`);
  err.status = 404;
  next(err);
});

app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        status: err.status,
        stack: nodeEnv === 'development' ? err.stack : ''
    });
    if (nodeEnv === 'development') {
        console.error(err);
    }
});

if (nodeEnv === 'development') {
    app.use(logger('dev'));
}

/*debugging paths in pkg*/
/*console.log(__filename);
console.log(__dirname);
console.log(process.cwd());
console.log(process.execPath);
console.log(process.argv[0]);
console.log(process.argv[1]);
if (process.pkg) {
    console.log(process.pkg.entrypoint);
    console.log(process.pkg.defaultEntrypoint);
}
console.log(require.main.filename);
console.log(path.dirname(process.execPath));*/

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

function normalizePort(val) {
    const port = parseInt(val, 10);
    if (isNaN(port)) {
        return val;
    }
    if (port >= 0) {
        return port;
    }
    return false;
}

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }
    const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(`${bind} is already in use.`);
            if (typeof port === 'string' || port >= portRange) {
                process.exit(1);
            }
            console.log(`Incrementing to port ${++port} and trying again.`);
            server.listen(port);
            break;
        default:
            throw error;
    }
}

function onListening() {
    const addr = server.address();
    const bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;
    console.log(`Listening on ${bind}.`);
}

module.exports = app;