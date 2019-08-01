'use strict';

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;
var myNumber = prompt('Enter your Mobile Number');
var session;
var caller = document.getElementById('phone').value;
const hangButton = document.getElementById('endCall');
const callButton = document.getElementById('call');
const audioBtn = document.getElementById('muteAudio');
const videoBtn = document.getElementById('muteVideo');
const sendBtn = document.getElementById('send');
sendBtn.onclick = sendText;
audioBtn.onclick = toggleAudio;
videoBtn.onclick = toggleVideo;
callButton.onclick = makeCall;
hangButton.onclick = hangup;
var pcConfig = {
  'iceServers': [{
    'urls': 'stun:stun.l.google.com:19302'
  }]
};
var user=document.getElementById("user") ;
user.innerHTML= "Hi "+myNumber;
// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

/////////////////////////////////////////////

var socket = io.connect();

var detail = {};
var caller;
socket.on('receive/' + myNumber, function (detail) {
  var myModalLabel=document.getElementById("caller") ;

  caller=detail.myNumber;
  myModalLabel.innerHTML= caller;
  $('#myModal').modal('show');
  $("#modal-btn-si").on("click", function(){
    socket.emit('create or join', detail.room);
    console.log('$$$$$   JOINED IN ', detail.room);
  });
  
});

function makeCall() {
  detail.receiver = document.getElementById('phone').value;
  detail.room = randomRoom(5);
  detail.myNumber = myNumber;
  socket.emit('call', detail);
  socket.emit('create or join', detail.room);

  document.getElementById("call").style.display = "none";
  document.getElementById("mobile-input").style.display = "none";
  document.getElementById("local").style.display = "block";
  document.getElementById("muteAudio").style.display = "block";
  document.getElementById("endCall").style.display = "block";
  document.getElementById("muteVideo").style.display = "block";

}

function randomRoom(length) {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}


socket.on('created', function (room) {
  console.log('Created room ' + room);
  isInitiator = true;
});

socket.on('full', function (room) {
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room) {
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
  maybeStart();

});

socket.on('joined', function (room) {
  console.log('joined: ' + room);
  isChannelReady = true;
});

socket.on('log', function (array) {
  console.log.apply(console, array);
});

////////////////////////////////////////////////

function sendMessage(message) {

  socket.emit('message', message);
  console.log('Client sending message: ', message);
}

// This client receives a message
socket.on('message', function (message) {
  console.log("Receiving Global Messages", message)
  if (message.session == myNumber) {
    console.log('Client received message:', message);
    if (message.type === 'got user media') {
      maybeStart();
    } else if (message.type === 'offer') {
      if (!isInitiator && !isStarted) {
        maybeStart();
      }
      pc.setRemoteDescription(new RTCSessionDescription(message));
      doAnswer();
    } else if (message.type === 'answer' && isStarted) {
console.log("----ANSWER----",message)
      pc.setRemoteDescription(new RTCSessionDescription({
        "sdp":message.sdp,
        "type":message.type
      }));
      document.getElementById("remote").style.display = "block";
   
    } else if (message.type === 'candidate' && isStarted) {
      var candidate = new RTCIceCandidate({
        sdpMLineIndex: message.label,
        sdpMid: message.id,
        candidate: message.candidate
      });
      pc.addIceCandidate(candidate);
    } else if (message.type === 'bye' && isStarted) {
      handleRemoteHangup();
    } else if(message.type === 'textMessage'){
      console.log("Text Message Receicved")
      showReceivedMessage(message);
    }
  }
});

////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

var constraints = {
  audio: true,
  video: true
};


start(constraints);

function start(constraints) {
  navigator.mediaDevices.getUserMedia(constraints)
    .then(gotStream)
    .catch(function (e) {
      alert('getUserMedia() error: ' + e.name);
    });

  function gotStream(stream) {
    console.log('Adding local stream.');
    localStream = stream;
    localVideo.srcObject = stream;
    sendMessage({
      type: 'got user media'
    });
    if (isInitiator) {
      maybeStart();
    }
  }
  callButton.disabled = false;
}
console.log('Getting user media with constraints', constraints);

if (location.hostname !== 'localhost') {
  requestTurn(
    'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
  );
}

function maybeStart() {
  console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
  if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection();
    pc.addStream(localStream);
    isStarted = true;
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall();

    }
  }
}

window.onbeforeunload = function (){
  hangup();
};

/////////////////////////////////////////////////////////

function createPeerConnection() {
  try {
    pc = new RTCPeerConnection(null);
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;
    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    console.log("$$$$$$$$$$$$$$$candidate$$$$$$$$$$$$$$$", event.candidate.sdpMid);
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid, 
      candidate: event.candidate.candidate,
      session: session
    });
  } else {
    console.log('End of candidates.');
  }
}

function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

function doCall() {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
   session = caller;
  console.log('Sending answer to peer.');
  document.getElementById("local").style.display = "block";
  document.getElementById("remote").style.display = "block";
  
  document.getElementById("call").style.display = "none";
  document.getElementById("mobile-input").style.display = "none";
  document.getElementById("muteAudio").style.display = "block";
  document.getElementById("endCall").style.display = "block";
  document.getElementById("muteVideo").style.display = "block";


  pc.createAnswer().then(
    setLocalAndSendMessage,
    onCreateSessionDescriptionError
  );
}


function setLocalAndSendMessage(sessionDescription) {
  session = sessionDescription.type == 'answer' ? caller : detail.receiver;
  console.log("SESSION",session);
  
  var rName=document.getElementById("remote-name") ;
  rName.innerHTML= session + " Says.."
  sessionDescription.session = session
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage({
    "sdp": setMediaBitrates(sessionDescription.sdp),
    "type": sessionDescription.type,
    "session": session
  });
  document.getElementById("chat-body").innerHTML = "";
  document.getElementById("chat-box").style.display = "block";
}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

function requestTurn(turnURL) {
  var turnExists = false;
  for (var i in pcConfig.iceServers) {
    if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log('Getting TURN server from ', turnURL);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4 && xhr.status === 200) {
        var turnServer = JSON.parse(xhr.responseText);
        console.log('Got TURN server: ', turnServer);
        pcConfig.iceServers.push({
          'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open('GET', turnURL, true);
    xhr.send();
  }
}

function handleRemoteStreamAdded(event) {

  callButton.disabled = true;
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
  console.log('Remote stream added.');
}

function handleRemoteStreamRemoved(event) {

  console.log('Remote stream removed. Event: ', event);
}

function toggleAudio() {
  const audioTrack = localStream.getAudioTracks()
  audioTrack[0].enabled = !audioTrack[0].enabled

  if (audioTrack[0].enabled) {
    audioBtn.classList.add('fa-microphone-alt');
    audioBtn.classList.remove('fa-microphone-alt-slash');
  } else {
    audioBtn.classList.remove('fa-microphone-alt');
    audioBtn.classList.add('fa-microphone-alt-slash');
  }
  audioBtn.classList.toggle('active');
}

function toggleVideo() {

  const videoTrack = localStream.getVideoTracks()
  videoTrack[0].enabled = !videoTrack[0].enabled

  if (videoTrack[0].enabled) {
    videoBtn.classList.add('fa-video');
    videoBtn.classList.remove('fa-video-slash');
  } else {
    videoBtn.classList.remove('fa-video');
    videoBtn.classList.add('fa-video-slash');
  }
  videoBtn.classList.toggle('active');
}

function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage({
    type: "bye",
    session: session
  });
  callButton.disabled = false;
}

function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  isInitiator = false;
}

function stop() {
  document.getElementById("local").style.display = "none";
  document.getElementById("call").style.display = "block";
  document.getElementById("mobile-input").style.display = "block";
  document.getElementById("remote").style.display = "none";
  document.getElementById("chat-box").style.display = "none";
  document.getElementById("muteAudio").style.display = "none";
  document.getElementById("endCall").style.display = "none";
  document.getElementById("muteVideo").style.display = "none";
  isStarted = false;
  pc.close();
  pc = null;
}
var chatBody = document.getElementById('chat-body');
function sendText(){
  var msg = document.getElementById('text-chat').value;
  var dateobj = new Date(); 

  const offsetMs = dateobj.getTimezoneOffset() * 60 * 1000;
  const msLocal =  dateobj.getTime() - offsetMs;
  const dateLocal = new Date(msLocal);
  const iso = dateLocal.toISOString();
  const isoLocal = iso.slice(0, 19);
 

  var dateStr = isoLocal; 
console.log("%%%%%%%%%%%%%%%%%||DATE||"+dateStr);
  sendMessage({
    type:"textMessage",
    session:session,
    message:msg,
    from:myNumber,
    time:dateStr
  });
  var node = document.createElement("DIV");
  node.setAttribute("id", "my-msg");
  node.setAttribute("class","d-flex justify-content-end mb-4 msg_cotainer_send");
  var textnode = document.createTextNode(msg);
  node.appendChild(textnode);
  chatBody.appendChild(node);
  document.getElementById("text-chat").value = "";
  chatBody.scrollTop = chatBody.scrollHeight;

}

function showReceivedMessage(message){
  var node = document.createElement("DIV");
  node.setAttribute("id", "recvd-msg");
  node.setAttribute("class","d-flex justify-content-start mb-4 msg_cotainer");
  var textnode = document.createTextNode(message.message);
  node.appendChild(textnode);
  chatBody.appendChild(node);
  
  chatBody.scrollTop = chatBody.scrollHeight;
}


function setMediaBitrates(sdp) {
  return setMediaBitrate(setMediaBitrate(sdp, "video", 500), "audio", 50);
}

function setMediaBitrate(sdp, media, bitrate) {
  var lines = sdp.split("\n");
  var line = -1;
  for (var i = 0; lines.length; i++) {
    if (lines[i].indexOf("m="+media) === 0) {
      line = i;
      break;
    }
  }
  if (line === -1) {
    console.debug("Could not find the m line for", media);
    return sdp;
  }
  console.debug("Found the m line for", media, "at line", line);

  // Pass the m line
  line++;

  // Skip i and c lines
  while(lines[line].indexOf("i=") === 0 || lines[line].indexOf("c=") === 0) {
    line++;
  }

  // If we're on a b line, replace it
  if (lines[line].indexOf("b") === 0) {
    console.debug("Replaced b line at line", line);
    lines[line] = "b=AS:"+bitrate;
    return lines.join("\n");
  }
  
  // Add a new b line
  console.debug("Adding new b line before line", line);
  var newLines = lines.slice(0, line)
  newLines.push("b=AS:"+bitrate)
  newLines = newLines.concat(lines.slice(line, lines.length))
  return newLines.join("\n")
}