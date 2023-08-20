const express = require('express')
const app = express()
const cors = require('cors')

const http = require('http').createServer(app)
const io = require('socket.io')(http)

const port = 8080

io.on('connection', socket => {
  console.log(socket.id)
})

const corsOpts = {
  origin: '*',
  optionSuccessStatus: 200,
  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ],
  allowedHeaders: [
    'Content-Type',
    'id_client',
    'token_client'
  ],
}

app.use(cors(corsOpts))

app.listen(port, () => {
  console.log('app started!')
})