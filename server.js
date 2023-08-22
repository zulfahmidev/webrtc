const express = require('express')
let minimist = require('minimist')
let path = require('path')
let kurento = require('kurento-client')
const app = express()
let http = require('http').createServer(app)
let io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
})
const cors = require('cors');

let kurentoClient = null
let iceCandidateQueues = {}

let argv = minimist(process.argv.slice(2), {
  default: {
    as_url: 'http://0.0.0.0:3000',
    // ws_uri: 'ws://localhost:8888/kurento',
    ws_uri: 'ws://34.101.228.110:8888/kurento',
  }
})

io.on('connection', socket => {
 socket.on('message', message => {
  switch (message.event) {
    case 'joinRoom':
      joinRoom(socket, message.userName, message.roomName, err => {
        if (err) {
          console.log(err)
        }
      })
      break
    case 'receiveVideoFrom':
      receiveVideoFrom(socket, message.userid, message.roomName, message.sdpOffer, err => {
        if (err) {
          console.log(err)
        }
      })
      break
    case 'candidate':
      addIceCandidate(socket, message.userid, message.roomName, message.candidate, err => {
        if (err) {
          console.log(err)
        }
      })
      break
  }
 })
})

function joinRoom(socket, username, roomname, callback) {
  getRoom(socket, roomname, (err, myRoom) => {
    if (err) {
      return callback(err)
    }
    myRoom.pipeline.create('WebRtcEndpoint', (err, outgoingMedia) => {
      if (err) {
        return callback(err)
      }

      let user = {
        id: socket.id,
        name: username,
        outgoingMedia: outgoingMedia,
        incomingMedia: {}
      }

      let iceCandidateQueue = iceCandidateQueues[user.id]

      if (iceCandidateQueue) {
        while (iceCandidateQueue.length) {
          let ice = iceCandidateQueue.shift()
          user.outgoingMedia.addIceCandidate(ice.candidate)
        }
      }

      user.outgoingMedia.onIceCandidate = event => {
        let candidate = kurento.register.complexTypes.iceCandidates(event.candidate)
        socket.emit('message', {
          event: 'candidate',
          userid: user.id,
          candidate: candidate
        })
      }

      socket.to(roomname).emit('message', {
        event: 'newParticipantArrived',
        userid: user.id,
        username: user.name
      })

      let existingUsers = []
      for (let i in myRoom.participants) {
        if (myRoom.participants[i].id != user.id) {
          existingUsers.push({
            id: myRoom.participants[i].id,
            name: myRoom.participants[i].name
          })
        }
      }

      socket.emit('message', {
        event: 'existingParticipants',
        existingUsers: existingUsers,
        userid: user.id
      })
      // if (existingUsers.length > 0) {
      // }

      // console.log(myRoom)
      myRoom.participants[user.id] = user
    })
  })
}

function getKurentoCLient(callback) {
  if (kurentoClient !== null) {
    return callback(null, kurentoClient)
  }
  let a = kurento(argv.ws_uri, (err, _kurentoClient) => {
    if (err) {
      return callback(err)
    }
    kurentoClient = _kurentoClient
    return callback(null, kurentoClient)
  })
}

function getRoom(socket, roomname, callback) {
  let myRoom = io.sockets.adapter.rooms.get(roomname)
  let numClients = (myRoom) ? myRoom.size : 0
  if (numClients == 0) {
    socket.join(roomname)
    myRoom = io.sockets.adapter.rooms.get(roomname)
    getKurentoCLient((err, kurento) => {
      if (err) {
        return callback(err)
      }
      kurento.create('MediaPipeline', (err, pipeline) => {
        myRoom.pipeline = pipeline
        myRoom.participants = {}
        return callback(null, myRoom)
      })
    })
  } else {
    socket.join(roomname)
    return callback(null, myRoom)
  }
}

function getEndpointForUser(socket, roomname, senderid, callback) {
  let myRoom = io.sockets.adapter.rooms.get(roomname)
  let asker = myRoom.participants[socket.id]
  let sender = myRoom.participants[senderid]
  if (asker.id === sender.id) {
    return callback(null, asker.outgoingMedia)
  }

  if (asker.incomingMedia[sender.id]) {
    sender.outgoingMedia.connect(asker.incomingMedia[sender.id], err => {
      if (err) {
        return callback(err)
      }
      return callback(null, asker.incomingMedia[sender.id])
    })
  } else {
    myRoom.pipeline.create('WebRtcEndpoint', (err, incoming) => {
      if (err) {
        return callback(err)
      }

      asker.incomingMedia[sender.id] = incoming

      let iceCandidateQueue = iceCandidateQueues[sender.id]
      if (iceCandidateQueue) {
        while (iceCandidateQueue.length) {
          let ice = iceCandidateQueue.shift()
          incoming.addIceCandidate(ice.candidate)
        }
      }

      incoming.onIceCandidate = event => {
        let candidate = kurento.register.complexTypes.IceCandidates(event.candidate)
        socket.emit('message', {
          event: 'candidate',
          userid: sender.id,
          candidate: candidate
        })
      }

      sender.outgoingMedia.connect(incoming, err => {
        if (err) {
          return callback(err)
        }
        return callback(null, incoming)
      })
    })
  }
}

function receiveVideoFrom(socket, userid, roomName, sdpOffer, callback) {
  getEndpointForUser(socket, roomName, userid, (err, endpoint) => {
    if (err) {
      return callback(err)
    }

    endpoint.processOffer(sdpOffer, (err, sdpAnswer) => {
      if (err) {
        return false;
      }

      socket.emit('message', {
        event: 'receiveVideoAnswer',
        senderid: userid,
        sdpAnswer: sdpAnswer
      })
      endpoint.gatherCandidates(err => {
        if (err) return callback(err)
      })
    })
  })
}

function addIceCandidate(socket, senderid, roomName, iceCandidate, callback) {
  let user = io.sockets.adapter.rooms.get(roomName).participants[socket.id]

  if (user != null) {
    let candidate = kurento.register.complexTypes.IceCandidate(iceCandidate)
    if (senderid == user.id) {
      if (user.outgoingMedia) {
        user.outgoingMedia.addIceCandidate(candidate)
      } else {
        iceCandidateQueues[user.id].push({candidate: candidate})
      }
    } else {
      if (user.incomingMedia[senderid]) {
        user.incomingMedia[senderid].addIceCandidate(candidate)
      } else {
        if (!iceCandidateQueues[senderid]) {
          iceCandidateQueues[senderid] = []
        }
        iceCandidateQueues[senderid].push({candidate: candidate})
      }
    }
    return callback(null)
  } else {
    return callback(new Error("addIceCandidate failed"))
  }
}

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
};

app.use(cors(corsOpts))

app.use(express.static(path.join(__dirname, 'public')))

http.listen(3000, () => {
  console.log('App listen at 3000')
})