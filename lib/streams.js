'use strict'

const Transform = require('stream').Transform
const Duplex = require('stream').Duplex
const Writable = require('stream').Writable
const Readable = require('stream').Readable

const robot = require('robotjs')
const objectify = require('./objectify')
const mappers = require('./mappers')

let streams = []

const track = (stream) => {
    // when this stream is piped into
    stream.on('pipe', src => {
        // from a Transform
        if (src instanceof Transform || src instanceof Readable) {
            // then track it to unpipe it with others
            streams.push(src)
        }
    })

    streams.push(stream)
    return stream
}

module.exports = {
    unpipeAll() {
        streams.forEach(s => s.unpipe())
        streams = []
    },

    // SOURCES
    // manual source
    from(...args) {
        const input = [].concat(...args)
        return new Readable({
            objectMode: true,
            read() {
                const next = objectify(input.shift())
                setTimeout(() => {
                    input.push(next)
                    this.push(next)
                }, 10) // prevent unstoppable runs
            }
        })
    },


    // WRITERS (Duplex to support reading if chained)
    // write notes to REPL
    get toRepl() {
        return track(
            new Duplex({
                objectMode: true, // drops hwm to 16
                read() {},
                write(chunk, encoding, callback) {
                    const note = chunk.input.replace(/^(.)\#/,'$1s')
                    // use typeString over stdout as the latter won't allow the user
                    // to delete as though they entered the text themselves
                    robot.typeString(`${note}, `)

                    callback(null, chunk)
                    this.push(chunk)
                }
            })
        )
    },

    // write notes to the console
    get toLogger() {
        return track(
            new Duplex({
                objectMode: true, // drops hwm to 16
                read() {},
                write(chunk, encoding, callback) {
                    mappers.log(chunk)
                    callback(null, chunk)
                    this.push(chunk)
                }
            })
        )
    },

    // write notes to audio channel
    get toAudio() {
        return track(
            new Duplex({
                objectMode: true, // drops hwm to 16
                read() {},
                write(chunk, encoding, callback) {
                    try {
                        chunk = mappers.play(chunk)
                    } catch (e) {
                        return callback(e)
                    }
                    callback(null, chunk)
                    this.push(chunk)
                }
            })
        )
    },

    // write notes to a text-based piano
    get toPiano() {
        return track(
            new Duplex({
                objectMode: true, // drops hwm to 16
                read() {},
                write(chunk, encoding, callback) {
                    const drawnPiano = mappers.piano(chunk)

                    const push = this.push.bind(this)

                    // only allow reads once the piano is drawn
                    drawnPiano.pipe(new Writable({
                        write() {
                            callback(null, chunk)
                            push(chunk)
                        }
                    }))
                }
            })
        )
    },

    // TRANSFORMS
    // instrument transform - play notes through this instrument
    on(instrument) {
        const transform = mappers.instrument(instrument)
        return new Transform({
            objectMode: true,
            transform(chunk, encoding, callback) {
                callback(null, transform(chunk))
            }
        })
    },

    // stream factory that emits chunks over a given interval series (cycling through)
    delay(...args) {
        let started
        const intervals = [].concat(...args)
        return new Transform({
            objectMode: true,
            transform(chunk, encoding, callback) {
                if (!started) {
                    started = true
                    callback(null, chunk)
                } else {
                    const lastInterval = intervals.shift()
                    setTimeout(() => {
                        callback(null, chunk)
                    }, lastInterval)
                    intervals.push(lastInterval)
                }
            }
        })
    }
}
