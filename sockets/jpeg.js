'use strict'

const {Writable} = require('stream')
const namespace = '/jpeg'

module.exports = (app, io) => {
  io
    .of(namespace)
    .on('connection', (socket) => {
      const pipe2jpeg = app.get('pipe2jpeg')

      if (!pipe2jpeg) {
        socket.disconnect()
        return
      }

      if (pipe2jpeg.jpeg) {
        socket.emit('jpeg', pipe2jpeg.jpeg)
      }

      const writable = new Writable({
        write (chunk, encoding, callback) {
          socket.emit('jpeg', chunk)
          callback()
        }
      })

      pipe2jpeg.pipe(writable)

      socket.once('disconnect', () => {
        if (pipe2jpeg && writable) {
          pipe2jpeg.unpipe(writable)
        }
      })
    })
}
