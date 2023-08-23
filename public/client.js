let divRoomSelection = document.querySelector('#roomSelection')
let divMeetingRoom = document.querySelector('#meetingRoom')
let inputRoom = document.querySelector('#room')
let inputName = document.querySelector('#name')
let btnRegister = document.querySelector('#register')


let roomName
let userName
let participants = {}

let socket = io()

btnRegister.onclick = () => {
  roomName = inputRoom.value
  userName = inputName.value

  if (roomName === '' || userName === '') {
    alert('Room and name are required')
  } else {
    let message = {
      event: 'joinRoom',
      userName: userName,
      roomName: roomName
    }
    sendMessage(message)
    divRoomSelection.style = 'display:none;'
    divMeetingRoom.style = 'display:block;'
  }
}

socket.on('message', message => {
  console.log('Message arrived', message.event)
  
  switch (message.event) {
    case 'newParticipantArrived':
      receiveVideo(message.userid, message.username)
      break
    case 'existingParticipants':
      onExisttingParticipants(message.userid, message.existingUsers)
      break
    case 'receiveVideoAnswer':
      onReceiveVideoAnswer(message.senderid, message.sdpAnswer)
      break
    case 'candidate':
      addIceCandidate(message.userid, message.candidate)
  }
})

function sendMessage(message) {
  socket.emit('message', message)
}

function receiveVideo(userid, username) {
  let video = document.createElement('video')
  let div = document.createElement('div')
  div.className = 'videoContainer'
  let name = document.createElement('div')
  video.id = userid
  video.autoplay = true
  name.appendChild(document.createTextNode(username))
  div.appendChild(video)
  div.appendChild(name)
  divMeetingRoom.appendChild(div)

  let user = {
    id: userid,
    username: username,
    video: video,
    rtcPeer: null,
  }

  participants[user.id] = user
  let constraints = {
    audio: false,
    video: {
      mandatory: {
        maxWidth: 328,
        maxFrameRate: 15,
        minFrameRate: 15
      }
    }
  }

  console.log('e')
  let options = {
    // localVideo: video,
    remoteVideo: video,
    onicecandidate: onIceCandidate,
    mediaConstraints: constraints
  }
  user.rtcPeer = new kurentoUtils.WebRtcPeerRecvonly(options, function(err) {
    console.log('f')
    if (err) {
      console.log('g')
      return console.log(err)
    }
    user.rtcPeer.generateOffer(onOffer)
  })

  function onOffer(err, offer, wp) {
    console.log('h')
    let message = {
      event: 'receiveVideoFrom',
      userid: user.id,
      roomName: roomName,
      sdpOffer: offer
    }
    sendMessage(message)
  }

  function onIceCandidate(candidate, wp) {
    console.log('a candidate')
    let message = {
      event: 'candidate',
      userid: user.id,
      roomName: roomName,
      candidate: candidate
    }

    sendMessage(message)
  }
}

function onExisttingParticipants(userid, existingUsers) {
  let video = document.createElement('video')
  let div = document.createElement('div')
  div.className = 'videoContainer'
  let name = document.createElement('div')
  video.id = userid
  video.autoplay = true
  name.appendChild(document.createTextNode(userName))
  div.appendChild(video)
  div.appendChild(name)
  divMeetingRoom.appendChild(div)

  let user = {
    id: userid,
    username: userName,
    video: video,
    rtcPeer: null,
  }

  participants[user.id] = user

  let constraints = {
    audio: true,
    video: {
      mandatory: {
        maxWidth: 328,
        maxFrameRate: 15,
        minFrameRate: 15
      }
    }
  }

  let options = {
    localVideo: video,
    // remoteVideo: video,
    sendSource: 'window',
    onicecandidate: onIceCandidate,
    mediaConstraints: constraints
  }

  console.log('a')
  user.rtcPeer = new kurentoUtils.WebRtcPeerSendonly(options, function(err) {
    console.log('b')
    if (err) {
      console.log('c')
      return console.log(err)
    }
    
    user.rtcPeer.generateOffer(onOffer)
  })

  existingUsers.forEach(element => {
    receiveVideo(element.id, element.name)
  });

  function onOffer(err, offer, wp) {
    console.log('d')
    let message = {
      event: 'receiveVideoFrom',
      userid: user.id,
      roomName: roomName,
      sdpOffer: offer
    }
    sendMessage(message)
  }

  function onIceCandidate(candidate, wp) {
    console.log('b candidate')
    let message = {
      event: 'candidate',
      userid: user.id,
      roomName: roomName,
      candidate: candidate
    }

    sendMessage(message)
  }
}

function onReceiveVideoAnswer(senderid, sdpAnswer) {
    console.log('answer')
  // console.log(participants[senderid])
  participants[senderid].rtcPeer.processAnswer(sdpAnswer)
}

function addIceCandidate(userid, candidate) {
  console.log('candidate')
  participants[userid].rtcPeer.addIceCandidate(candidate)
}